import Link from "next/link";
import { Suspense } from "react";
import { SCAN_FROM_VALUES, formatScanFromLabel } from "@website-signal-risk-scanner/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getScanFromMarkerInput, ScanFromMarker } from "../../../../components/scans/scan-from-icons";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { classifyAdminRequestProvenance } from "../../../../lib/admin/request-provenance";
import { getAdminScanFilterOptions, getAdminScanOperationalSnapshot, listAdminScansPage, type AdminScanListAccess, type AdminScanListFreshness, type AdminScanListItem, type AdminScanListStatus, type AdminScanListTimeSpan, type AdminScanOperationalSnapshotPeriod } from "../../../../server/admin/list-admin-scans";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { AdminNavigationProvider, AdminScanActions } from "./admin-scan-actions";
import { AdminScansAutoRefresh } from "./admin-scans-auto-refresh";
import { AdminScansFilterForm } from "./admin-scans-filter-form";
import { AdminTrafficFilters } from "../../../../components/admin/admin-traffic-filters";
import { AdminTableRefreshBoundary } from "../../../../components/admin/admin-table-refresh-boundary";
import { resolveExcludeMacMiniScanBot } from "../../../../lib/admin/mac-mini-scan-bot";
import {
  adminPolicyEvidenceDiagnosticTitle,
  adminPolicyEvidenceStageLabel,
  type AdminEvidenceAggregate,
  type AdminEvidenceResult,
  type AdminPolicyEvidenceDiagnostic
} from "../../../../lib/scans/admin-evidence-matrix";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminScansPageProps = {
  searchParams?: Promise<{ page?: string; perPage?: string; q?: string; status?: string; freshness?: string; access?: string; outcome?: string; language?: string; industry?: string; scanFrom?: string; timeSpan?: string; includeCanary?: string; excludeMacMiniScanBot?: string; scanBotFilter?: string; snapshot?: string }>;
};

const statuses = ["any", "no_go", "failed", "running", "queued", "limited", "completed"] as const;
const freshnesses = ["any", "fresh", "forced_fresh", "reused"] as const;
const accessValues = ["any", "clear", "blocked", "captcha", "robots_limited", "limited", "unknown"] as const;
const timeSpans = ["all", "4h", "12h", "24h", "7d", "31d"] as const;
const snapshotPeriods = ["1h", "24h", "7d", "30d", "1y"] as const;
function normalizeStatus(value: string | undefined): AdminScanListStatus {
  return statuses.includes(value as AdminScanListStatus) ? value as AdminScanListStatus : "any";
}
function normalizeFreshness(value: string | undefined): AdminScanListFreshness {
  return freshnesses.includes(value as AdminScanListFreshness) ? value as AdminScanListFreshness : "any";
}
function normalizeTimeSpan(value: string | undefined): AdminScanListTimeSpan {
  return timeSpans.includes(value as AdminScanListTimeSpan) ? value as AdminScanListTimeSpan : "31d";
}
function normalizeAccess(value: string | undefined): AdminScanListAccess {
  return accessValues.includes(value as AdminScanListAccess) ? value as AdminScanListAccess : "any";
}

function normalizeSnapshotPeriod(value: string | undefined): AdminScanOperationalSnapshotPeriod {
  return snapshotPeriods.includes(value as AdminScanOperationalSnapshotPeriod) ? value as AdminScanOperationalSnapshotPeriod : "24h";
}

function snapshotNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function snapshotPercentage(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function snapshotDuration(value: number | null) {
  if (value === null) return "—";
  return value >= 60 ? `${(value / 60).toFixed(1)}m` : `${value.toFixed(1)}s`;
}

function formatFilterLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatScanOutcome(value: string | null, noGo: boolean) {
  if (!value) return "—";
  return `${formatFilterLabel(value)} (${noGo ? "No-go" : "Go"})`;
}

function ScanSizeCell({ matrix }: { matrix: AdminScanListItem["evidenceMatrix"] }) {
  const website = matrix?.sizeMetrics?.website;
  const policy = matrix?.sizeMetrics?.privacyPolicy;
  return <><p className="truncate font-medium text-slate-700" title={website ? `${website.totalBytes.toLocaleString()} measured transfer bytes · ${website.completeness}` : undefined}>Site load {website ? `${website.megabytes.toFixed(2)} MB` : "—"}</p><p className="truncate text-[10px] text-slate-500" title={policy ? `${policy.compressedBytes?.toLocaleString() ?? "unknown"} compressed bytes · ${policy.url}` : undefined}>Policy {policy?.compressedKilobytes !== null && policy?.compressedKilobytes !== undefined ? `${policy.compressedKilobytes.toFixed(1)} KB` : "—"}</p></>;
}

function getScanFreshnessBadge(scan: Pick<AdminScanListItem, "freshRescanRequested" | "requestResolutionMode" | "rowKind">) {
  if (scan.requestResolutionMode === "reused_existing_scan") {
    return { className: "bg-sky-50 text-sky-700 ring-1 ring-sky-100", label: "Reused <24h" };
  }
  if (scan.freshRescanRequested === true) {
    return { className: "bg-violet-50 text-violet-700 ring-1 ring-violet-100", label: "Forced fresh" };
  }
  return {
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    label: scan.rowKind === "request" ? "Fresh request" : "Fresh"
  };
}

function getOperationalStatus(scan: AdminScanListItem) {
  if (scan.noGoFlag || scan.accessPostureClass === "early_loss" || scan.blockedFlag || scan.captchaFlag) {
    return { className: "bg-rose-500", label: "No-go" };
  }
  if (scan.status === "failed") {
    return { className: "bg-rose-500", label: "Failed" };
  }
  if (scan.status === "running" || scan.status === "queued") {
    return { className: "bg-amber-400", label: scan.status === "running" ? "Running" : "Queued" };
  }
  if (scan.accessPostureClass === "degraded_but_useful" || scan.accessPostureClass === "robots_limited") {
    return { className: "bg-amber-400", label: "Limited" };
  }
  if (scan.rowKind === "request") {
    return { className: "bg-sky-400", label: "Request" };
  }
  return { className: "bg-emerald-500", label: "Completed" };
}

function formatAdminScanDuration(scan: Pick<AdminScanListItem, "completedAt" | "createdAt" | "startedAt">) {
  const start = new Date(scan.startedAt ?? scan.createdAt).getTime();
  const end = scan.completedAt ? new Date(scan.completedAt).getTime() : null;
  if (!Number.isFinite(start) || end === null || !Number.isFinite(end) || end < start) {
    return null;
  }
  const seconds = (end - start) / 1000;
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s` : `${seconds.toFixed(1)}s`;
}

function formatRequestedDateTime(value: string | null) {
  if (!value) return { date: "Not available", time: "" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "Not available", time: "" };
  return {
    date: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Los_Angeles"
    }).format(parsed),
    time: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Los_Angeles",
      timeZoneName: "short"
    }).format(parsed)
  };
}

const EVIDENCE_MARKS = {
  observed: { mark: "✓", className: "text-emerald-700" },
  gap_observed: { mark: "!", className: "text-rose-700" },
  review_signal: { mark: "△", className: "text-amber-700" },
  not_observed: { mark: "—", className: "text-slate-500" },
  no_match_found: { mark: "—", className: "text-slate-500" },
  not_confirmed: { mark: "?", className: "text-amber-700" },
  not_testable: { mark: "×", className: "text-slate-400" },
  insufficient_evidence: { mark: "×", className: "text-slate-400" },
  out_of_scope: { mark: "·", className: "text-slate-400" }
} as const;

const STATUS_LABELS = {
  observed: "Observed",
  gap_observed: "Gap observed",
  review_signal: "Partial concern / review signal",
  not_observed: "Not observed",
  no_match_found: "No match found",
  not_confirmed: "Not confirmed",
  not_testable: "Not testable",
  insufficient_evidence: "Insufficient evidence",
  out_of_scope: "Out of scope"
} as const;

function evidenceTitle(label: string, result: AdminEvidenceResult | null) {
  const statusLabel = label === "Reject" && result?.status === "review_signal"
    ? "Partial concern"
    : result
      ? STATUS_LABELS[result.status]
      : null;
  return result
    ? `${label}: ${statusLabel} — ${result.descriptor}`
    : `${label}: not projected for this scan`;
}

function evidenceMark(result: AdminEvidenceResult | null) {
  return result ? EVIDENCE_MARKS[result.status].mark : "·";
}

function EvidenceCode({ code, disposition, label, result }: { code: string; disposition?: string | null; label: string; result: AdminEvidenceResult | null }) {
  const presentation = result ? EVIDENCE_MARKS[result.status] : { mark: "·", className: "text-slate-300" };
  const title = [evidenceTitle(label, result), disposition ? `Pipeline disposition: ${disposition.replaceAll("_", " ")}` : null]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  return <span className={`whitespace-nowrap font-semibold ${presentation.className}`} title={title}>{code}{presentation.mark}</span>;
}

function aggregateLabel(aggregate: AdminEvidenceAggregate) {
  if (aggregate.projected === 0) return "Not projected";
  return `${aggregate.observed}/${aggregate.total} ✓ · ${aggregate.review}△ · ${aggregate.concern}!`;
}

function EvidenceGroupCell({
  aggregate,
  labels,
  policyEvidence,
  results
}: {
  aggregate: AdminEvidenceAggregate | null;
  labels: Record<string, string>;
  policyEvidence?: AdminPolicyEvidenceDiagnostic | null;
  results: Record<string, AdminEvidenceResult | null> | null;
}) {
  return <>
    <p className="truncate text-[10px] font-medium text-slate-600" title={policyEvidence ? adminPolicyEvidenceDiagnosticTitle(policyEvidence) : undefined}>
      {policyEvidence ? `${adminPolicyEvidenceStageLabel(policyEvidence.stage)} · ` : ""}{aggregate ? aggregateLabel(aggregate) : "Not projected"}
    </p>
    <p className="flex items-center gap-1.5 overflow-hidden text-[10px] leading-4">
      {Object.entries(labels).map(([code, label]) => <EvidenceCode code={code} disposition={policyEvidence?.topicDispositions?.[code]?.disposition} key={code} label={label} result={results?.[code] ?? null} />)}
    </p>
  </>;
}

const TRANSPARENCY_LABELS = { CC: "Controller/contact", LB: "Legal basis", DR: "Data retention", PP: "Processing purposes", RC: "Recipients/categories", DS: "Data-subject rights", IT: "International transfers", PC: "Privacy contact", SA: "Supervisory authority", AD: "Automated decisions/profiling" };
const TRANSPORT_LABELS = { HD: "HTTPS delivery", HR: "HTTP redirect", MC: "Mixed content", TC: "TLS certificate", FT: "Form transport" };
const RUNTIME_LABELS = { FP: "Device ID/fingerprinting", SR: "Session replay", IF: "Third-party iframe", SM: "Social media", "3P": "Embedded third-party services" };

function getAccessLabel(scan: AdminScanListItem) {
  if (scan.noGoFlag) {
    const category = scan.noGoLimitationKind === "scanner_access_limitation"
      ? "Access"
      : scan.noGoLimitationKind === "scanner_capture_limitation"
        ? "Capture"
        : scan.noGoLimitationKind === "target_site_state"
          ? "Target"
          : "No-go";
    return `${category} · ${scan.interruptionLabel ?? scan.noGoReason ?? "No-go"}`;
  }
  if (scan.captchaFlag) return "CAPTCHA";
  if (scan.blockedFlag || scan.accessPostureClass === "early_loss") return scan.homepageFetchHttpStatus ? `Blocked · ${scan.homepageFetchHttpStatus}` : "Blocked";
  if (scan.accessPostureClass === "robots_limited") return "Robots-limited";
  if (scan.accessPostureClass === "degraded_but_useful") return "Limited";
  return scan.rowKind === "scan" ? "Clear" : "—";
}

function requesterIpLabel(scan: Pick<AdminScanListItem, "requesterIp" | "requesterIpHash">) {
  if (scan.requesterIp) return scan.requesterIp;
  if (scan.requesterIpHash) return `Hash ${scan.requesterIpHash.slice(0, 12)}`;
  return "IP not recorded";
}

type AdminScansSearchParams = Awaited<NonNullable<AdminScansPageProps["searchParams"]>>;

function AdminScansContentFallback() {
  return (
    <Card aria-busy="true" aria-label="Loading Admin Scans results" className="min-w-0 overflow-hidden border-slate-200 bg-white">
      <CardHeader className="pb-2">
        <CardTitle>Scan Admin</CardTitle>
        <div className="h-4 w-full max-w-3xl animate-pulse rounded bg-slate-100" />
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />
        <div className="h-5 w-72 animate-pulse rounded bg-slate-100" />
        <div className="min-h-[18rem] animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      </CardContent>
    </Card>
  );
}

async function AdminScansContent({ resolvedSearchParams }: { resolvedSearchParams: AdminScansSearchParams }) {
  const currentPage = normalizePage(resolvedSearchParams.page);
  const pageSize = normalizePageSize(resolvedSearchParams.perPage);
  const activeQuery = resolvedSearchParams.q?.trim().slice(0, 160) ?? "";
  const activeStatus = normalizeStatus(resolvedSearchParams.status);
  const activeFreshness = normalizeFreshness(resolvedSearchParams.freshness);
  const activeAccess = normalizeAccess(resolvedSearchParams.access);
  const activeOutcome = resolvedSearchParams.outcome?.trim().slice(0, 120) ?? "";
  const activeLanguage = resolvedSearchParams.language?.trim().slice(0, 80) ?? "";
  const activeIndustry = resolvedSearchParams.industry?.trim().slice(0, 200) ?? "";
  const activeScanFrom = SCAN_FROM_VALUES.includes(resolvedSearchParams.scanFrom as typeof SCAN_FROM_VALUES[number]) ? resolvedSearchParams.scanFrom as typeof SCAN_FROM_VALUES[number] : "any";
  const activeTimeSpan = normalizeTimeSpan(resolvedSearchParams.timeSpan);
  const includeCanary = resolvedSearchParams.includeCanary === "1";
  const excludeMacMiniScanBot = resolveExcludeMacMiniScanBot(resolvedSearchParams);
  const activeSnapshotPeriod = normalizeSnapshotPeriod(resolvedSearchParams.snapshot);
  const hasFilters = Boolean(activeQuery) || activeStatus !== "any" || activeFreshness !== "any" || activeAccess !== "any" || Boolean(activeOutcome) || Boolean(activeLanguage) || Boolean(activeIndustry) || activeScanFrom !== "any" || activeTimeSpan !== "all";
  const [operationalSnapshot, filterOptions, scanPage] = await Promise.all([
    withServerTiming("app.admin.scans.operational_snapshot", () => getAdminScanOperationalSnapshot(activeSnapshotPeriod, includeCanary, excludeMacMiniScanBot)),
    withServerTiming("app.admin.scans.filter-options", () => getAdminScanFilterOptions()),
    withServerTiming("app.admin.scans.list", () => listAdminScansPage(pageSize, (currentPage - 1) * pageSize, {
      query: activeQuery || null,
      status: activeStatus,
      freshness: activeFreshness,
      access: activeAccess,
      outcome: activeOutcome || null,
      language: activeLanguage || null,
      industry: activeIndustry || null,
      scanFrom: activeScanFrom === "any" ? null : activeScanFrom,
      timeSpan: activeTimeSpan,
      includeCanary,
      excludeMacMiniScanBot
    }))
  ]);
  const totalCount = scanPage.totalCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const normalizedPage = Math.min(currentPage, totalPages);
  const scans = scanPage.items;
  const maxSnapshotRuns = Math.max(1, ...operationalSnapshot.trend.map((bucket) => bucket.runs));
  const snapshotMetrics = [
    ["Runs", snapshotNumber(operationalSnapshot.metrics.runs), operationalSnapshot.period.label],
    ["Requests", snapshotNumber(operationalSnapshot.metrics.requests), "scan requests"],
    ["Completed", snapshotNumber(operationalSnapshot.metrics.completedRuns), "physical runs"],
    ["Limited", snapshotNumber(operationalSnapshot.metrics.limitedRuns), "evidence-limited"],
    ["Failed", snapshotNumber(operationalSnapshot.metrics.failedRuns), "physical runs"],
    ["Duration", `${snapshotDuration(operationalSnapshot.metrics.p50DurationSeconds)} / ${snapshotDuration(operationalSnapshot.metrics.p95DurationSeconds)}`, "p50 / p95"],
  ];
  const snapshotRates = [
    ["Completion", snapshotPercentage(operationalSnapshot.rates.completion)],
    ["Failures", snapshotPercentage(operationalSnapshot.rates.failure)],
    ["Limited", snapshotPercentage(operationalSnapshot.rates.limited)],
    ["Reuse", snapshotPercentage(operationalSnapshot.rates.reuse)],
    ["No-go", snapshotNumber(operationalSnapshot.metrics.noGoRuns)],
    ["Active", snapshotNumber(operationalSnapshot.metrics.activeRuns)],
  ];
  const liveTargets = scans.flatMap((scan) => {
    if (!["queued", "running", "finalizing"].includes(scan.status)) return [];
    const id = scan.rowKind === "scan" ? scan.scanId : scan.requestPublicId;
    return id ? [{
      id,
      kind: scan.rowKind,
      status: scan.status
    } as const] : [];
  });

  return (
    <AdminNavigationProvider>
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Scan Admin</h2>
          <p className="text-sm text-slate-500">Requester IP identifies who reached CertScore. Scanner egress identifies the outbound runtime that reached the target site.</p>
        </div>
        <AdminTrafficFilters basePath="/app/admin/scans" excludeMacMiniScanBot={excludeMacMiniScanBot} includeCanary={includeCanary} searchParams={resolvedSearchParams} />
      </div>

      <Card className="overflow-hidden border-slate-200 bg-white">
        <CardHeader className="border-b border-slate-100 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Operational snapshot</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">Physical scan runs and scan requests · {operationalSnapshot.period.label} · Pacific time</p>
            </div>
            <form action="/app/admin/scans" className="flex items-center gap-2" method="get">
              {Object.entries(resolvedSearchParams).map(([key, value]) => key === "page" || key === "snapshot" || !value ? null : <input key={key} name={key} type="hidden" value={value} />)}
              <label className="sr-only" htmlFor="admin-scans-snapshot-period">Snapshot period</label>
              <select className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700" defaultValue={activeSnapshotPeriod} id="admin-scans-snapshot-period" name="snapshot">
                <option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="1y">Last year</option>
              </select>
              <button className="app-raised-button inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-slate-700" type="submit">Apply</button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-3 gap-px bg-slate-100 sm:grid-cols-6">
            {snapshotMetrics.map(([label, value, detail]) => <div className="min-w-0 bg-white px-3 py-2.5" key={label}><p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 truncate text-lg font-semibold text-slate-950">{value}</p><p className="truncate text-[10px] text-slate-400">{detail}</p></div>)}
          </div>
          <div className="grid gap-4 border-t border-slate-100 p-3 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">{operationalSnapshot.period.label} activity</p><p className="text-[10px] text-slate-400">{operationalSnapshot.trend[0]?.label ?? "Start"} — {operationalSnapshot.trend.at(-1)?.label ?? "Now"} · Pacific time</p></div>
              <div aria-label={`Scan activity trend: ${snapshotNumber(operationalSnapshot.metrics.runs)} runs during ${operationalSnapshot.period.label.toLowerCase()}`} className="flex h-14 items-end gap-1" role="img">
                {operationalSnapshot.trend.map((bucket, index) => <div aria-hidden="true" className={`min-w-0 flex-1 rounded-t ${bucket.failed > 0 ? "bg-rose-400" : bucket.limited > 0 ? "bg-amber-400" : "bg-sky-500"}`} key={`${bucket.bucket}:${index}`} style={{ height: `${Math.max(bucket.runs > 0 ? 4 : 1, (bucket.runs / maxSnapshotRuns) * 56)}px` }} title={`${bucket.label}: ${bucket.runs} runs · ${bucket.failed} failed · ${bucket.limited} limited`} />)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {snapshotRates.map(([label, value]) => <div className="rounded-lg bg-slate-50 px-2 py-1.5" key={label}><p className="truncate text-[10px] text-slate-500">{label}</p><p className="mt-0.5 text-sm font-semibold text-slate-950">{value}</p></div>)}
            </div>
          </div>
          <div className="grid gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-2 xl:grid-cols-4">
            {operationalSnapshot.scanFromCounts.map((scanFrom) => <div className="flex items-center justify-between gap-3 bg-white px-3 py-2.5" key={scanFrom.value}><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-900">{scanFrom.label}</p><p className="truncate text-[10px] text-slate-500">{snapshotNumber(scanFrom.completed)} completed · {snapshotNumber(scanFrom.failed)} failed</p></div><p className="shrink-0 text-lg font-semibold text-slate-950">{snapshotNumber(scanFrom.count)}</p></div>)}
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden border-slate-200 bg-white">
      <CardHeader className="pb-2"><div className="flex flex-wrap items-end justify-between gap-2"><div><CardTitle>Scan activity</CardTitle><p className="mt-1 text-sm text-slate-500">Physical runs and retained scan requests matching the table filters.</p></div><p className="text-sm text-slate-500">{snapshotNumber(totalCount)} matching items</p></div></CardHeader>
      <AdminTableRefreshBoundary basePath="/app/admin/scans" label="Refreshing scans">
      <CardContent className="min-w-0 space-y-3 pt-0">
        <AdminScansAutoRefresh targets={liveTargets} />
        <AdminScansFilterForm hasFilters={hasFilters} submitFirst>
          <input name="snapshot" type="hidden" value={activeSnapshotPeriod} />
          {includeCanary ? <input name="includeCanary" type="hidden" value="1" /> : null}
          <input name="scanBotFilter" type="hidden" value="1" />
          {excludeMacMiniScanBot ? <input name="excludeMacMiniScanBot" type="hidden" value="1" /> : null}
          <input aria-label="Filter by domain, scan ID, email, requester, IP, or source; use field not-equal syntax to exclude" className="h-10 min-w-[28rem] flex-[1_1_32rem] rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={activeQuery} name="q" placeholder="Domain, scan_id, email, requester, IP · source:homepage-anonymous · ip!=66.*" />
          <select aria-label="Filter scans by status" className="h-10 w-[7.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeStatus} name="status">{statuses.map((status) => <option key={status} value={status}>{status === "any" ? "Any status" : formatFilterLabel(status)}</option>)}</select>
          <select aria-label="Filter scans by freshness" className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeFreshness} name="freshness">{freshnesses.map((freshness) => <option key={freshness} value={freshness}>{freshness === "any" ? "Any freshness" : freshness === "fresh" ? "Fresh" : freshness === "forced_fresh" ? "Forced fresh" : "Reused <24h"}</option>)}</select>
          <select aria-label="Filter scans by access posture" className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeAccess} name="access"><option value="any">Any access</option>{accessValues.slice(1).map((access) => <option key={access} value={access}>{access === "robots_limited" ? "Robots-limited" : access === "captcha" ? "CAPTCHA" : formatFilterLabel(access)}</option>)}</select>
          <select aria-label="Filter scans by outcome" className="h-10 w-[12rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeOutcome} name="outcome"><option value="">Any outcome</option>{filterOptions.outcomes.map((outcome) => <option key={outcome} value={outcome}>{formatScanOutcome(outcome, outcome.startsWith("reachability_blocked") || ["robots_restricted", "transport_failure", "timeout_navigation", "unknown_access_limitation", "domain_inactive_or_unstable"].includes(outcome))}</option>)}</select>
          <select aria-label="Filter scans by language" className="h-10 w-[7rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeLanguage} name="language"><option value="">Any language</option>{filterOptions.languages.map((language) => <option key={language} value={language}>{language}</option>)}</select>
          <select aria-label="Filter scans by industry" className="h-10 w-[10.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeIndustry} name="industry"><option value="">Any industry</option>{filterOptions.industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}</select>
          <select aria-label="Filter scans by origin" className="h-10 w-[7.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeScanFrom} name="scanFrom"><option value="any">Any origin</option>{SCAN_FROM_VALUES.map((scanFrom) => <option key={scanFrom} value={scanFrom}>{formatScanFromLabel(scanFrom)}</option>)}</select>
          <select aria-label="Filter scans by time span" className="h-10 w-[8.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeTimeSpan} name="timeSpan">{timeSpans.map((timeSpan) => <option key={timeSpan} value={timeSpan}>{timeSpan === "all" ? "All time" : timeSpan === "4h" ? "Past 4 hours" : timeSpan === "12h" ? "Past 12 hours" : timeSpan === "24h" ? "Past 24 hours" : timeSpan === "7d" ? "Past 7 days" : "Past 31 days"}</option>)}</select>
        </AdminScansFilterForm>
        <PaginationControls
          basePath="/app/admin/scans"
          itemLabel="scan activity items"
          page={normalizedPage}
          pageCount={totalPages}
          pageSize={pageSize}
          totalCount={totalCount}
          visibleCount={scans.length}
          searchParams={{ q: activeQuery, status: activeStatus, freshness: activeFreshness, access: activeAccess, outcome: activeOutcome, language: activeLanguage, industry: activeIndustry, scanFrom: activeScanFrom, timeSpan: activeTimeSpan, snapshot: activeSnapshotPeriod, includeCanary: includeCanary ? "1" : null, scanBotFilter: "1", excludeMacMiniScanBot: excludeMacMiniScanBot ? "1" : null }}
          showPageJump
        />
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200">
          <table className="w-[2957px] min-w-[2957px] table-fixed text-left text-xs">
            <colgroup>
              <col style={{ width: "100px" }} /><col style={{ width: "165px" }} /><col style={{ width: "115px" }} /><col style={{ width: "173px" }} />
              <col style={{ width: "70px" }} /><col style={{ width: "60px" }} /><col style={{ width: "75px" }} /><col style={{ width: "156px" }} />
              <col style={{ width: "80px" }} /><col style={{ width: "205px" }} /><col style={{ width: "135px" }} /><col style={{ width: "145px" }} />
              <col style={{ width: "180px" }} /><col style={{ width: "130px" }} /><col style={{ width: "65px" }} /><col style={{ width: "100px" }} /><col style={{ width: "65px" }} />
              <col style={{ width: "80px" }} /><col style={{ width: "240px" }} /><col style={{ width: "160px" }} /><col style={{ width: "190px" }} /><col style={{ width: "190px" }} /><col style={{ width: "78px" }} />
            </colgroup>
            <thead className="sticky top-0 z-20 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                {[
                  { label: "Status", className: "sticky left-0 z-30 bg-slate-50" },
                  { label: "Requester IP" }, { label: "Requested" }, { label: "Page" }, { label: "Tranco" },
                  { label: "Score" }, { label: "Top" }, { label: "Privacy / CMP" },
                  { label: "A/R/O" }, { label: "Transparency" }, { label: "Transport" }, { label: "Runtime" }, { label: "Size" }, { label: "Time" }, { label: "Outcome" }, { label: "From" }, { label: "Freshness" }, { label: "Language" }, { label: "Access" }, { label: "Industry" },
                  { label: "Scan ID" }, { label: "Scanner egress" },
                  { label: "Open", className: "sticky right-0 z-30 bg-slate-50" }
                ].map(({ label, className }) => <th key={label} className={`border-b border-slate-200 px-2.5 py-1.5 font-semibold ${className ?? ""}`}>{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {scans.map((scan) => {
                const provenance = classifyAdminRequestProvenance({
                  organizationName: scan.organizationName,
                  requestChannel: scan.requestChannel,
                  requesterIp: scan.requesterIp ?? scan.requesterIpHash,
                  source: scan.source
                });
                const status = getOperationalStatus(scan);
                const freshness = getScanFreshnessBadge(scan);
                const duration = scan.linkedScanId ? formatAdminScanDuration(scan) : null;
                const scanFromMarker = getScanFromMarkerInput(scan.scanFromValue);
                const matrix = scan.evidenceMatrix;
                const requestedDateTime = formatRequestedDateTime(scan.requestedAt ?? scan.createdAt);
                const accessLabel = getAccessLabel(scan);
                return (
                  <tr key={scan.activityId} className="group h-[52px] hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 bg-white px-2.5 py-1.5 group-hover:bg-slate-50" title={status.label}><span className="inline-flex items-center gap-1.5 font-semibold"><span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${status.className}`} /><span className={status.label === "No-go" ? "text-rose-700" : "text-slate-700"}>{status.label}</span></span></td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${provenance.className}`} title={scan.requesterName ?? provenance.label}>{scan.requesterName ?? provenance.label}</span><p className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={`${requesterIpLabel(scan)} · ${scan.requesterIpSource.replaceAll("_", " ")}`}>{requesterIpLabel(scan)}</p></td>
                    <td className="px-2.5 py-1.5 text-[10px] leading-4 text-slate-600" title={formatAdminDateTime(scan.requestedAt ?? scan.createdAt)}><p className="truncate">{requestedDateTime.date}</p><p className="truncate text-slate-500">{requestedDateTime.time}</p></td>
                    <td className="px-2.5 py-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="min-w-0 flex-1 line-clamp-2 break-all font-semibold leading-4 text-slate-900" title={scan.pageUrl ?? "Page URL unavailable"}>{scan.pageUrl ?? "Page URL unavailable"}</p>
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">{scan.scanType}</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 font-medium text-slate-700">{scan.trancoRank ? `#${scan.trancoRank.toLocaleString()}` : "—"}</td>
                    <td className="px-2.5 py-1.5" title={[scan.scoreLabel, scan.scoreVersion, scan.scoreCoverageConfidence ? `${scan.scoreCoverageConfidence} coverage` : null, scan.scoreScoredAt ? `scored ${scan.scoreScoredAt}` : null].filter(Boolean).join(" · ") || undefined}><span className="text-sm font-semibold text-slate-950">{scan.certscoreOverall ?? "—"}</span>{scan.certscoreOverall !== null ? <span className="text-slate-400">/100</span> : null}</td>
                    <td className="px-2.5 py-1.5"><span className="text-sm font-semibold text-slate-950">{scan.topFindingCount ?? "—"}</span></td>
                    <td className="px-2.5 py-1.5"><p className="flex gap-2 text-[10px]"><EvidenceCode code="Privacy" label="Privacy notice" result={matrix?.privacyConsent.privacyNotice ?? null} /><EvidenceCode code="CMP" label="CMP framework" result={matrix?.privacyConsent.cmp ?? null} /></p><p className="truncate text-[10px] text-slate-500" title={evidenceTitle("Consent mechanism", matrix?.privacyConsent.mechanism ?? null)}>Mechanism {matrix?.privacyConsent.cmpVendorName ?? evidenceMark(matrix?.privacyConsent.mechanism ?? null)}</p></td>
                    <td className="px-2.5 py-1.5"><p className="flex gap-2 text-[10px]"><EvidenceCode code="A" label="Accept" result={matrix?.privacyConsent.accept ?? null} /><EvidenceCode code="R" label="Reject" result={matrix?.privacyConsent.reject ?? null} /><EvidenceCode code="O" label="Options" result={matrix?.privacyConsent.options ?? null} /></p><p className="truncate text-[10px] text-slate-400">Canonical controls</p></td>
                    <td className="px-2.5 py-1.5"><EvidenceGroupCell aggregate={matrix?.transparency.aggregate ?? null} labels={TRANSPARENCY_LABELS} policyEvidence={matrix?.policyEvidence} results={matrix?.transparency.results ?? null} /></td>
                    <td className="px-2.5 py-1.5"><EvidenceGroupCell aggregate={matrix?.transport.aggregate ?? null} labels={TRANSPORT_LABELS} results={matrix?.transport.results ?? null} /></td>
                    <td className="px-2.5 py-1.5"><EvidenceGroupCell aggregate={matrix?.runtime.aggregate ?? null} labels={RUNTIME_LABELS} results={matrix?.runtime.results ?? null} /></td>
                    <td className="px-2.5 py-1.5"><ScanSizeCell matrix={matrix} /></td>
                    <td className={`px-2.5 py-1.5 font-medium ${duration && (duration.includes("m") || Number.parseFloat(duration) > 60) ? "text-amber-700" : "text-slate-800"}`}>{duration ?? (scan.status === "running" ? "Running" : "—")}</td>
                    <td className="truncate px-2.5 py-1.5 text-slate-700" title={scan.scanOutcome ?? undefined}>{formatScanOutcome(scan.scanOutcome, scan.noGoFlag)}</td>
                    <td className="px-2.5 py-1.5" title={scan.scanFromLabel}><span aria-label={scan.scanFromLabel} className="inline-flex"><ScanFromMarker flag={"flag" in scanFromMarker ? scanFromMarker.flag : undefined} icon={"icon" in scanFromMarker ? scanFromMarker.icon : undefined} selected /></span></td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${freshness.className}`}>{freshness.label}</span></td>
                    <td className="px-2.5 py-1.5 font-medium uppercase text-slate-700" title={scan.primaryLanguage ? `${scan.primaryLanguageConfidence ?? "unknown"} confidence · ${(scan.primaryLanguageSource ?? "unknown").replaceAll("_", " ")}` : "No reliable retained language evidence"}>{scan.primaryLanguage ?? "—"}</td>
                    <td className="px-2.5 py-1.5" title={accessLabel}>
                      <span className={`line-clamp-2 leading-4 ${status.label === "No-go" || status.label === "Failed" ? "font-semibold text-rose-700" : "text-slate-700"}`}>{accessLabel}</span>
                      {!scan.noGoFlag && scan.interruptionLabel ? <p className="truncate text-[10px] text-slate-400" title={scan.interruptionReason ?? undefined}>{scan.interruptionLabel}</p> : null}
                    </td>
                    <td className="truncate px-2.5 py-1.5 text-slate-700" title={scan.industry ?? undefined}>{scan.industry ?? "—"}</td>
                    <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[10px] text-slate-700" title={scan.linkedScanId ?? scan.scanId}>{scan.linkedScanId ?? scan.scanId}</p></td>
                    <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[10px] text-slate-700" title={scan.scannerEgressId ?? "Scanner egress not recorded"}>{scan.scannerEgressId ?? "Not recorded"}</p><p className="mt-0.5 truncate text-[10px] text-slate-400" title={scan.scannerEgressProvider ?? undefined}>{scan.scannerEgressProvider ?? "Outbound runtime"}</p></td>
                    <td className="sticky right-0 z-10 border-l border-slate-100 bg-white px-2 py-1.5 group-hover:bg-slate-50">{scan.linkedScanId && scan.scanViewHref ? <AdminScanActions compact domainLabel={scan.domainHostname ?? scan.pageUrl ?? "Scanned website"} scanId={scan.linkedScanId} scanViewHref={scan.scanViewHref} visualEvidenceHref={scan.visualEvidenceHref} /> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
      </AdminTableRefreshBoundary>
    </Card>
    </div>
    </AdminNavigationProvider>
  );
}

export default async function AdminScansPage({ searchParams }: AdminScansPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  return (
    <Suspense fallback={<AdminScansContentFallback />}>
      <AdminScansContent resolvedSearchParams={resolvedSearchParams} />
    </Suspense>
  );
}
