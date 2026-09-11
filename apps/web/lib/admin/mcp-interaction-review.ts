import { mcpRequestDetailsSchema, type McpRequestDetails } from "@website-signal-risk-scanner/shared";
import type { McpWorkflowEvent } from "./mcp-workflows";

const invalidCodes = new Set(["invalid_arguments", "invalid_scan_id", "invalid_url", "unknown_tool"]);
function argumentSignature(details: McpRequestDetails | null) {
  const input = details?.callerInput;
  if (!input || input.limits.length) return null;
  const fields = input.fields.filter(field => field.path.startsWith("arguments."));
  if (!fields.length || fields.some(field => field.disposition !== "retained" || field.value === undefined)) return null;
  return JSON.stringify(fields.map(field => [field.path, field.type, field.value]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

/** Descriptive adjacent-call observations, not proof of agent intent or user satisfaction. */
export function reviewMcpInteractions(events: McpWorkflowEvent[], followUpMinutes: number) {
  const rows = events.map(event => ({ event, details: (() => { const parsed = mcpRequestDetailsSchema.safeParse(event.request_details); return parsed.success ? parsed.data : null; })() }));
  const health = {
    total: rows.length,
    validRequestDetails: rows.filter(row => row.details).length,
    responseCaptured: rows.filter(row => row.details?.response?.summary).length,
    correlated: rows.filter(row => row.event.session_id).length,
    repeatedSessionCalls: 0,
    inputOmitted: rows.filter(row => row.details && (row.details.argumentsOmitted || row.details.callerInput?.limits.length || row.details.callerInput?.fields.some(field => field.disposition !== "retained"))).length,
    responseLimited: rows.filter(row => row.details?.response?.summary && (row.details.response.summary.textOmitted || row.details.response.summary.summaryTruncated)).length,
    timingCaptured: rows.filter(row => row.details?.timing).length,
  };
  const sequences = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.event.session_id) continue;
    const key = JSON.stringify([row.event.session_id, row.event.surface, row.event.source, row.event.client_name]);
    const group = sequences.get(key) ?? []; group.push(row); sequences.set(key, group);
  }
  health.repeatedSessionCalls = [...sequences.values()].filter(group => group.length > 1).reduce((sum, group) => sum + group.length, 0);
  const observations: { from: string; to: string; label: string }[] = [];
  const counts = { invalidFollowUps: 0, successesAfterInvalid: 0, changedInputsThenSuccess: 0, comparableErrorPairs: 0, repeatedSameError: 0, pollingPairs: 0, earlyPolls: 0, respectedDelay: 0, uncertainTiming: 0, nextToolPairs: 0, nextToolMatched: 0, bundleFollowUps: 0 };
  const windowMs = Math.max(1, Math.min(1440, followUpMinutes)) * 60_000;
  for (const group of sequences.values()) {
    group.sort((a, b) => Date.parse(a.details?.timing?.startedAt ?? a.event.occurred_at) - Date.parse(b.details?.timing?.startedAt ?? b.event.occurred_at) || a.event.event_id.localeCompare(b.event.event_id));
    for (let index = 0; index + 1 < group.length; index++) {
      const current = group[index]!, next = group[index + 1]!;
      const gap = Date.parse(next.event.occurred_at) - Date.parse(current.event.occurred_at);
      if (!Number.isFinite(gap) || gap <= 0 || gap > windowMs) continue;
      const a = current.event, b = next.event;
      const add = (label: string) => observations.push({ from: a.event_id, to: b.event_id, label });
      const responseAt = Date.parse(current.details?.timing?.responseGeneratedAt ?? "");
      const nextStartedAt = Date.parse(next.details?.timing?.startedAt ?? "");
      const overlap = Number.isFinite(responseAt) && Number.isFinite(nextStartedAt) && nextStartedAt < responseAt;
      const sameTool = a.tool_name === b.tool_name;
      const sameScan = Boolean(a.scan_id && a.scan_id === b.scan_id);
      if (!overlap && sameTool && (!a.scan_id || sameScan) && a.outcome === "error" && invalidCodes.has(a.error_code ?? "")) {
        counts.invalidFollowUps++;
        const before = argumentSignature(current.details), after = argumentSignature(next.details);
        if (b.outcome === "success" && !next.details?.response?.summary?.isError) {
          counts.successesAfterInvalid++; add("Next same-tool call succeeded after invalid input");
          if (before && after && before !== after) counts.changedInputsThenSuccess++;
        }
        if (before && after) {
          counts.comparableErrorPairs++;
          if (before === after && a.error_code === b.error_code && b.outcome === "error") { counts.repeatedSameError++; add("Same retained input and validation error repeated"); }
        }
      }
      const summary = current.details?.response?.summary;
      if (!overlap && sameScan && summary?.recommendedNextTool) {
        counts.nextToolPairs++;
        if (summary.recommendedNextTool === b.tool_name) {
          counts.nextToolMatched++; add("Next call matched the recommended tool");
          if (b.tool_name === "certscore_get_scan_bundle" && b.outcome === "success" && !next.details?.response?.summary?.isError) counts.bundleFollowUps++;
        }
      }
      if (sameScan && b.tool_name === "certscore_get_scan_status" && summary?.recommendedNextTool === "certscore_get_scan_status" && typeof summary.retryAfterSeconds === "number") {
        const finished = Date.parse(current.details?.timing?.responseGeneratedAt ?? "");
        const started = Date.parse(next.details?.timing?.startedAt ?? "");
        if (!Number.isFinite(finished) || !Number.isFinite(started)) continue;
        counts.pollingPairs++;
        const elapsed = started - finished, threshold = summary.retryAfterSeconds * 1000;
        // Overlap or a boundary within 250ms cannot establish delay compliance.
        if (elapsed < 0 || Math.abs(elapsed - threshold) <= 250) { counts.uncertainTiming++; continue; }
        if (elapsed < threshold) { counts.earlyPolls++; add("Status call started before the recorded retry delay"); }
        else counts.respectedDelay++;
      }
    }
  }
  return { health, counts, observations };
}
