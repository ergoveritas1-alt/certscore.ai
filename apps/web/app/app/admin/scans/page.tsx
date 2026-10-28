import { AdminDataBoundary, AdminDataLoading } from "../../../../components/admin/admin-data-panel";
import Link from "next/link";
import { Suspense } from "react";
import { SCAN_FROM_VALUES, formatScanFromLabel } from "@website-signal-risk-scanner/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getScanFromMarkerInput, ScanFromMarker } from "../../../../components/scans/scan-from-icons";
import { PaginationControls, normalizePage, normalizePageSize } from "../../../../components/ui/pagination-controls";
import { formatAdminDateTime } from "../../../../lib/admin/date-time";
import { classifyAdminRequestProvenance } from "../../../../lib/admin/request-provenance";
import { SCAN_CREATION_SOURCES, scanCreationSource, type ScanCreationSource } from "../../../../lib/admin/scan-creation-source";
import { projectAdminRequestAdmission } from "../../../../lib/admin/admin-request-admission";
import { getAdminScanFilterOptions, getAdminScanActivityPage, type AdminScanListAccess, type AdminScanListFreshness, type AdminScanListItem, type AdminScanListStatus } from "../../../../server/admin/list-admin-scans";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { AdminNavigationProvider, AdminScanActions } from "./admin-scan-actions";
import { AdminScansAutoRefresh } from "./admin-scans-auto-refresh";
import { AdminScansFilterForm } from "./admin-scans-filter-form";
import { AdminTrafficFilters } from "../../../../components/admin/admin-traffic-filters";
import { AdminOperationalSnapshot } from "../../../../components/admin/admin-operational-snapshot";
import { AdminTableRefreshBoundary } from "../../../../components/admin/admin-table-refresh-boundary";
import { adminOperationalSnapshotDelta, adminOperationalSnapshotHref } from "../../../../lib/admin/admin-operational-snapshot";
import { ADMIN_SCAN_ACTIVITY_PERIODS, adminScanActivityHref, adminScanActivityPeriodLabel, resolveAdminScanActivityPeriod } from "../../../../lib/admin/admin-scan-activity";
import { adminTrafficScopeVisibility, resolveAdminTrafficScope } from "../../../../lib/admin/admin-traffic-scope";
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
  searchParams?: Promise<{ createdVia?: string; page?: string; perPage?: string; q?: string; status?: string; freshness?: string; access?: string; outcome?: string; language?: string; industry?: string; scanFrom?: string; timeSpan?: string; includeCanary?: string; excludeMacMiniScanBot?: string; scanBotFilter?: string; snapshot?: string; traffic?: string; details?: string }>;
};

function CreatedViaCell({ scan }: { scan: AdminScanListItem }) {
  const origin = scan.createdVia;
  const label = SCAN_CREATION_SOURCES[origin?.kind ?? "unknown"];
  const title = origin?.requestId
    ? `Original creation request: ${origin.requestId} · ${formatAdminDateTime(origin.requestedAt)}`
    : "Creation source from retained scan metadata; original request details unavailable. Unknown means attribution could not be verified.";
  return <td className="px-2.5 py-1.5">
    <p className="text-[9px] text-slate-500">Scan audience: {origin?.trafficClass ?? "unknown"}</p>
    {origin?.requestId ? <details><summary className="cursor-pointer rounded bg-sky-50 px-2 py-1 text-sky-800" title={title}>{label}</summary><p className="mt-1 break-all text-[10px]">{origin.requestId}<br />{formatAdminDateTime(origin.requestedAt)}{origin.requestId.startsWith("pulse_req_") ? <Link className="block text-sky-700 underline" href={`/app/admin/pulse/${encodeURIComponent(origin.requestId)}`}>Open request</Link> : null}</p></details>
      : <span className="inline-flex rounded bg-slate-50 px-2 py-1 text-slate-700" title={title}>{label}</span>}
    {scan.rowKind === "request" ? <p className="mt-1 text-[10px] text-slate-500">Requested via: {SCAN_CREATION_SOURCES[scanCreationSource(scan.requestChannel)]}{scan.requestResolutionMode === "reused_existing_scan" ? " · Reused" : " · No new scan"}</p> : null}
  </td>;
}

function ClientChannelCell({ scan }: { scan: AdminScanListItem }) {
  const client = scan.clientName || (scan.clientFamily && scan.clientFamily !== "unknown" ? formatFilterLabel(scan.clientFamily) : "Not recorded");
  const channel = scan.executionChannel && scan.executionChannel !== "unknown"
    ? formatFilterLabel(scan.executionChannel)
    : SCAN_CREATION_SOURCES[scanCreationSource(scan.requestChannel)];
  return <td className="px-2.5 py-1.5">
    <p className="truncate font-semibold text-slate-700" title={client}>{client}</p>
    <p className="mt-0.5 truncate text-[10px] text-slate-500" title={channel}>{channel}</p>
  </td>;
}

const statuses = ["any", "no_go", "rejected", "failed", "running", "queued", "active", "limited", "completed"] as const;
const freshnesses = ["any", "fresh", "forced_fresh", "reused"] as const;
const accessValues = ["any", "clear", "blocked", "captcha", "robots_limited", "limited", "unknown"] as const;
const timeSpans = ADMIN_SCAN_ACTIVITY_PERIODS;
function normalizeStatus(value: string | undefined): AdminScanListStatus {
  return statuses.includes(value as AdminScanListStatus) ? value as AdminScanListStatus : "any";
}
function normalizeFreshness(value: string | undefined): AdminScanListFreshness {
  return freshnesses.includes(value as AdminScanListFreshness) ? value as AdminScanListFreshness : "any";
}
function normalizeAccess(value: string | undefined): AdminScanListAccess {
  return accessValues.includes(value as AdminScanListAccess) ? value as AdminScanListAccess : "any";
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

function InventoryCountCell({ value, label }: { value: { count: number; limited: boolean } | null | undefined; label: string }) {
  const count = value && (!value.limited || value.count > 0) ? `${value.count}${value.limited ? "+" : ""}` : "—";
  const title = value
    ? `${label}: ${value.count} retained on the starting page${value.limited ? "; partial coverage, total unknown" : ""}`
    : `${label}: starting-page evidence unavailable`;
  return <td className="px-2.5 py-1.5 font-medium tabular-nums text-slate-800" title={title}>{count}</td>;
}

function ScanSizeCell({ matrix }: { matrix: AdminScanListItem["evidenceMatrix"] }) {
  const website = matrix?.sizeMetrics?.website;
  const policy = matrix?.sizeMetrics?.privacyPolicy;
  return <><p className="truncate font-medium text-slate-700" title={website ? `${website.totalBytes.toLocaleString()} measured transfer bytes · ${website.completeness}` : undefined}>Site load {website ? `${website.megabytes.toFixed(2)} MB` : "—"}</p><p className="truncate text-[10px] text-slate-500" title={policy ? `${policy.compressedBytes?.toLocaleString() ?? "unknown"} compressed bytes · ${policy.url}` : undefined}>Policy {policy?.compressedKilobytes !== null && policy?.compressedKilobytes !== undefined ? `${policy.compressedKilobytes.toFixed(1)} KB` : "—"}</p></>;
}

function getScanFreshnessBadge(scan: Pick<AdminScanListItem, "freshRescanRequested" | "interruptionReason" | "linkedScanId" | "requestResolutionMode" | "rowKind" | "status">) {
  const requestAdmission = projectAdminRequestAdmission(scan);
  if (requestAdmission) {
    return { className: "bg-rose-50 text-rose-700 ring-1 ring-rose-100", label: requestAdmission.freshnessLabel };
  }
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
  if (scan.operationalStatus) return scan.operationalStatus;
  const requestAdmission = projectAdminRequestAdmission(scan);
  if (requestAdmission) {
    return { className: "bg-rose-500", label: requestAdmission.label };
  }
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

function AdminBasicScanTable({ scans }: { scans: AdminScanListItem[] }) {
  return <table className="w-full min-w-[1120px] text-left text-xs">
    <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>
      {["Status", "Activity", "Page", "Requester IP", "From", "Duration", "Scan ID", "Open"].map((label) => <th className="border-b border-slate-200 px-3 py-2" key={label}>{label}</th>)}
    </tr></thead>
    <tbody className="divide-y divide-slate-100">{scans.map((scan) => {
      const state = getOperationalStatus(scan);
      const activity = formatRequestedDateTime(scan.activityAt);
      return <tr className="h-14 hover:bg-slate-50" key={scan.activityId}>
        <td className="px-3 py-2" title={scan.noGoReason ?? state.label}><span className="inline-flex items-center gap-1.5 font-semibold"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${state.className}`} />{state.label}</span>{scan.rowKind === "request" ? <p className="mt-1 text-[10px] text-slate-500">Request-only</p> : null}</td>
        <td className="px-3 py-2 whitespace-nowrap" title={`Activity: ${formatAdminDateTime(scan.activityAt)} · Requested: ${formatAdminDateTime(scan.requestedAt ?? scan.createdAt)}`}><p>{activity.date}</p><p className="text-slate-500">{activity.time}</p></td>
        <td className="max-w-xs break-all px-3 py-2 font-semibold text-slate-800">{scan.pageUrl ?? "Page URL unavailable"}</td>
        <td className="px-3 py-2 font-mono text-[10px] text-slate-500" title={scan.requesterName ?? undefined}>{requesterIpLabel(scan)}</td>
        <td className="px-3 py-2 whitespace-nowrap">{scan.scanFromLabel}</td>
        <td className="px-3 py-2 whitespace-nowrap">{["queued", "running", "finalizing"].includes(scan.status) ? state.label : formatAdminScanDuration(scan) ?? "—"}</td>
        <td className="max-w-48 break-all px-3 py-2 font-mono text-[10px] text-slate-500">{scan.linkedScanId ?? scan.scanId}</td>
        <td className="px-3 py-2">{scan.linkedScanId && scan.scanViewHref ? <Link className="text-sky-800 underline" href={scan.scanViewHref} prefetch={false}>Open report</Link> : "—"}</td>
      </tr>;
    })}</tbody>
  </table>;
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
      second: "2-digit",
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
  const requestAdmission = projectAdminRequestAdmission(scan);
  if (requestAdmission) return `Admission · ${requestAdmission.detail}`;
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
  const activeCreatedVia = Object.hasOwn(SCAN_CREATION_SOURCES, resolvedSearchParams.createdVia ?? "") ? resolvedSearchParams.createdVia as ScanCreationSource : null;
  const activeOutcome = resolvedSearchParams.outcome?.trim().slice(0, 120) ?? "";
  const activeLanguage = resolvedSearchParams.language?.trim().slice(0, 80) ?? "";
  const activeIndustry = resolvedSearchParams.industry?.trim().slice(0, 200) ?? "";
  const activeScanFrom = SCAN_FROM_VALUES.includes(resolvedSearchParams.scanFrom as typeof SCAN_FROM_VALUES[number]) ? resolvedSearchParams.scanFrom as typeof SCAN_FROM_VALUES[number] : "any";
  const activeTimeSpan = resolveAdminScanActivityPeriod(resolvedSearchParams);
  const showReportDetails = resolvedSearchParams.details === "1";
  const trafficScope = resolveAdminTrafficScope(resolvedSearchParams);
  const { includeInternalQa: includeCanary, includeMacMini } = adminTrafficScopeVisibility(trafficScope);
  const excludeMacMiniScanBot = !includeMacMini;
  const hasFilters = Boolean(activeQuery) || activeStatus !== "any" || activeFreshness !== "any" || activeAccess !== "any" || Boolean(activeOutcome) || Boolean(activeLanguage) || Boolean(activeIndustry) || activeScanFrom !== "any" || activeTimeSpan !== "all";
  const filterOptionsPromise = withServerTiming("app.admin.scans.filter-options", () => getAdminScanFilterOptions());
  const scanPagePromise = withServerTiming("app.admin.scans.list", () => getAdminScanActivityPage(pageSize, (currentPage - 1) * pageSize, {
      query: activeQuery || null,
      createdVia: activeCreatedVia,
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
    }, showReportDetails));

  // Both panels await the same hydrated result and one cached database snapshot.
  const snapshotPromise = withServerTiming("app.admin.scans.operational_snapshot", async () => (await scanPagePromise).snapshot);
  const sharedParams = { ...resolvedSearchParams, timeSpan: activeTimeSpan, traffic: trafficScope };
  async function SnapshotPanel() {
    const operationalSnapshot = await snapshotPromise;
    const m = operationalSnapshot.metrics;
    const runDelta = operationalSnapshot.window.start ? adminOperationalSnapshotDelta(m.runs, operationalSnapshot.previous.runs) : null;
    const snapshotHref = (values: Record<string, string | null | undefined>) => adminScanActivityHref(sharedParams, values);
    const snapshotMetrics = [
      { label: "Runs", value: snapshotNumber(m.runs), detail: "physical runs", comparison: runDelta?.label, anomaly: runDelta?.anomaly },
      { label: "Request-only", value: snapshotNumber(m.requests), detail: "reuse or no new run" },
      { label: "Completed", value: snapshotNumber(m.completed), detail: "completed, usable runs", href: snapshotHref({ status: "completed" }) },
      { label: "Limited", value: snapshotNumber(m.limited), detail: "matching activity items", href: snapshotHref({ status: "limited" }) },
      { label: "Failed", value: snapshotNumber(m.failed), detail: "matching activity items", href: snapshotHref({ status: "failed" }) },
      { label: "Duration", value: `${snapshotDuration(m.p50)} / ${snapshotDuration(m.p95)}`, detail: "physical runs · p50 / p95" },
    ];
    const rate = (count: number) => snapshotPercentage(m.items > 0 ? count / m.items : null);
    const snapshotRates = [
      { label: "Completion", value: rate(m.completed), href: snapshotHref({ status: "completed" }) },
      { label: "Failures", value: rate(m.failed), href: snapshotHref({ status: "failed" }) },
      { label: "Limited", value: rate(m.limited), href: snapshotHref({ status: "limited" }) },
      { label: "Reuse", value: rate(m.reused), href: snapshotHref({ freshness: "reused" }) },
      { label: "No-go", value: snapshotNumber(m.no_go), href: snapshotHref({ status: "no_go" }) },
      { label: "Active", value: snapshotNumber(m.active), href: snapshotHref({ status: "active" }) },
    ];
    return <AdminOperationalSnapshot
        ariaLabel={`Scan activity trend: ${snapshotNumber(m.items)} matching items, ${m.runs} physical runs and ${m.requests} request-only items`}
        basePath="/app/admin/scans"
        breakdown={operationalSnapshot.regions.map((region) => ({ label: formatScanFromLabel(region.value as typeof SCAN_FROM_VALUES[number]), value: snapshotNumber(region.count), detail: `${region.runs} runs · ${region.requests} request-only`, href: snapshotHref({ scanFrom: region.value }) }))}
        health={{ label: m.newest_at ? `Latest matching activity: ${formatAdminDateTime(m.newest_at)}` : "No matching activity", status: m.newest_at ? "current" : "quiet" }}
        refreshedAt={formatAdminDateTime(operationalSnapshot.refreshedAt)}
        windowLabel={`${operationalSnapshot.window.start ? formatAdminDateTime(operationalSnapshot.window.start) : "All retained history"} — ${formatAdminDateTime(operationalSnapshot.window.end)} (exclusive cutoff)`}
        metrics={snapshotMetrics}
        period={activeTimeSpan}
        periodName="timeSpan"
        periodOptions={timeSpans.map((value) => ({ value, label: adminScanActivityPeriodLabel(value) }))}
        rates={snapshotRates}
        searchParams={sharedParams}
        subtitle={`Same filters as the table · ${adminScanActivityPeriodLabel(activeTimeSpan)} · rates use all matching activity items`}
        trend={operationalSnapshot.trend.map((bucket) => ({ key: String(bucket.n), label: formatAdminDateTime(bucket.bucket_start), value: bucket.items, title: `${formatAdminDateTime(bucket.bucket_start)} — ${formatAdminDateTime(bucket.bucket_end)}: ${bucket.items} items · ${bucket.runs} runs · ${bucket.requests} request-only · ${bucket.failed} failed · ${bucket.limited} limited`, className: bucket.failed > 0 ? "bg-rose-400 hover:bg-rose-500" : bucket.limited > 0 ? "bg-amber-400 hover:bg-amber-500" : undefined }))}
        trendTotal={`${snapshotNumber(m.items)} matching items · ${m.runs} runs + ${m.requests} request-only`}
      />;
  }

  async function ScanRows() {
    const [filterOptions, scanPage] = await Promise.all([filterOptionsPromise, scanPagePromise]);
    const totalCount = scanPage.totalCount;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const normalizedPage = Math.min(currentPage, totalPages);
    const scans = scanPage.items;
    const liveTargets = scans.flatMap((scan) => {
      if (!["queued", "running", "finalizing"].includes(scan.status)) return [];
      const id = scan.rowKind === "scan" ? scan.scanId : scan.requestPublicId;
      return id ? [{
        id,
        kind: scan.rowKind,
        status: scan.status
      } as const] : [];
    });

    return <Card className="min-w-0 overflow-hidden border-slate-200 bg-white">
      <CardHeader className="pb-2"><div className="flex flex-wrap items-end justify-between gap-2"><div><CardTitle>Scan activity</CardTitle><p className="mt-1 text-sm text-slate-500">Physical runs and request-only items matching the chart filters. Activity time: completion, start or creation for runs; request time for request-only items.</p></div><p className="text-sm text-slate-500">{snapshotNumber(totalCount)} matching items</p></div></CardHeader>
      <AdminTableRefreshBoundary basePath="/app/admin/scans" label="Refreshing scans">
      <CardContent className="min-w-0 space-y-3 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AdminScansAutoRefresh targets={liveTargets} />
          <Link className="app-raised-button rounded-full px-3 py-1.5 text-sm font-semibold text-sky-800" href={adminScanActivityHref(sharedParams, { details: showReportDetails ? null : "1", page: String(currentPage) })} prefetch={false}>{showReportDetails ? "Show basic rows" : "Show report details"}</Link>
        </div>
        {!showReportDetails ? <p className="text-xs text-slate-500">Basic scan rows load first. Scores, consent evidence, vendor counts and other report columns are available through Show report details or the individual report.</p> : null}
        <AdminScansFilterForm hasFilters={hasFilters || Boolean(activeCreatedVia)} submitFirst>
          <select aria-label="Filter scans by creation source" className="h-10 w-[11rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeCreatedVia ?? ""} name="createdVia"><option value="">Any creation source</option>{Object.entries(SCAN_CREATION_SOURCES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input name="traffic" type="hidden" value={trafficScope} />
          {showReportDetails ? <input name="details" type="hidden" value="1" /> : null}
          <input aria-label="Filter by domain, scan ID, email, requester, IP, or source; use field not-equal syntax to exclude" className="h-10 min-w-[28rem] flex-[1_1_32rem] rounded-lg border border-slate-300 bg-white px-3 text-sm" defaultValue={activeQuery} name="q" placeholder="Domain, scan_id, email, requester, IP · source:homepage-anonymous · ip!=66.*" />
          <select aria-label="Filter scans by status" className="h-10 w-[7.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeStatus} name="status">{statuses.map((status) => <option key={status} value={status}>{status === "any" ? "Any status" : formatFilterLabel(status)}</option>)}</select>
          <select aria-label="Filter scans by freshness" className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeFreshness} name="freshness">{freshnesses.map((freshness) => <option key={freshness} value={freshness}>{freshness === "any" ? "Any freshness" : freshness === "fresh" ? "Fresh" : freshness === "forced_fresh" ? "Forced fresh" : "Reused <24h"}</option>)}</select>
          <select aria-label="Filter scans by access posture" className="h-10 w-[8rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeAccess} name="access"><option value="any">Any access</option>{accessValues.slice(1).map((access) => <option key={access} value={access}>{access === "robots_limited" ? "Robots-limited" : access === "captcha" ? "CAPTCHA" : formatFilterLabel(access)}</option>)}</select>
          <select aria-label="Filter scans by outcome" className="h-10 w-[12rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeOutcome} name="outcome"><option value="">Any outcome</option>{filterOptions.outcomes.map((outcome) => <option key={outcome} value={outcome}>{formatFilterLabel(outcome)}</option>)}</select>
          <select aria-label="Filter scans by language" className="h-10 w-[7rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeLanguage} name="language"><option value="">Any language</option>{filterOptions.languages.map((language) => <option key={language} value={language}>{language}</option>)}</select>
          <select aria-label="Filter scans by industry" className="h-10 w-[10.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeIndustry} name="industry"><option value="">Any industry</option>{filterOptions.industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}</select>
          <select aria-label="Filter scans by origin" className="h-10 w-[7.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeScanFrom} name="scanFrom"><option value="any">Any origin</option>{SCAN_FROM_VALUES.map((scanFrom) => <option key={scanFrom} value={scanFrom}>{formatScanFromLabel(scanFrom)}</option>)}</select>
          <select aria-label="Filter scans by time span" className="h-10 w-[8.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-xs" defaultValue={activeTimeSpan} name="timeSpan">{timeSpans.map((timeSpan) => <option key={timeSpan} value={timeSpan}>{adminScanActivityPeriodLabel(timeSpan)}</option>)}</select>
        </AdminScansFilterForm>
        <PaginationControls
          basePath="/app/admin/scans"
          itemLabel="scan activity items"
          page={normalizedPage}
          pageCount={totalPages}
          pageSize={pageSize}
          totalCount={totalCount}
          visibleCount={scans.length}
          searchParams={{ createdVia: activeCreatedVia ?? "", q: activeQuery, status: activeStatus, freshness: activeFreshness, access: activeAccess, outcome: activeOutcome, language: activeLanguage, industry: activeIndustry, scanFrom: activeScanFrom, timeSpan: activeTimeSpan, traffic: trafficScope, details: showReportDetails ? "1" : "" }}
          showPageJump
        />
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200">
          {showReportDetails ? <table className="w-[3957px] min-w-[3957px] table-fixed text-left text-xs">
            <colgroup>
              <col style={{ width: "100px" }} /><col style={{ width: "165px" }} /><col style={{ width: "115px" }} /><col style={{ width: "173px" }} /><col style={{ width: "75px" }} /><col style={{ width: "190px" }} /><col style={{ width: "170px" }} />
              <col style={{ width: "70px" }} /><col style={{ width: "100px" }} /><col style={{ width: "75px" }} /><col style={{ width: "65px" }} /><col style={{ width: "65px" }} /><col style={{ width: "65px" }} /><col style={{ width: "156px" }} />
              <col style={{ width: "80px" }} /><col style={{ width: "205px" }} /><col style={{ width: "135px" }} /><col style={{ width: "145px" }} />
              <col style={{ width: "65px" }} /><col style={{ width: "75px" }} /><col style={{ width: "190px" }} />
              <col style={{ width: "180px" }} /><col style={{ width: "130px" }} /><col style={{ width: "65px" }} /><col style={{ width: "100px" }} /><col style={{ width: "65px" }} />
              <col style={{ width: "80px" }} /><col style={{ width: "240px" }} /><col style={{ width: "160px" }} /><col style={{ width: "190px" }} /><col style={{ width: "190px" }} /><col style={{ width: "78px" }} />
            </colgroup>
            <thead className="sticky top-0 z-20 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                {[
                  { label: "Status", className: "sticky left-0 z-30 bg-slate-50" },
                  { label: "Requester IP" }, { label: "Activity", title: "Same timestamp used by the chart, filters and latest matching activity. Original request time is in the tooltip." }, { label: "Page" }, { label: "# Pages", title: "Pages scanned; full-site counts include completed and partial captures" }, { label: "Created via" }, { label: "Client / channel" }, { label: "Tranco" },
                  { label: "Score" }, { label: "Top" }, { label: "GPC#", title: "Distinct canonical entities qualifying for a GPC deduction" }, { label: "Rej#", title: "Distinct canonical entities qualifying for a post-Reject deduction, deduplicated across cookies and services" }, { label: "GPP#", title: "Distinct canonical entities with verified GPP propagation inconsistencies qualifying for the applied deduction" }, { label: "Privacy / CMP" },
                  { label: "A/R/O" }, { label: "Transparency" }, { label: "Transport" }, { label: "Runtime" }, { label: "# HL" }, { label: "# Forms" }, { label: "CMS" }, { label: "Size" }, { label: "Time" }, { label: "Outcome" }, { label: "From" }, { label: "Freshness" }, { label: "Language" }, { label: "Access" }, { label: "Industry" },
                  { label: "Scan ID" }, { label: "Scanner egress" },
                  { label: "Open", className: "sticky right-0 z-30 bg-slate-50" }
                ].map(({ label, className, title }) => <th key={label} title={title} className={`border-b border-slate-200 px-2.5 py-1.5 font-semibold ${className ?? ""}`}>{label}</th>)}
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
                const noGoReason = status.label === "No-go"
                  ? scan.noGoReason || scan.interruptionLabel || (scan.captchaFlag ? "CAPTCHA" : scan.blockedFlag || scan.accessPostureClass === "early_loss" ? "Blocked" : "Reason unavailable")
                  : null;
                const freshness = getScanFreshnessBadge(scan);
                const duration = scan.linkedScanId ? formatAdminScanDuration(scan) : null;
                const scanFromMarker = getScanFromMarkerInput(scan.scanFromValue);
                const matrix = scan.evidenceMatrix;
                const cmpVendorName = scan.noGoFlag ? null : scan.cmpVendorName?.trim() || matrix?.privacyConsent.cmpVendorName?.trim() || null;
                const requestedDateTime = formatRequestedDateTime(scan.activityAt);
                const accessLabel = getAccessLabel(scan);
                return (
                  <tr key={scan.activityId} className="group h-[52px] hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 bg-white px-2.5 py-1.5 group-hover:bg-slate-50 has-[details[open]]:z-40" title={status.label}>
                      <span className="inline-flex items-center gap-1.5 font-semibold"><span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${status.className}`} /><span className={status.label === "No-go" ? "text-rose-700" : "text-slate-700"}>{status.label}</span></span>
                      {noGoReason ? <details className="relative mt-0.5 min-w-0 text-[10px] leading-4 text-slate-500">
                        <summary aria-label={`Expand no-go reason: ${noGoReason}`} className="block cursor-pointer list-none truncate rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden" title={noGoReason}>{noGoReason}</summary>
                        <p className="absolute left-0 top-full z-40 mt-1 w-72 max-w-[calc(100vw-3rem)] whitespace-normal break-words rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg">{noGoReason}</p>
                      </details> : null}
                    </td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${provenance.className}`} title={scan.requesterName ?? provenance.label}>{scan.requesterName ?? provenance.label}</span><p className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={`${requesterIpLabel(scan)} · ${scan.requesterIpSource.replaceAll("_", " ")}`}>{requesterIpLabel(scan)}</p></td>
                    <td className="px-2.5 py-1.5 text-[10px] leading-4 text-slate-600" title={`Activity: ${formatAdminDateTime(scan.activityAt)} · Requested: ${formatAdminDateTime(scan.requestedAt ?? scan.createdAt)}`}><p className="truncate">{requestedDateTime.date}</p><p className="truncate text-slate-500">{requestedDateTime.time}</p></td>
                    <td className="px-2.5 py-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="min-w-0 flex-1 line-clamp-2 break-all font-semibold leading-4 text-slate-900" title={scan.pageUrl ?? "Page URL unavailable"}>{scan.pageUrl ?? "Page URL unavailable"}</p>
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">{scan.scanType}</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 font-medium tabular-nums text-slate-800">{scan.linkedScanId ? snapshotNumber(scan.fullSitePagesScanned ?? scan.pagesScanned) : "—"}</td>
                    <CreatedViaCell scan={scan} />
                    <ClientChannelCell scan={scan} />
                    <td className="px-2.5 py-1.5 font-medium text-slate-700">{scan.trancoRank ? `#${scan.trancoRank.toLocaleString()}` : "—"}</td>
                    <td className="px-2.5 py-1.5">
                      {[
                        { label: "EU", value: scan.certscoreOverall, title: [scan.scoreLabel, scan.scoreVersion, scan.scoreCoverageConfidence ? `${scan.scoreCoverageConfidence} coverage` : null, scan.scoreScoredAt ? `scored ${scan.scoreScoredAt}` : null].filter(Boolean).join(" · ") || undefined },
                        { label: "CA", value: scan.californiaScore ?? null, title: scan.californiaScoreVersion ?? undefined }
                      ].map(({ label, value, title }) => <p key={label} className="flex items-baseline justify-between gap-1 whitespace-nowrap leading-4" title={title} aria-label={`${label} score: ${value === null ? "unavailable" : `${value} out of 100`}`}><span className="text-[10px] font-medium text-slate-500">{label}</span><span><span className="font-semibold tabular-nums text-slate-950">{value ?? "—"}</span>{value !== null ? <span className="text-[10px] text-slate-400">/100</span> : null}</span></p>)}
                    </td>
                    <td className="px-2.5 py-1.5"><span className="text-sm font-semibold text-slate-950">{scan.topFindingCount ?? "—"}</span></td>
                    <td className="px-2.5 py-1.5 font-medium tabular-nums text-slate-800" title="Distinct entities qualifying for a GPC deduction; — means unavailable or entity attribution unresolved">{scan.scoringEntityCounts?.gpc ?? "—"}</td>
                    <td className="px-2.5 py-1.5 font-medium tabular-nums text-slate-800" title="Distinct entities qualifying for a post-Reject deduction across cookies and services; — means unavailable or entity attribution unresolved">{scan.scoringEntityCounts?.reject ?? "—"}</td>
                    <td className="px-2.5 py-1.5 font-medium tabular-nums text-slate-800" title="Distinct entities with GPP propagation inconsistencies qualifying for the applied deduction; — means unavailable or not assessed">{scan.scoringEntityCounts?.gpp ?? "—"}</td>
                    <td className="px-2.5 py-1.5">
                      <p className="line-clamp-2 break-words font-medium leading-4 text-slate-800" title={[cmpVendorName, evidenceTitle("Consent mechanism", matrix?.privacyConsent.mechanism ?? null)].filter(Boolean).join(" · ")}>
                        {cmpVendorName ?? <>Mechanism {evidenceMark(matrix?.privacyConsent.mechanism ?? null)}</>}
                      </p>
                      <p className="mt-0.5 flex gap-2 text-[10px]"><EvidenceCode code="Privacy" label="Privacy notice" result={matrix?.privacyConsent.privacyNotice ?? null} /><EvidenceCode code="CMP" label="CMP framework" result={matrix?.privacyConsent.cmp ?? null} /></p>
                    </td>
                    <td className="px-2.5 py-1.5"><p className="flex gap-2 text-[10px]"><EvidenceCode code="A" label="Accept" result={matrix?.privacyConsent.accept ?? null} /><EvidenceCode code="R" label="Reject" result={matrix?.privacyConsent.reject ?? null} /><EvidenceCode code="O" label="Options" result={matrix?.privacyConsent.options ?? null} /></p><p className="truncate text-[10px] text-slate-400">Canonical controls</p></td>
                    <td className="px-2.5 py-1.5"><EvidenceGroupCell aggregate={matrix?.transparency.aggregate ?? null} labels={TRANSPARENCY_LABELS} policyEvidence={matrix?.policyEvidence} results={matrix?.transparency.results ?? null} /></td>
                    <td className="px-2.5 py-1.5"><EvidenceGroupCell aggregate={matrix?.transport.aggregate ?? null} labels={TRANSPORT_LABELS} results={matrix?.transport.results ?? null} /></td>
                    <td className="px-2.5 py-1.5"><EvidenceGroupCell aggregate={matrix?.runtime.aggregate ?? null} labels={RUNTIME_LABELS} results={matrix?.runtime.results ?? null} /></td>
                    <InventoryCountCell value={scan.inventory?.hiddenLinks} label="Hidden outbound links" />
                    <InventoryCountCell value={scan.inventory?.forms} label="Forms and input surfaces" />
                    <td className="px-2.5 py-1.5 text-slate-700" title={scan.inventory?.cms ? `${scan.inventory.cms} · Passive starting-page detection; versions are page-declared, not confirmed runtime versions` : "CMS evidence unavailable"}><span className="line-clamp-2 break-words">{scan.inventory?.cms ?? "—"}</span></td>
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
                    <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[10px] text-slate-700" title={scan.linkedScanId ?? scan.scanId}>{scan.linkedScanId ?? scan.scanId}</p><p className="mt-0.5 flex gap-1.5 text-[9px]">{scan.linkedScanId ? <><Link className="text-sky-700 hover:underline" href={adminOperationalSnapshotHref("/app/admin/analytics", { q: scan.linkedScanId, traffic: trafficScope })} prefetch={false}>Events</Link><Link className="text-sky-700 hover:underline" href={adminOperationalSnapshotHref("/app/admin/pulse", { q: scan.linkedScanId, traffic: trafficScope })} prefetch={false}>API</Link><Link className="text-sky-700 hover:underline" href={adminOperationalSnapshotHref("/app/admin/mcp", { q: scan.linkedScanId, traffic: trafficScope })} prefetch={false}>MCP</Link></> : null}</p></td>
                    <td className="px-2.5 py-1.5"><p className="truncate font-mono text-[10px] text-slate-700" title={scan.scannerEgressId ?? "Scanner egress not recorded"}>{scan.scannerEgressId ?? "Not recorded"}</p><p className="mt-0.5 truncate text-[10px] text-slate-400" title={scan.scannerEgressProvider ?? undefined}>{scan.scannerEgressProvider ?? "Outbound runtime"}</p></td>
                    <td className="sticky right-0 z-10 border-l border-slate-100 bg-white px-2 py-1.5 group-hover:bg-slate-50">{scan.linkedScanId && scan.scanViewHref ? <AdminScanActions compact domainLabel={scan.domainHostname ?? scan.pageUrl ?? "Scanned website"} scanId={scan.linkedScanId} scanViewHref={scan.scanViewHref} visualEvidenceHref={scan.visualEvidenceHref} /> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table> : <AdminBasicScanTable scans={scans} />}
        </div>
      </CardContent>
      </AdminTableRefreshBoundary>
    </Card>;
  }
  return (
    <AdminNavigationProvider>
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Scan Admin</h2>
          <p className="text-sm text-slate-500">Requester IP identifies who reached CertScore.ai. Client names are recorded labels, not verified identities. Scanner egress identifies the outbound runtime that reached the target site.</p>
        </div>
        <AdminTrafficFilters basePath="/app/admin/scans" scope={trafficScope} searchParams={resolvedSearchParams} />
      </div>

    <AdminDataBoundary label="Scan snapshot"><Suspense fallback={<AdminDataLoading label="Scan snapshot" />}><SnapshotPanel /></Suspense></AdminDataBoundary>

    <AdminDataBoundary label="Scan activity"><Suspense fallback={<AdminDataLoading label="Scan activity" />}><ScanRows /></Suspense></AdminDataBoundary>
    </div>
    </AdminNavigationProvider>
  );
}

export default async function AdminScansPage({ searchParams }: AdminScansPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  return (
    <Suspense key={JSON.stringify(resolvedSearchParams)} fallback={<AdminScansContentFallback />}>
      <AdminScansContent resolvedSearchParams={resolvedSearchParams} />
    </Suspense>
  );
}
