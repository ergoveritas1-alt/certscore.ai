/** Optional navigation over a completed canonical bundle. No reads, scans or findings. */
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

type FollowUp = {
  type: 'tool' | 'prompt' | 'offer';
  label: string;
  context: 'more_findings' | 'returned_findings' | 'tracking_inventory' | 'limited_coverage' | 'future_change';
  createsScan: boolean;
  requiresUserRequest: true;
  tool?: 'certscore_get_report_evidence_page';
  prompt?: 'certscore_remediation_checklist';
  arguments?: { scanId: string; workpaper?: 'tracking' };
};

function returnedReportUrl(bundle: Record<string, unknown>, scanId: string) {
  const value = bundle.reportUrl ?? record(bundle.links).report;
  if (typeof value !== 'string' || value.length > 1024 || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'certscore.ai' && !url.port && !url.username && !url.password
      && url.pathname === `/scan/${encodeURIComponent(scanId)}` ? value : null;
  } catch {
    return null;
  }
}

export function lightReviewActions(bundle: Record<string, unknown>) {
  const scanId = bundle.scanId;
  if (!['completed', 'completed_limited'].includes(String(bundle.status)) || bundle.resultDisposition === 'no_go'
    || typeof scanId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(scanId)) return null;

  const reportUrl = returnedReportUrl(bundle, scanId);
  const findings = Array.isArray(bundle.findings) ? bundle.findings : [];
  const findingMetadata = record(bundle.findingsMetadata);
  const inventory = record(bundle.preConsentCookiesTrackers);
  const moreFindings = findingMetadata.truncated === true || record(bundle.mcpMetadata).canonicalFindingsComplete === false;
  let followUp: FollowUp;
  if (moreFindings) {
    followUp = { type: 'tool', label: 'Review the remaining retained report evidence', context: 'more_findings',
      tool: 'certscore_get_report_evidence_page', arguments: { scanId }, createsScan: false, requiresUserRequest: true };
  } else if (findings.some(finding => typeof record(finding).id === 'string' && String(record(finding).id).trim())) {
    followUp = { type: 'prompt', label: 'Turn these findings into a developer checklist', context: 'returned_findings',
      prompt: 'certscore_remediation_checklist', arguments: { scanId }, createsScan: false, requiresUserRequest: true };
  } else if (typeof inventory.total === 'number' && inventory.total > 0 && !['evidence', 'full'].includes(String(bundle.detail))) {
    followUp = { type: 'tool', label: 'Inspect the retained tracking inventory and exports', context: 'tracking_inventory',
      tool: 'certscore_get_report_evidence_page', arguments: { scanId, workpaper: 'tracking' }, createsScan: false, requiresUserRequest: true };
  } else if (bundle.status === 'completed_limited') {
    followUp = { type: 'tool', label: 'Review the retained evidence and coverage limits', context: 'limited_coverage',
      tool: 'certscore_get_report_evidence_page', arguments: { scanId }, createsScan: false, requiresUserRequest: true };
  } else {
    // An offer only: no executable scan call until the user requests a future recheck.
    followUp = { type: 'offer', label: 'Compare a fresh scan after your next site change', context: 'future_change',
      createsScan: true, requiresUserRequest: true };
  }
  return {
    version: 'certscore.light-review-actions.v1' as const,
    ...(reportUrl ? { openReport: { type: 'open_url' as const, label: 'Open the full CertScore.ai report', url: reportUrl, createsScan: false as const } } : {}),
    followUp,
  };
}
