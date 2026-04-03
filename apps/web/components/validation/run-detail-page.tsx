import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import Link from "next/link";
import { ViewerTimestamp } from "../time/viewer-timestamp";
import { getValidationRunDetail } from "../../server/validation/repository";
import { getReviewFindingPresentation } from "../../lib/scans/review-finding-presentation";
import { normalizeFindingName } from "../../lib/scans/canonical-review-finding";
import { compactEvidenceJsonForDisplay } from "../../lib/scans/compact-evidence-json";
import { deriveScanExecutionSummary } from "../../lib/scans/scan-timeout-summary";
import {
  buildUnifiedFindingDisplayPackets,
  type UnifiedFindingDisplayPacket
} from "../../lib/scans/unified-findings";
import { repairFindingFamilyPacketEvents } from "../../server/scans/family-packet-event-repair";
import {
  buildValidationFindingLookup,
  type ScanValidationFinding
} from "../../lib/scans/validation-review-linking";
import { ValidationRescanForm } from "./validation-rescan-form";
import { ValidationRunsAutoRefresh } from "./validation-runs-auto-refresh";
import { ValidationFindingJsonPane } from "./validation-finding-json-pane";

type ValidationRunDetailPageProps = {
  runId: string;
};

function getConfidenceTone(band: UnifiedFindingDisplayPacket["confidenceBand"]) {
  switch (band) {
    case "high":
      return "bg-emerald-100 text-emerald-900";
    case "moderate":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getSeverityTone(severity: UnifiedFindingDisplayPacket["severity"]) {
  switch (severity) {
    case "high":
      return "bg-rose-100 text-rose-900";
    case "medium":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-sky-100 text-sky-900";
  }
}

function getPresentationStatusTone(status: UnifiedFindingDisplayPacket["presentationDecision"]["status"]) {
  switch (status) {
    case "surface":
      return "bg-emerald-100 text-emerald-900";
    case "audit_only":
      return "bg-slate-200 text-slate-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getRunTone(status: string | null | undefined) {
  switch (status) {
    case "completed":
      return {
        badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
        panel: "from-emerald-100 via-white to-sky-100"
      };
    case "failed":
      return {
        badge: "border-rose-200 bg-rose-50 text-rose-800",
        panel: "from-rose-100 via-white to-orange-100"
      };
    default:
      return {
        badge: "border-sky-200 bg-sky-50 text-sky-800",
        panel: "from-sky-100 via-white to-cyan-100"
      };
  }
}

export async function ValidationRunDetailPage({ runId }: ValidationRunDetailPageProps) {
  const detail = await getValidationRunDetail(runId);
  if (!detail) {
    return <p className="text-sm text-slate-600">Validation run not found.</p>;
  }
  const shouldAutoRefresh = ["waiting_for_scan", "queued", "collecting", "ranking", "validating"].includes(detail.status ?? "");

  const scanExecutionSummary = deriveScanExecutionSummary({
    ...(detail.scanExecution ?? {}),
    errorMessage: detail.errorMessage,
    events: detail.scanEvents,
    status: detail.status
  });
  const validationFindings: ScanValidationFinding[] = detail.rows.map((row) => ({
    agreementScore: null,
    category: row.automatedFinding.category ?? null,
    description: row.automatedFinding.description ?? null,
    evidence: row.automatedFinding.evidence ?? null,
    findingFamily: null,
    findingScope: null,
    findingSource: null,
    findingSubject: null,
    id: `${row.automatedFinding.ruleKey}-${row.automatedFinding.rank}`,
    model: null,
    modelConfidence: row.automatedFinding.modelConfidence ?? null,
    pageUrl: row.automatedFinding.pageUrl ?? null,
    promptVersion: null,
    rationale: null,
    ruleKey: row.automatedFinding.ruleKey,
    severity: row.automatedFinding.severity ?? null,
    subtype: row.automatedFinding.subtype ?? null,
    systemConfidenceBand: null,
    systemConfidenceExplanation: null,
    systemConfidenceScore: null,
    title: row.automatedFinding.title,
    verdict: null
  }));
  const repairedScanEvents = repairFindingFamilyPacketEvents({
    events: detail.scanEvents,
    policyEnrichment: detail.policyEnrichment ?? []
  });
  const unifiedPackets = buildUnifiedFindingDisplayPackets({
    mergedSignals: detail.mergedSignals ?? [],
    policyEnrichment: detail.policyEnrichment ?? [],
    reviewFindingCandidates: [],
    scanEvents: repairedScanEvents,
    validationFindings,
    validationFindingLookup: buildValidationFindingLookup(validationFindings)
  });
  const surfacedUnifiedPackets = unifiedPackets.filter((packet) => packet.presentationDecision.status === "surface");
  const auditOnlyUnifiedPackets = unifiedPackets.filter((packet) => packet.presentationDecision.status === "audit_only");
  const tone = getRunTone(detail.status);

  return (
    <div className="space-y-8">
      <ValidationRunsAutoRefresh enabled={shouldAutoRefresh} />
      <section
        className={cx(
          "relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] md:p-7",
          tone.panel
        )}
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.12),transparent_52%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]", tone.badge)}>
                Validation {detail.status}
              </span>
              <span className="rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
                Scan {detail.scanStatus ?? "—"}
              </span>
              <span className="rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
                {detail.triggerMode}
              </span>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-[2.1rem]">{detail.hostname}</h1>
              <p className="font-mono text-xs text-slate-500">scan_id {detail.scanId ?? "—"}</p>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-[15px]">
                Rank {detail.trancoRank ?? "—"} · {detail.rankBand ?? "—"} · {surfacedUnifiedPackets.length} surfaced unified finding{surfacedUnifiedPackets.length === 1 ? "" : "s"} from {detail.rows.length} automated validation row{detail.rows.length === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="rounded-full border border-slate-200/80 bg-white/75 px-3 py-1.5">
                Validation created <ViewerTimestamp value={detail.createdAt} />
              </span>
              <span className="rounded-full border border-slate-200/80 bg-white/75 px-3 py-1.5">
                Completed <ViewerTimestamp value={detail.completedAt} fallback="In progress" />
              </span>
              <span className="rounded-full border border-slate-200/80 bg-white/75 px-3 py-1.5">
                Scan started <ViewerTimestamp value={detail.scanStartedAt} fallback="Not started" />
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {[
              { label: "Surfaced findings", value: surfacedUnifiedPackets.length },
              { label: "Audit-only packets", value: auditOnlyUnifiedPackets.length },
              { label: "Automated rows", value: detail.rows.length }
            ].map((tile) => (
              <div
                key={tile.label}
                className="rounded-[1.4rem] border border-slate-200/80 bg-white/78 p-4 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{tile.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{tile.value}</p>
              </div>
            ))}
            {detail.domainId ? <ValidationRescanForm domainId={detail.domainId} /> : null}
          </div>
        </div>
      </section>

      {scanExecutionSummary ? (
        <Card
          className={
            scanExecutionSummary.tone === "danger"
              ? "border-rose-200 bg-rose-50"
              : scanExecutionSummary.tone === "success"
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                scanExecutionSummary.tone === "danger"
                  ? "text-rose-950"
                  : scanExecutionSummary.tone === "success"
                    ? "text-emerald-950"
                    : "text-amber-950"
              }
            >
              {scanExecutionSummary.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul
              className={
                scanExecutionSummary.tone === "danger"
                  ? "space-y-2 text-sm text-rose-900"
                  : scanExecutionSummary.tone === "success"
                    ? "space-y-2 text-sm text-emerald-900"
                    : "space-y-2 text-sm text-amber-900"
              }
            >
              {scanExecutionSummary.details.map((detailLine) => (
                <li key={detailLine}>• {detailLine}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.28)]">
        <CardHeader>
          <CardTitle>Unified findings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {surfacedUnifiedPackets.map((packet) => {
              const relatedRows = detail.rows.filter((row) =>
                packet.sourceRefs.some(
                  (sourceRef) => sourceRef.kind === "validation" && sourceRef.ruleKey === row.automatedFinding.ruleKey
                )
              );
              const combinedJson = JSON.stringify(
                {
                  unifiedFinding: {
                    id: packet.unifiedFindingId,
                    title: packet.title,
                    severity: packet.severity,
                    confidenceBand: packet.confidenceBand,
                    confidenceInputs: packet.confidenceInputs,
                    confidenceRationale: packet.presentationDecision.confidenceRationale,
                    summary: packet.summary,
                    details: packet.details,
                    presentationDecision: packet.presentationDecision,
                    sourceRefs: packet.sourceRefs,
                    evidence: compactEvidenceJsonForDisplay(packet.evidence ?? {})
                  },
                  rawFindings: relatedRows.map((row) => ({
                    rank: row.automatedFinding.rank,
                    ruleKey: row.automatedFinding.ruleKey,
                    title: row.automatedFinding.title,
                    severity: row.automatedFinding.severity,
                    pageUrl: row.automatedFinding.pageUrl,
                    evidence: compactEvidenceJsonForDisplay(row.automatedFinding.evidence)
                  }))
                },
                null,
                2
              );

              return (
                <div
                  key={packet.unifiedFindingId}
                  className="rounded-[1.45rem] border border-slate-200/80 bg-slate-50/55 p-5 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.3)]"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">{packet.presentation.findingName}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getPresentationStatusTone(packet.presentationDecision.status)}`}
                        >
                          {packet.presentationDecision.status === "surface" ? "surfaced" : "audit only"}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getSeverityTone(packet.severity)}`}>
                          {packet.severity}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getConfidenceTone(packet.confidenceBand)}`}>
                          {packet.confidenceBand} confidence
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{packet.presentation.whyThisMatters}</p>
                      <p className="text-xs text-slate-500">{packet.presentationDecision.confidenceRationale}</p>
                      <p className="text-xs text-slate-500">{packet.presentationDecision.rationale}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>{packet.confidenceInputs.sourceCount} source refs</span>
                        <span>{packet.confidenceInputs.signalCount} signals</span>
                        <span>{packet.confidenceInputs.validationCount} validation findings</span>
                        <span>{packet.confidenceInputs.issueCount} issue syntheses</span>
                      </div>
                      {packet.evidence?.entities ? (
                        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                          {Object.entries(packet.evidence.entities)
                            .slice(0, 3)
                            .map(([key, values]) =>
                              values.length > 0 ? (
                                <span key={key} className="rounded-full bg-white px-2 py-1">
                                  {key}: {values.slice(0, 3).join(", ")}
                                </span>
                              ) : null
                            )}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500 md:text-right">
                      <p>{packet.unifiedFindingId}</p>
                      <p>{relatedRows.length} raw finding{relatedRows.length === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <ValidationFindingJsonPane payload={combinedJson} />
                  </div>
                </div>
              );
            })}
            {surfacedUnifiedPackets.length === 0 ? (
              <p className="text-sm text-slate-500">No unified findings were derived for this validation run.</p>
            ) : null}
            {auditOnlyUnifiedPackets.length > 0 ? (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Audit-only unified findings</p>
                  <p className="text-sm text-slate-600">
                    These packets were retained for review and calibration, but not promoted to the primary surfaced list.
                  </p>
                </div>
                {auditOnlyUnifiedPackets.map((packet) => (
                  <div
                    key={`${packet.unifiedFindingId}-audit-only`}
                    className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/50 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{packet.presentation.findingName}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getPresentationStatusTone(packet.presentationDecision.status)}`}
                      >
                        audit only
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getConfidenceTone(packet.confidenceBand)}`}>
                        {packet.confidenceBand} confidence
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{packet.presentationDecision.rationale}</p>
                    <p className="mt-1 text-xs text-slate-500">{packet.presentationDecision.confidenceRationale}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.28)]">
        <CardHeader>
          <CardTitle>Automated findings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {detail.rows.map((row) => (
              <div
                key={`${row.automatedFinding.ruleKey}-${row.automatedFinding.rank}`}
                className="rounded-[1.45rem] border border-slate-200/80 bg-slate-50/50 p-5 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.3)]"
              >
                {(() => {
                  const siblingFindingKeysOrTitles = detail.rows
                    .filter((candidate) => candidate.automatedFinding.pageUrl === row.automatedFinding.pageUrl)
                    .flatMap((candidate) => [candidate.automatedFinding.ruleKey, candidate.automatedFinding.title])
                    .filter((value) => value !== row.automatedFinding.ruleKey && value !== row.automatedFinding.title);
                  const presentation = getReviewFindingPresentation({
                    evidence: row.automatedFinding.evidence,
                    keyOrTitle: row.automatedFinding.ruleKey,
                    findingTitle: row.automatedFinding.title,
                    siblingFindingKeysOrTitles
                  });
                  const pageLabel = row.automatedFinding.pageUrl ?? detail.hostname;
                  const summaryJson = {
                    url: pageLabel,
                    findingName: normalizeFindingName(row.automatedFinding.title),
                    confidenceScore: presentation.confidenceScore ?? "NA",
                    whyThisMatters: presentation.whyThisMatters,
                    suggestedFix: presentation.suggestedFix,
                    suggestedBestPractice: presentation.bestPracticeLink
                      ? {
                          organization: presentation.bestPracticeLink.label,
                          title: presentation.bestPracticeLink.title,
                          url: presentation.bestPracticeLink.url
                        }
                      : null
                  };
                  const combinedJson = JSON.stringify(
                    {
                      finding: summaryJson,
                      evidence: compactEvidenceJsonForDisplay(row.automatedFinding.evidence)
                    },
                    null,
                    2
                  );

                  return (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">URL</p>
                        <p className="text-sm text-slate-700 break-all">{pageLabel}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Finding name</p>
                        <p className="font-semibold text-slate-950">
                          #{row.automatedFinding.rank} · {normalizeFindingName(row.automatedFinding.title)}
                        </p>
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          {row.automatedFinding.ruleKey} · {row.automatedFinding.severity} · {detail.hostname}
                        </p>
                      </div>
                      <ValidationFindingJsonPane payload={combinedJson} />
                    </div>
                  );
                })()}
              </div>
            ))}
            {detail.rows.length === 0 ? <p className="text-sm text-slate-500">No automated findings were stored for this run.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
