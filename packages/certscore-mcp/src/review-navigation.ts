/** Navigation over returned canonical projections only; never observation or finding eligibility. */
export const LIGHT_TOOL_NAMES = ["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle", "certscore_get_report_evidence_page"] as const;
export const REVIEW_PROMPT_NAMES = ["certscore_launch_review", "certscore_compare_scans", "certscore_remediation_checklist"] as const;
const SECTION_BY_KEY: Record<string, "tracking" | "gpc" | "consent" | "transport"> = { tracking: "tracking", gpc: "gpc", accept: "consent", reject: "consent", transport: "transport" };

export function bundleReviewNavigation(bundle: Record<string, any>) {
  if (!['completed', 'completed_limited'].includes(bundle.status) || bundle.resultDisposition === 'no_go') return null;
  const scanId = bundle.scanId;
  if (typeof scanId !== 'string') return null;
  const omitted: string[] = bundle.mcpMetadata?.omittedSections ?? [];
  const section = (key: string, label: string, value: unknown, omissions: string[] = [], counts?: { returned: number; total: number }) => ({
    key, label,
    delivery: value != null ? 'included' as const : omissions.some(name => omitted.includes(name)) ? 'omitted' as const : 'not_returned' as const,
    ...(counts ? counts : {}),
    ...(SECTION_BY_KEY[key] ? { retrieval: { tool: 'certscore_get_report_evidence_page' as const, arguments: { scanId, section: SECTION_BY_KEY[key] }, createsScan: false as const } } : {}),
  });
  const inventory = bundle.preConsentCookiesTrackers;
  const evidenceIndex = [
    section('findings', 'Canonical findings', bundle.findings, ['additionalFindings'], bundle.findingsMetadata ? { returned: bundle.findingsMetadata.returned, total: bundle.findingsMetadata.total } : undefined),
    section('tracking', 'Cookies, storage and vendors', inventory, ['preConsentCookiesTrackers'], inventory ? { returned: inventory.returned, total: inventory.total } : undefined),
    section('privacy', 'Privacy choices and notices', bundle.privacyAuditSummary, ['privacyAuditSummary']),
    section('gpc', 'GPC response', bundle.gpcResponse, ['gpcResponse']),
    section('accept', 'After Accept', bundle.postAcceptObservation, ['postAcceptObservation']),
    section('reject', 'After Reject', bundle.postRefusalObservation, ['postRefusalObservation']),
    section('transport', 'HTTPS/TLS', bundle.transportSecurity, ['transportSecurityDetail']),
    section('report', 'Report tables, policy and collection evidence', bundle.fullReport, ['fullReport']),
  ];
  const nextActions = [];
  if (inventory || bundle.privacyAuditSummary || bundle.gpcResponse || omitted.some(name => ['privacyAuditSummary', 'preConsentCookiesTrackers'].includes(name))) {
    nextActions.push({ tool: 'certscore_get_report_evidence_page', arguments: { scanId, workpaper: 'tracking' }, createsScan: false,
      reason: 'For an inventory, privacy-choice or GPC question, retrieve the retained tracking workpaper and JSON/CSV downloads.' });
  }
  nextActions.push({ tool: 'certscore_get_report_evidence_page', arguments: { scanId }, createsScan: false,
    reason: 'For deeper findings, policy, form or transport questions, retrieve the persisted report evidence; follow its cursor only as needed.' });
  return {
    version: 'certscore.mcp-review-navigation.v1' as const,
    scope: 'returned_canonical_projection' as const,
    baseline: { scanId, url: bundle.url ?? null, completedAt: bundle.completedAt ?? null, scanFrom: bundle.scanFrom ?? null, reportUrl: bundle.reportUrl ?? null },
    evidenceIndex,
    nextActions,
    optionalReview: (bundle.findings?.length ? 'Create a proposed remediation checklist from returned finding IDs, evidence and next steps. ' : '') +
      'Reuse this review for another user-selected site, or compare this baseline with a later explicitly requested fresh scan. Do not start unsolicited scans or treat missing later findings as verified fixes.',
    interpretation: 'Delivery describes this response, not whether evidence exists or a control is absent. Preserve each section’s coverage and limitations.',
  };
}
