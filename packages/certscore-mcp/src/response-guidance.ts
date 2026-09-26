import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { transferResponseCapture } from './response-capture.js';

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const string = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.slice(0, 1000) : null;

const toolPurposes: Record<string, string> = {
  certscore_get_connection_status: "Check current access and quota without creating a scan.",
  certscore_scan_site: 'Start the requested public-website scan; latest may reuse an eligible result, refresh requests a new scan.',
  certscore_get_scan: 'Read one scan’s identity, lifecycle and overview without starting another scan.',
  certscore_get_scan_status: 'Check whether a scan is ready; follow the polling interval instead of repeatedly fetching reports.',
  certscore_get_report_evidence_page: 'Retrieve the complete report projection in bounded pages, preserving observation limitations.',
  certscore_get_report: 'Read the report in JSON or Markdown for the requested level of detail.',
  certscore_get_evidence: 'Inspect retained supporting evidence when the report summary is insufficient.',
  certscore_get_scan_bundle: 'Use this as the main completed-scan summary: score, findings, evidence and pre-consent inventory together.',
  certscore_export_findings: 'Export the returned canonical findings for downstream review or processing.',
  certscore_list_findings: 'Browse canonical findings in pages; use their exact IDs for explanations.',
  certscore_get_pre_consent_cookies_trackers: 'Inspect observed pre-consent inventory for this exact scan; unknown purpose is not proof of non-essential use.',
  certscore_explain_finding: 'Explain one returned finding and its reviewer action, grounded in retained evidence.',
  certscore_get_latest_domain_scan: 'Find an existing eligible domain scan before requesting new work when freshness is not required.',
  certscore_get_latest_domain_pre_consent_cookies_trackers: 'Read pre-consent inventory from the latest eligible domain scan without starting a new scan.',
};

/** Presentation metadata only: never derive findings, eligibility or quota from observations. */
export function withResponseGuidance(tool: string, input: unknown, result: CallToolResult, now = Date.now()): CallToolResult {
  if (result.isError || !result.structuredContent) return result;
  const args = record(input), payload = record(result.structuredContent);
  const scan = payload.scan === null ? {} : Object.keys(record(payload.scan)).length ? record(payload.scan) : payload;
  const summary = record(scan.summary), provenance = record(scan.provenance);
  const noGo = scan.resultDisposition === 'no_go' || payload.resultDisposition === 'no_go';
  const scanId = string(scan.scanId) ?? string(scan.scan_id) ?? string(args.scanId);
  const status = string(scan.status);
  const completedAt = string(scan.completedAt);
  const parsedTime = completedAt ? Date.parse(completedAt) : NaN;
  const ageSeconds = Number.isFinite(parsedTime) && parsedTime <= now ? Math.floor((now - parsedTime) / 1000) : null;
  const isCreation = tool === 'certscore_scan_site';
  const active = ['queued', 'running', 'finalizing'].includes(status ?? '');
  const ready = ['completed', 'completed_limited'].includes(status ?? '');
  const pagination = record(payload.pagination);
  const hasMore = pagination.truncated === true || pagination.complete === false;
  const nextOffset = hasMore && Number.isInteger(pagination.offset) && Number.isInteger(pagination.returned) && pagination.returned > 0
    ? pagination.offset + pagination.returned : null;
  let nextAction: Record<string, unknown> = { tool: null, arguments: null, instruction: 'Summarize the returned observations and coverage limitations.' };
  if (tool === 'certscore_get_connection_status') nextAction = { tool: null, arguments: null, instruction: string(record(payload.diagnostics).nextAction) ?? 'Review the connection diagnostics.' };
  else if (noGo) nextAction = { tool: null, arguments: null, instruction: string(scan.recommendedNextAction) ?? 'Review the retained no-go reason. Do not continue polling this scan.' };
  else if (scanId && active) nextAction = { tool: 'certscore_get_scan_status', arguments: { scanId }, retryAfterSeconds: scan.retryAfterSeconds ?? null, instruction: 'Wait for the returned polling interval before checking status.' };
  else if (scanId && ready && payload.resultDisposition !== 'no_go' && ['certscore_scan_site', 'certscore_get_scan', 'certscore_get_scan_status', 'certscore_get_latest_domain_scan'].includes(tool)) nextAction = { tool: 'certscore_get_scan_bundle', arguments: { scanId }, instruction: 'Fetch the report bundle to summarize this completed scan.' };
  else if (tool === 'certscore_get_report_evidence_page' && typeof pagination.nextCursor === 'string') nextAction = { tool, arguments: { scanId, cursor: pagination.nextCursor, ...(payload.workpaper === "tracking" ? { workpaper: "tracking" } : {}) }, instruction: 'Fetch the next report evidence page. Keep the same snapshot until export is complete.' };
  else if (tool === 'certscore_list_findings' && nextOffset !== null) nextAction = { tool, arguments: { scanId, offset: nextOffset, limit: pagination.limit }, instruction: 'Fetch the next page if more findings are needed.' };
  else if (payload.scan === null) nextAction = { tool: 'certscore_scan_site', arguments: null, instruction: 'No eligible retained scan was returned. Start a scan only if requested, using the intended public website URL.' };
  else if (['failed', 'cancelled', 'canceled', 'no_go'].includes(status ?? '') || payload.resultDisposition === 'no_go') nextAction = { tool: null, arguments: null, instruction: string(payload.recommendedNextAction) ?? 'Review the terminal error or no-go reason. Do not continue polling this scan.' };
  const actionCategory = tool === 'certscore_get_connection_status' ? 'review_connection'
    : nextAction.tool === 'certscore_get_scan_status' ? 'poll_status'
    : nextAction.tool === 'certscore_get_scan_bundle' ? 'get_bundle'
    : ['certscore_list_findings', 'certscore_get_report_evidence_page'].includes(String(nextAction.tool)) ? 'get_next_page'
    : nextAction.tool === 'certscore_scan_site' ? 'create_if_requested'
    : noGo || ['failed', 'cancelled', 'canceled', 'no_go'].includes(status ?? '') ? 'stop_review' : 'summarize';
  const findingIds = (Array.isArray(payload.findings) ? payload.findings : Array.isArray(payload.topFindings) ? payload.topFindings : [])
    .slice(0, 20).map((item: unknown) => string(record(item).id)).filter(Boolean);
  if (tool === 'certscore_explain_finding' && string(payload.id)) findingIds.push(string(payload.id));
  const guidance = {
    version: 'certscore.mcp-response-guidance.v1', tool, purpose: toolPurposes[tool] ?? null, scanId, status,
    score: typeof scan.score === 'number' ? scan.score : typeof summary.score === 'number' ? summary.score : null,
    risk: string(scan.riskLevel) ?? string(summary.riskLevel) ?? string(scan.risk) ?? string(summary.risk),
    coverage: string(scan.coverage) ?? string(record(scan.coverage).status),
    reportUrl: string(scan.reportUrl) ?? string(record(scan.links).report),
    retrieval: isCreation ? 'creation_response' : tool.includes('latest_domain') ? 'latest_eligible_domain_scan' : 'retained_result',
    creationDecision: isCreation ? string(provenance.creationDecision) ?? (payload.reused === true ? 'reused_scan' : 'unknown') : 'not_requested',
    quotaConsumed: typeof payload.quotaConsumed === 'boolean' ? payload.quotaConsumed : null,
    completedAt, ageSeconds, scanFrom: string(scan.scanFrom), findingIds,
    returnedRows: Array.isArray(payload.rows) ? payload.rows.length : Array.isArray(record(payload.preConsentCookiesTrackers).rows) ? payload.preConsentCookiesTrackers.rows.length : null,
    evidenceLimits: { truncated: record(payload.evidenceMetadata).truncated ?? record(payload.mcpMetadata).truncated ?? null, total: record(payload.evidenceMetadata).total ?? null, returned: record(payload.evidenceMetadata).returned ?? null },
    pagination: Object.keys(pagination).length ? { ...pagination, nextOffset, complete: !hasMore } : null,
    optionalFollowUps: !noGo && !active && scanId && findingIds.length ? [
      { tool: 'certscore_explain_finding', arguments: { scanId, findingId: findingIds[0] }, reason: 'Explain a returned finding using retained evidence.' },
      { prompt: 'certscore_remediation_checklist', arguments: { scanId }, reason: 'Prepare a proposed checklist; do not claim remediation is verified.' }
    ] : [],
    nextAction, actionCategory,
  };
  // Keep full machine metadata; avoid repeating the entire envelope in model-visible text.
  const compact = Object.fromEntries(Object.entries({
    scanId, status, score: guidance.score, risk: guidance.risk, reportUrl: guidance.reportUrl,
    quotaConsumed: guidance.quotaConsumed, nextAction,
    ...(guidance.pagination ? { pagination: guidance.pagination } : {})
  }).filter(([,value]) => value !== null));
  const overview = `CertScore guidance: ${JSON.stringify(compact)}`;
  const explanation = tool === 'certscore_explain_finding'
    ? `\nFinding: ${JSON.stringify({ id: string(payload.id), observation: string(payload.evidenceSummary) ?? string(record(payload.evidence).summary), interpretation: string(payload.plainEnglish), reviewerAction: string(payload.nextStep) })}` : '';
  return transferResponseCapture(result, {
    ...result,
    _meta: { ...result._meta, 'ai.certscore/responseGuidance': guidance },
    content: [...result.content, { type: 'text', text: overview + explanation }],
  });
}
