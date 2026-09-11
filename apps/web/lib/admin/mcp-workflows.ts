import { mcpRequestDetailsSchema } from "@website-signal-risk-scanner/shared";

export type McpWorkflowEvent = {
  request_id?: string; event_id: string; occurred_at: string; session_id: string | null; scan_id: string | null;
  client_name: string | null; source: string; surface: string; tool_name: string;
  outcome: string; error_code: string | null; quota_outcome: string; duration_ms: number;
  scan_decision: string; scan_status: string | null; canonical_status: string | null;
  canonical_outcome: string | null; requested_resource: string | null; request_details?: unknown;
};

export function buildMcpWorkflows(events: McpWorkflowEvent[]) {
  const groups = new Map<string, McpWorkflowEvent[]>();
  for (const event of events) {
    // No cross-session joins on weak actor/IP bindings, or on shared public scan IDs.
    const key = JSON.stringify([event.surface, event.source, event.client_name, event.session_id ?? event.event_id, event.scan_id ?? event.event_id]);
    const rows = groups.get(key);
    if (rows) rows.push(event);
    else groups.set(key, [event]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    rows.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime() || a.event_id.localeCompare(b.event_id));
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    const details = rows.map(row => {
      const parsed = mcpRequestDetailsSchema.safeParse(row.request_details);
      return parsed.success ? parsed.data : null;
    });
    const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))];
    const scanRequest = rows.find(row => row.tool_name === "certscore_scan_site");
    const bundle = rows.find(row => row.tool_name === "certscore_get_scan_bundle" && row.outcome === "success");
    // A later reuse request can follow an earlier bundle read for the same scan.
    // Do not reinterpret that reversed sequence as an instantaneous conversion.
    const bundleGapMs = scanRequest && bundle
      ? new Date(bundle.occurred_at).getTime() - new Date(scanRequest.occurred_at).getTime() : null;
    const errors = rows.filter(row => row.outcome !== "success");
    const outcome = last.scan_id ? details.at(-1)?.response?.summary?.status ?? last.scan_status : null;
    const currentOutcome = last.canonical_outcome ?? last.canonical_status;
    const active = ["queued", "running", "finalizing"].includes(outcome ?? "");
    return {
      key, rows, details, first, last, scanRequest, bundle, outcome, currentOutcome,
      purposes: distinct(details.map(detail => detail?.taskContext?.purpose)),
      questions: distinct(details.map(detail => detail?.taskContext?.questionSummary ? `${detail.taskContext.questionSource === "user_wording" ? "User wording" : "Agent paraphrase"}: ${detail.taskContext.questionSummary}` : null)),
      integrations: distinct(details.map(detail => detail?.taskContext?.integrationId ? `${detail.taskContext.integrationId} @ ${detail.taskContext.integrationVersion ?? "version unknown"} · skill ${detail.taskContext.skillVersion ?? "unknown"}` : null)),
      clients: distinct(details.map(detail => detail?.clientVersion)),
      servers: distinct(details.map(detail => detail?.serverVersion)),
      schemas: distinct(details.map(detail => detail?.toolSchemaVersion)),
      errors: errors.length,
      friction: distinct(errors.map(row => row.error_code ?? row.outcome)),
      quotaHits: rows.filter(row => row.quota_outcome === "rate_limited").length,
      statusCalls: rows.filter(row => row.tool_name === "certscore_get_scan_status").length,
      bundleCalls: rows.filter(row => row.tool_name === "certscore_get_scan_bundle").length,
      truncatedResponses: details.filter(detail => detail?.response?.truncated === true).length,
      responseCoverage: details.filter(detail => detail?.response).length,
      stage: bundle ? "Bundle retrieved" : active ? "Scan active" : outcome && ["completed", "completed_limited", "completed_partial"].includes(outcome) ? "Completed; no bundle observed" : errors.length ? "Friction observed" : "No bundle observed",
      firstBundleSeconds: bundleGapMs !== null && Number.isFinite(bundleGapMs) && bundleGapMs >= 0 ? bundleGapMs / 1000 : null,
    };
  }).sort((a, b) => new Date(b.last.occurred_at).getTime() - new Date(a.last.occurred_at).getTime() || a.key.localeCompare(b.key));
}

export type McpWorkflow = ReturnType<typeof buildMcpWorkflows>[number];
