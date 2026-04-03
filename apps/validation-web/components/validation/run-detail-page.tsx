import { notFound } from "next/navigation";
import { getValidationFindingFamily, type SignalEnrichmentWorkflowStageStatus } from "@website-signal-risk-scanner/shared";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getValidationRunDetail } from "../../server/validation/repository";
import { getScanById } from "../../server/scans/get-scan-by-id";
import { ValidationRunsAutoRefresh } from "./validation-runs-auto-refresh";

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function verdictTone(verdict: string | null | undefined) {
  if (verdict === "supported") {
    return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  }
  if (verdict === "not_supported") {
    return "border-rose-300/20 bg-rose-300/10 text-rose-100";
  }
  return "border-amber-300/20 bg-amber-300/10 text-amber-100";
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecordNumber(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getWorkflowStageTone(status: SignalEnrichmentWorkflowStageStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
    case "running":
      return "border-sky-300/20 bg-sky-300/10 text-sky-100";
    case "failed":
      return "border-rose-300/20 bg-rose-300/10 text-rose-100";
    case "blocked":
      return "border-amber-300/20 bg-amber-300/10 text-amber-100";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function formatWorkflowStageStatus(status: SignalEnrichmentWorkflowStageStatus) {
  switch (status) {
    case "completed":
      return "Completed";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "blocked":
      return "Blocked";
    default:
      return "Queued";
  }
}

function getLatestNanoDocRetrievalDiagnostics(events: Array<{ eventType: string; metadataJson: unknown }>) {
  const event = [...events].reverse().find((row) => row.eventType === "signals.nano_doc_retrieval_completed");
  const metadata = event?.metadataJson;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return {
    candidateCount: getRecordNumber(metadata, "candidateCount"),
    documentSourceCount: getRecordNumber(metadata, "documentSourceCount"),
    duplicateCount: getRecordNumber(metadata, "duplicateCount"),
    errorCount: getRecordNumber(metadata, "errorCount"),
    insufficientCount: getRecordNumber(metadata, "insufficientCount"),
    intermediaryCount: getRecordNumber(metadata, "intermediaryCount"),
    nonOkCount: getRecordNumber(metadata, "nonOkCount")
  };
}

export async function ValidationRunDetailPage(input: {
  scanDetail?: Awaited<ReturnType<typeof getScanById>> | null;
  scanId: string;
}) {
  const detail = await getValidationRunDetail(input.scanId);

  if (!detail) {
    notFound();
  }
  const shouldAutoRefresh = ["queued", "collecting", "ranking", "validating"].includes(String(detail.run.status ?? ""));

  const findingsByCategory = detail.findings.reduce(
    (counts, finding) => {
      const family = getValidationFindingFamily({
        category: safeString(finding.category),
        findingFamily: safeString(finding.finding_family),
        ruleKey: safeString(finding.rule_key),
        subtype: safeString(finding.subtype)
      });
      counts.set(family.label, (counts.get(family.label) ?? 0) + 1);
      return counts;
    },
    new Map<string, number>()
  );
  const categorySummary = [...findingsByCategory.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });

  return (
    <div className="space-y-8">
      <ValidationRunsAutoRefresh enabled={shouldAutoRefresh} />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">{String(detail.run.hostname)}</h1>
        <p className="text-sm text-slate-300">
          {String(detail.run.status)} · created {formatDateTime(detail.run.created_at as string)}
        </p>
      </div>

      <Card className="border-white/10 bg-white/5 text-slate-100">
        <CardHeader>
          <CardTitle>Run summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Mode</div>
            <div>{String(detail.run.trigger_mode)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Rank band</div>
            <div>{String(detail.run.rank_band ?? "—")}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Findings</div>
            <div>{String(detail.run.finding_count ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Reviewed findings</div>
            <div>{String(detail.run.reviewed_finding_count ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Average agreement</div>
            <div>{detail.run.average_agreement_score === null ? "—" : String(detail.run.average_agreement_score)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Started</div>
            <div>{formatDateTime(safeString(detail.run.started_at))}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Completed</div>
            <div>{formatDateTime(safeString(detail.run.completed_at))}</div>
          </div>
          <div className="md:col-span-2 xl:col-span-1">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">URL</div>
            <div className="truncate">{String(detail.run.normalized_url)}</div>
          </div>
        </CardContent>
      </Card>

      {detail.run.error_message ? (
        <Card className="border-rose-300/20 bg-rose-300/10 text-rose-50">
          <CardHeader>
            <CardTitle>Run failure</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-rose-100">{String(detail.run.error_message)}</CardContent>
        </Card>
      ) : null}

      {input.scanDetail?.signalEnrichmentWorkflow ? (
        <Card className="border-white/10 bg-white/5 text-slate-100">
          <CardHeader>
            <CardTitle>Signal enrichment workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const retrievalDiagnostics = getLatestNanoDocRetrievalDiagnostics(input.scanDetail?.events ?? []);
              return retrievalDiagnostics ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
                  <div className="font-medium text-white">Nano doc retrieval diagnostics</div>
                  <div className="mt-2 grid gap-2 md:grid-cols-4">
                    <div>Candidates: {retrievalDiagnostics.candidateCount ?? "—"}</div>
                    <div>Retained docs: {retrievalDiagnostics.documentSourceCount ?? "—"}</div>
                    <div>Duplicates dropped: {retrievalDiagnostics.duplicateCount ?? "—"}</div>
                    <div>Interstitial drops: {retrievalDiagnostics.intermediaryCount ?? "—"}</div>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <div>Insufficient docs: {retrievalDiagnostics.insufficientCount ?? "—"}</div>
                    <div>Non-OK fetches: {retrievalDiagnostics.nonOkCount ?? "—"}</div>
                    <div>Fetch/runtime errors: {retrievalDiagnostics.errorCount ?? "—"}</div>
                  </div>
                </div>
              ) : null;
            })()}
            <p className="text-sm text-slate-300">
              Scanner, nano, merge, and unified-finding derivation status for this scan.
            </p>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Preferred mode</div>
                <div>{input.scanDetail.signalEnrichmentWorkflow.preferredMode === "parallel_evidence_collection" ? "Parallel" : input.scanDetail.signalEnrichmentWorkflow.preferredMode}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Actual mode</div>
                <div>{input.scanDetail.signalEnrichmentWorkflow.actualMode === "parallelized" ? "Parallelized" : "Serial bridge"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Merged signals</div>
                <div>{input.scanDetail.signalEnrichmentWorkflow.mergedSignalsReady ? "Ready" : "Pending"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Findings</div>
                <div>{input.scanDetail.signalEnrichmentWorkflow.findingsReady ? "Ready" : "Pending"}</div>
              </div>
            </div>
            <div className="space-y-3">
              {input.scanDetail.signalEnrichmentWorkflow.stages.map((stage) => (
                <div key={stage.id} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-white">{stage.label}</div>
                    <Badge className={getWorkflowStageTone(stage.status)}>{formatWorkflowStageStatus(stage.status)}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-slate-300">{stage.description}</div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                    <div>Items: {typeof stage.itemCount === "number" ? stage.itemCount : "—"}</div>
                    <div>Started: {formatDateTime(stage.startedAt)}</div>
                    <div>Completed: {formatDateTime(stage.completedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-white/10 bg-white/5 text-slate-100">
        <CardHeader>
          <CardTitle>Validation findings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 overflow-x-auto">
          {detail.findings.length === 0 ? (
            <p className="text-sm text-slate-300">No validation findings were stored for this run.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categorySummary.map(([category, count]) => (
                <Badge key={category}>
                  {category} {count}
                </Badge>
              ))}
            </div>
          )}
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-3 pr-4 font-medium">Finding</th>
                <th className="pb-3 pr-4 font-medium">GPT-5.4 validation</th>
                <th className="pb-3 font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 align-top">
              {detail.findings.map((finding) => {
                const verdictRows = Array.isArray(finding.validation_verdicts)
                  ? (finding.validation_verdicts as Array<Record<string, unknown>>)
                  : finding.validation_verdicts
                    ? [finding.validation_verdicts as Record<string, unknown>]
                    : [];
                const verdict = verdictRows[0];
                return (
                  <tr key={String(finding.id)}>
                    <td className="py-4 pr-6">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>
                            {
                              getValidationFindingFamily({
                                category: safeString(finding.category),
                                findingFamily: safeString(finding.finding_family),
                                ruleKey: safeString(finding.rule_key),
                                subtype: safeString(finding.subtype)
                              }).label
                            }
                          </Badge>
                          <Badge>{String(finding.rule_key)}</Badge>
                          <Badge tone={String(finding.severity) === "high" ? "warning" : String(finding.severity) === "medium" ? "neutral" : "success"}>
                            {String(finding.severity)}
                          </Badge>
                        </div>
                        <div className="font-medium text-white">{String(finding.title)}</div>
                        <div className="text-slate-300">{String(finding.description)}</div>
                        {finding.page_url ? (
                          <div className="text-xs text-slate-400">
                            Page URL: <span className="break-all">{String(finding.page_url)}</span>
                          </div>
                        ) : null}
                        <pre className="overflow-x-auto rounded-xl bg-slate-950/60 p-3 text-xs text-slate-300">
                          {JSON.stringify(finding.evidence_json ?? {}, null, 2)}
                        </pre>
                      </div>
                    </td>
                    <td className="py-4 pr-6">
                      <div className="space-y-2">
                        <Badge className={verdictTone((verdict?.verdict as string | undefined) ?? null)}>
                          {String(verdict?.verdict ?? "pending")}
                        </Badge>
                        <div className="text-slate-200">{String(verdict?.rationale ?? "Awaiting verdict.")}</div>
                        <div className="text-xs text-slate-400">
                          Confidence {verdict?.confidence === undefined ? "—" : String(verdict.confidence)} · model{" "}
                          {String(verdict?.model ?? "—")}
                        </div>
                        <div className="text-xs text-slate-400">
                          Prompt {String(verdict?.prompt_version ?? "—")} · reviewed{" "}
                          {formatDateTime(safeString(verdict?.created_at))}
                        </div>
                        <pre className="overflow-x-auto rounded-xl bg-slate-950/60 p-3 text-xs text-slate-300">
                          {JSON.stringify(verdict?.evidence_json ?? {}, null, 2)}
                        </pre>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="text-2xl font-semibold text-white">
                        {safeNumber(verdict?.agreement_score) === null ? "—" : String(verdict?.agreement_score)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
