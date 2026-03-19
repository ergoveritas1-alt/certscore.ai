import { notFound } from "next/navigation";
import { getValidationFindingFamily } from "@website-signal-risk-scanner/shared";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getValidationRunDetail } from "../../server/validation/repository";

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
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

export async function ValidationRunDetailPage(input: {
  scanId: string;
}) {
  const detail = await getValidationRunDetail(input.scanId);

  if (!detail) {
    notFound();
  }

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
