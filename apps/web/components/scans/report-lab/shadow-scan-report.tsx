import type { ReactNode } from "react";
import { SiteFooter } from "../../layout/site-footer";
import { SiteHeader } from "../../layout/site-header";
import { DomainScanForm } from "../../marketing/domain-scan-form";
import { AgentSummaryActions, ShareReportActions } from "../share-report-actions";
import { getScanFromMarkerInput, ScanFromMarker } from "../scan-from-icons";
import type { ServerScanFrom } from "../scan-from-select";
import { VendorBrandChip } from "../vendor-brand-chip";
import { CompactRejectPathCard } from "../executive-summary-card";
import { getGdprEprivacyPostureTone } from "../../../lib/scans/regulatory-coverage-score";
import { ShadowReportShareMenu } from "./shadow-report-actions";
import { ShadowPolicyEvidenceViewer } from "./shadow-policy-evidence-viewer";
import {
  RegulatoryChecklistCorrectionSteps,
  RegulatoryChecklistEvidenceDetails,
} from "../regulatory-checklist-evidence-details";
import {
  SHADOW_PRIVACY_NOTICE_EVIDENCE,
  SHADOW_REPORT,
  SHADOW_REPORT_SOURCE_URL,
  type ShadowEvidenceRow,
  type ShadowEvidenceStatus,
  type ShadowFinding,
  type ShadowReportData,
  type ShadowReportVariant
} from "./shadow-report-data";

type ShadowScanReportProps = {
  allowRestrictedScanOptions?: boolean;
  defaultScanFrom?: ServerScanFrom;
  mode?: "authenticated" | "public";
  report?: ShadowReportData;
  variant: ShadowReportVariant;
};

const monoClass = "font-mono tabular-nums";
function statusClasses(status: ShadowEvidenceStatus) {
  if (status === "Potential gap") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "Partial concern") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "Observed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Not observed") return "border-zinc-200 bg-zinc-50 text-zinc-700";
  if (status === "Limited") return "border-zinc-300 bg-zinc-100 text-zinc-700";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function StatusBadge({ status }: { status: ShadowEvidenceStatus }) {
  const symbol = status === "Observed" ? "✓" : status === "Potential gap" ? "!" : status === "Partial concern" ? "±" : "—";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.68rem] font-semibold uppercase ${statusClasses(status)}`}>
      <span aria-hidden="true">{symbol}</span>
      {status}
    </span>
  );
}

function reportScanFrom(value: string): ServerScanFrom {
  return value === "eu_de" || value === "california" ? value : "eu_ie";
}

function ReportIdentity({
  allowRestrictedScanOptions = false,
  compact = false,
  defaultScanFrom,
  enhancedActions = false,
  mode = "public",
  report,
}: {
  allowRestrictedScanOptions?: boolean;
  compact?: boolean;
  defaultScanFrom?: ServerScanFrom;
  enhancedActions?: boolean;
  mode?: "authenticated" | "public";
  report: ShadowReportData;
}) {
  const visualEvidence = report.scan.visualEvidenceHref ?? null;
  return (
    <header className={compact ? "space-y-2" : "space-y-4"}>
      <div className={`flex flex-col gap-3 ${enhancedActions ? "lg:flex-row lg:items-center lg:justify-between" : ""}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium text-zinc-500">
          {enhancedActions ? (
            <div className="[&_.app-raised-button]:!h-[1.625rem] [&_.app-raised-button]:!w-[1.625rem] [&_.app-raised-button]:!rounded-md [&_.app-raised-button]:!border [&_.app-raised-button]:!border-zinc-300 [&_.app-raised-button]:!bg-white [&_.app-raised-button]:!text-zinc-600 [&_.app-raised-button]:!shadow-none [&_.app-raised-button]:hover:!border-zinc-500 [&_.app-raised-button]:hover:!text-zinc-950">
              <ShareReportActions
                domainLabel={report.scan.host}
                scanId={report.scan.id}
                visualEvidenceHref={visualEvidence}
                visualEvidenceOnly
              />
            </div>
          ) : null}
          <span className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-2 py-1">
            <ScanFromMarker {...getScanFromMarkerInput(report.scan.originCode)} selected />
            Executed from {report.scan.origin}
          </span>
          <span className={monoClass}>{report.scan.duration}</span>
        </div>
        {enhancedActions ? (
          <div className="shadow-scan-next w-full lg:max-w-[31rem] [&_.scan-report-button]:!rounded-md [&_.scan-report-button]:!border-zinc-300 [&_.scan-report-button]:!bg-white [&_.scan-report-button]:!text-zinc-700 [&_.scan-report-button]:!shadow-none [&_.ui-button]:!rounded-md [&_.ui-button]:!border-sky-700 [&_.ui-button]:!bg-none [&_.ui-button]:!bg-sky-600 [&_.ui-button]:!text-white [&_.ui-button]:!shadow-[0_4px_12px_rgba(2,132,199,0.22)] [&_.ui-button]:disabled:!border-sky-300 [&_.ui-button]:disabled:!bg-sky-100 [&_.ui-button]:disabled:!text-sky-700 [&_.ui-button]:disabled:!opacity-100 [&_input]:!h-10 [&_input]:!rounded-md [&_input]:!border [&_input]:!border-zinc-300 [&_input]:!bg-white [&_input]:!pl-3 [&_input]:!text-sm [&_input]:!shadow-none [&_input]:focus:!border-zinc-500 [&_input]:focus:!ring-1 [&_input]:focus:!ring-zinc-200">
            <DomainScanForm
              allowLocalExtensionScan={mode === "authenticated"}
              allowRestrictedScanOptions={allowRestrictedScanOptions}
              buttonLabel="Scan"
              compact
              defaultScanFrom={defaultScanFrom ?? reportScanFrom(report.scan.originCode)}
              inputLabel="Scan another website"
              inputPlaceholder="Scan next website"
              mode="full"
              scanSource={mode === "authenticated" ? "dashboard" : "homepage"}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-500">{report.scan.createdAt}</p>
          <h1 className={`${compact ? "mt-1 text-2xl" : "mt-2 text-3xl"} max-w-5xl break-words font-semibold text-zinc-950`}>
            {report.scan.host}
          </h1>
          <p className={`${monoClass} mt-2 hidden break-all text-xs text-zinc-500 sm:block`}>{report.scan.url}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {enhancedActions ? (
            <ShadowReportShareMenu
              reportUrl={report.scan.reportUrl ?? SHADOW_REPORT_SOURCE_URL}
              scanId={report.scan.id}
              siteLabel={report.scan.host}
            />
          ) : (
            <a
              className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              href={SHADOW_REPORT_SOURCE_URL}
              rel="noreferrer"
              target="_blank"
            >
              Exact report <span aria-hidden="true">↗</span>
            </a>
          )}
          <a
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-semibold text-zinc-800 hover:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            href="#evidence"
          >
            Evidence index <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </header>
  );
}

function ScoreScale({ compact = false, report }: { compact?: boolean; report: ShadowReportData }) {
  const score = report.score.value;
  const scoreColor = getGdprEprivacyPostureTone(score).ringColor;
  const priorityCount = report.findings.length;
  const assessment = priorityCount === 0
    ? "No priority issues"
    : priorityCount <= 2
      ? "Narrow review"
      : priorityCount <= 4
        ? "Targeted review"
        : "Broader review";
  const focusAreas = [...new Set(report.findings.map((finding) => finding.focus))].slice(0, 2);
  const focus = priorityCount === 0
    ? "No projected top findings in the retained evidence."
    : `${priorityCount} priority item${priorityCount === 1 ? "" : "s"}${focusAreas.length > 0 ? ` across ${focusAreas.join(" and ").toLowerCase()}` : ""}.`;
  return (
    <div className="flex items-center gap-4">
      <div
        aria-label={`Overall score ${score} out of 100`}
        className={`${compact ? "h-24 w-24" : "h-28 w-28"} relative flex shrink-0 items-center justify-center rounded-full p-2`}
        role="img"
        style={{ background: `conic-gradient(${scoreColor} 0 ${score}%, #e4e4e7 ${score}% 100%)` }}
      >
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
          <strong className={`${monoClass} text-3xl font-semibold leading-none text-zinc-950`}>{score}</strong>
          <span className={`${monoClass} mt-1 text-[0.65rem] text-zinc-500`}>/100</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 border-l border-zinc-200 pl-4">
        <p className="text-[0.68rem] font-semibold uppercase text-zinc-500">Overall score</p>
        <p className="mt-1 text-lg font-semibold leading-tight text-zinc-950">{assessment}</p>
        <p className="mt-2 overflow-hidden text-xs leading-5 text-zinc-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{focus}</p>
      </div>
    </div>
  );
}

function CoverageBar({ detailed = false, report }: { detailed?: boolean; report: ShadowReportData }) {
  const coverage = report.coverage;
  const rowCount = Math.max(coverage.rows, 1);
  const segments = [
    { label: "Concern", value: coverage.concern, className: "bg-rose-500" },
    { label: "Partial", value: coverage.partial, className: "bg-amber-500" },
    { label: "Review", value: coverage.review, className: "bg-orange-400" },
    { label: "Context", value: coverage.contextual, className: "bg-sky-400" },
    { label: "Limited", value: coverage.limited, className: "bg-zinc-400" },
    { label: "Positive", value: coverage.positive, className: "bg-emerald-600" }
  ];

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100" role="img" aria-label="Checklist rating mix">
        {segments.map((segment) => (
          <span
            className={segment.className}
            key={segment.label}
            style={{ width: `${(segment.value / rowCount) * 100}%` }}
          />
        ))}
      </div>
      <div className={`mt-3 grid ${detailed ? "grid-cols-2 gap-3 sm:grid-cols-6" : "grid-cols-6 gap-1"}`}>
        {segments.map((segment) => (
          <div className={detailed ? "border-l-2 border-zinc-200 pl-3" : "min-w-0"} key={segment.label}>
            <p className={`${monoClass} text-sm font-semibold text-zinc-950`}>{segment.value}</p>
            <p className="truncate text-[0.65rem] font-medium text-zinc-500">{segment.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RatingMix({ report }: { report: ShadowReportData }) {
  const coverage = report.coverage;
  const segments = [
    { label: "concern", value: coverage.concern, color: "#e11d48" },
    { label: "partial", value: coverage.partial, color: "#d97706" },
    { label: "review", value: coverage.review, color: "#f59e0b" },
    { label: "positive", value: coverage.positive, color: "#10b981" },
    { label: "contextual", value: coverage.contextual, color: "#0ea5e9" },
    { label: "limited", value: coverage.limited, color: "#94a3b8" }
  ].filter((segment) => segment.value > 0);
  const summary = segments.map((segment) => `${segment.value} ${segment.label}`).join(", ");

  return (
    <div
      aria-label={`Checklist rating mix: ${summary}`}
      className="w-full max-w-[43rem] border-y border-zinc-200 py-3 lg:ml-auto"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[0.68rem] font-semibold uppercase text-zinc-500">Rating mix</p>
        <p className={`${monoClass} text-xs font-semibold text-zinc-800`}>{coverage.rows} rows</p>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-zinc-100" role="img">
        {segments.map((segment) => (
          <span
            aria-label={`${segment.value} ${segment.label}`}
            key={segment.label}
            style={{ backgroundColor: segment.color, width: `${(segment.value / coverage.rows) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5">
        {segments.map((segment) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.68rem] text-zinc-500" key={segment.label}>
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className={`${monoClass} font-semibold text-zinc-950`}>{segment.value}</span>
            <span>{segment.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function CompactMetrics({ report }: { report: ShadowReportData }) {
  const metrics = [
    { label: "Third-party requests", value: report.metrics.thirdPartyRequests, note: "Retained" },
    { label: "Non-essential storage", value: report.metrics.nonEssentialStorage ?? "—", note: report.metrics.nonEssentialStorage === null ? "Not classified" : "Pre-consent" },
    { label: "Tracker footprint", value: report.metrics.vendors, note: `${report.metrics.domains} domains` },
    { label: "Usable evidence", value: report.coverage.usableEvidence, note: `of ${report.coverage.rows} rows` }
  ];

  return (
    <dl className="grid grid-cols-2 border-y border-zinc-200 sm:grid-cols-4">
      {metrics.map((metric, index) => (
        <div className={`py-4 ${index % 2 === 0 ? "pr-4" : "border-l border-zinc-200 pl-4"} sm:border-l sm:px-5 sm:first:border-l-0 sm:first:pl-0`} key={metric.label}>
          <dt className="text-xs font-medium text-zinc-500">{metric.label}</dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className={`${monoClass} text-2xl font-semibold text-zinc-950`}>{metric.value}</span>
            <span className="text-xs text-zinc-500">{metric.note}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ControlStatusGrid({ compact = false, report }: { compact?: boolean; report: ShadowReportData }) {
  const controls = [
    { label: "Accept", value: report.controls.accept },
    { label: "Reject", value: report.controls.reject },
    { label: "Options", value: report.controls.options }
  ];

  return (
    <div className="grid grid-cols-3 divide-x divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      {controls.map((control) => {
        const observed = control.value === "Observed";
        const unknown = control.value === "Unknown";
        return (
        <div className={`${compact ? "px-2 py-2.5" : "px-4 py-4"} relative ${observed ? "bg-emerald-50/70" : "bg-white"}`} key={control.label}>
          <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${observed ? "bg-emerald-500" : unknown ? "bg-sky-300" : "bg-zinc-200"}`} />
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className={`inline-flex ${compact ? "h-5 w-5" : "h-7 w-7"} shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset ${observed ? "bg-emerald-600 text-white ring-emerald-600" : unknown ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-zinc-100 text-zinc-500 ring-zinc-200"}`}>
              {observed ? "✓" : unknown ? "?" : "—"}
            </span>
            <span className={`${compact ? "text-[0.68rem]" : "text-sm"} font-semibold text-zinc-900`}>{control.label}</span>
          </div>
          {!compact ? <p className={`mt-3 text-xs font-medium ${observed ? "text-emerald-700" : "text-zinc-500"}`}>{control.value}</p> : null}
        </div>
      )})}
    </div>
  );
}

function SignalSnapshot({ report }: { report: ShadowReportData }) {
  const consentVendor = report.consentVendor ?? "Not identified";
  const privacyUrls = [...new Set(report.gdprTransparencyRows.flatMap((row) => row.policyEvidence?.sourceUrl ? [row.policyEvidence.sourceUrl] : []))];
  const observedTransportRows = report.transportRows.filter((row) => row.status === "Observed").length;
  const observedControls = Object.values(report.controls).filter((value) => value === "Observed").length;
  return (
    <div className="mt-4 border-t border-zinc-950">
      <p className="py-2 text-xs font-semibold uppercase text-zinc-500">Signal snapshot</p>
      <div className="divide-y divide-zinc-200 border-y border-zinc-200">
        <details className="group/signal py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="text-xs font-medium text-zinc-500">Consent platform</span>
            <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-zinc-800">
              <span>{consentVendor}</span>
              <span aria-hidden="true" className="text-zinc-400 transition group-open/signal:rotate-45">+</span>
            </span>
          </summary>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <VendorBrandChip className="max-w-[13rem]" label={consentVendor} showMeta={false} />
            <p className="text-xs leading-5 text-zinc-600">Consent-platform identity retained in the canonical runtime and consent projection.</p>
          </div>
        </details>
        <details className="group/signal py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="text-xs font-medium text-zinc-500">Tracker footprint</span>
            <span className="flex items-center gap-2">
              <span className={`${monoClass} text-xs font-semibold text-zinc-800`}>{report.metrics.vendors} vendors · {report.metrics.domains} domains</span>
              <span aria-hidden="true" className="text-zinc-400 transition group-open/signal:rotate-45">+</span>
            </span>
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.trackerVendors.map((vendor) => {
              const inventoryRow = report.inventory.find((row) => row.vendor === vendor);
              return <VendorBrandChip category={inventoryRow?.purpose} key={vendor} label={vendor} showMeta />;
            })}
          </div>
        </details>
        <details className="group/signal py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="text-xs font-medium text-zinc-500">Policy surfaces</span>
            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-800"><span className={monoClass}>{privacyUrls.length} found</span><span aria-hidden="true" className="text-zinc-400 transition group-open/signal:rotate-45">+</span></span>
          </summary>
          <ul className={`${monoClass} mt-3 space-y-2 break-all text-[0.68rem] leading-5 text-zinc-600`}>
            {privacyUrls.length > 0 ? privacyUrls.map((url) => <li key={url}>{url}</li>) : <li>No public policy URL was retained in the display projection.</li>}
          </ul>
        </details>
        <details className="group/signal py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="text-xs font-medium text-zinc-500">HTTPS / TLS</span>
            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-800"><span className={monoClass}>{observedTransportRows} of {report.transportRows.length} observed</span><span aria-hidden="true" className="text-zinc-400 transition group-open/signal:rotate-45">+</span></span>
          </summary>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-600">
            {report.transportRows.map((row) => (
              <li className="flex items-center gap-2" key={row.id}>
                <span aria-hidden="true" className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ring-1 ring-inset ${row.status === "Observed" ? "bg-emerald-600 text-white ring-emerald-600" : "bg-zinc-100 text-zinc-500 ring-zinc-200"}`}>{row.status === "Observed" ? "✓" : "—"}</span>
                <span>{row.title}</span>
              </li>
            ))}
          </ul>
        </details>
        <details className="group/signal py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="text-xs font-medium text-zinc-500">Consent controls</span>
            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-800">{observedControls} of 3 observed <span aria-hidden="true" className="text-zinc-400 transition group-open/signal:rotate-45">+</span></span>
          </summary>
          <div className="mt-3"><ControlStatusGrid compact report={report} /></div>
          {report.rejectPath ? (
            <div className="mt-3" data-testid="timeline-reject-path-card">
              <CompactRejectPathCard projection={report.rejectPath} />
            </div>
          ) : null}
        </details>
        {report.metrics.forms > 0 ? (
          <details className="group/signal py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="text-xs font-medium text-zinc-500">Form surface</span>
              <span className="flex items-center gap-2 text-xs font-semibold text-zinc-800"><span className={monoClass}>{report.metrics.forms} {report.metrics.forms === 1 ? "form" : "forms"} · {report.metrics.fields} {report.metrics.fields === 1 ? "field" : "fields"}</span><span aria-hidden="true" className="text-zinc-400 transition group-open/signal:rotate-45">+</span></span>
            </summary>
            <p className="mt-3 text-xs leading-5 text-zinc-600">Read-only main-document inventory. Field values were not retained.</p>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function BenchmarkComparison({ report }: { report: ShadowReportData }) {
  const benchmarkLabel = report.scan.benchmark.replace(/\s+\(likely [^)]+\)\s*$/i, "");
  const rows = [
    { label: "Third-party requests", site: report.metrics.thirdPartyRequests },
    { label: "Non-essential storage", site: report.metrics.nonEssentialStorage }
  ];

  return (
    <div className="mt-10 border-l-4 border-sky-500 pl-4">
      <p className="text-xs font-semibold uppercase text-zinc-500">Industry benchmark</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-zinc-800">{benchmarkLabel}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-zinc-600">{row.label}</span>
              <span className={monoClass}><strong className="text-zinc-950">{row.site ?? "N/A"}</strong>{row.site === null ? null : <span className="text-zinc-400"> retained</span>}</span>
            </div>
            <div className="relative mt-2 h-2 rounded-full bg-zinc-200">
              <span className="absolute inset-y-0 left-0 rounded-full bg-sky-500" style={{ width: `${row.site === null ? 0 : Math.min(100, row.site === 0 ? 0 : Math.max(8, row.site * 5))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JsonEvidence({ value }: { value: Record<string, unknown> }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 text-[0.68rem] leading-5 text-zinc-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function EvidenceTools({
  canonicalEvidenceJson,
  correctionSteps,
  evidenceRefs,
  evidenceJson,
}: {
  canonicalEvidenceJson?: string;
  correctionSteps: readonly string[];
  evidenceRefs?: string[];
  evidenceJson: Record<string, unknown>;
  stacked?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 border-l border-t border-zinc-200">
      <details className="group/tool border-b border-r border-zinc-200 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
          JSON evidence
          <span aria-hidden="true" className="text-zinc-400 transition group-open/tool:rotate-45">+</span>
        </summary>
        <div className="mt-4">
          {canonicalEvidenceJson ? (
            <RegulatoryChecklistEvidenceDetails evidenceRefs={evidenceRefs} jsonPayload={canonicalEvidenceJson} />
          ) : (
            <JsonEvidence value={evidenceJson} />
          )}
        </div>
      </details>
      {canonicalEvidenceJson ? (
        <details className="group/correction border-b border-r border-zinc-200 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
            Correction steps
            <span aria-hidden="true" className="text-zinc-400 transition group-open/correction:rotate-45">+</span>
          </summary>
          <div className="mt-4 [&>details]:!mt-0 [&>details]:!border-0 [&>details]:!bg-transparent [&>details>summary]:hidden">
            <RegulatoryChecklistCorrectionSteps defaultOpen jsonPayload={canonicalEvidenceJson} />
          </div>
        </details>
      ) : (
        <details className="group/tool border-b border-r border-zinc-200 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
            Correction steps
            <span aria-hidden="true" className="text-zinc-400 transition group-open/tool:rotate-45">+</span>
          </summary>
          <ol className="mt-4 space-y-2 text-sm leading-6 text-zinc-600">
            {correctionSteps.map((step, index) => (
              <li className="flex gap-3" key={step}>
                <span className={`${monoClass} text-zinc-400`}>{String(index + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function EvidenceIndexRows({ rows, stackedTools = false }: { rows: readonly ShadowEvidenceRow[]; stackedTools?: boolean }) {
  return (
    <div className="mt-5 divide-y divide-zinc-200 border-t border-zinc-200">
      {rows.map((row) => (
        <details className="group/evidence-row py-3" key={row.id}>
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-zinc-950">{row.title}</span>
              <span className="mt-1 overflow-hidden text-xs leading-5 text-zinc-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] group-open/evidence-row:[display:block] group-open/evidence-row:[-webkit-line-clamp:unset]">{row.summary}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <StatusBadge status={row.status} />
              <span aria-hidden="true" className="text-zinc-400 transition group-open/evidence-row:rotate-45">+</span>
            </span>
          </summary>
          <div className="mt-4">
            <EvidenceTools canonicalEvidenceJson={row.canonicalEvidenceJson} correctionSteps={row.correctionSteps} evidenceJson={row.evidenceJson} evidenceRefs={row.evidenceRefs} stacked={stackedTools} />
          </div>
        </details>
      ))}
    </div>
  );
}

function FindingRow({ finding, dense = false, priority = false }: { finding: ShadowFinding; dense?: boolean; priority?: boolean }) {
  return (
    <details className={`group border-b border-zinc-200 last:border-b-0 ${priority ? "transition-colors hover:bg-rose-50/40 open:bg-white" : ""}`} id={finding.id}>
      <summary className={`grid cursor-pointer list-none gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden ${priority ? "relative grid-cols-[2.25rem_minmax(0,1fr)] items-start px-2 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] sm:items-center sm:px-3" : dense ? "grid-cols-[2rem_minmax(0,1fr)_auto] py-4" : "grid-cols-[2.5rem_minmax(0,1fr)] py-4 sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]"}`}>
        <span className={`${monoClass} font-semibold ${priority ? "inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-xs text-rose-700" : "text-sm text-zinc-400"}`}>{String(finding.rank).padStart(2, "0")}</span>
        <span className={`min-w-0 ${priority ? "pr-7 sm:pr-0" : ""}`}>
          <span className={`${dense ? "text-sm" : "text-base"} block font-semibold text-zinc-950`}>{finding.title}</span>
          {!dense ? <span className={`${priority ? "mt-0.5 text-xs leading-5 text-zinc-500 sm:pr-4" : "mt-1 text-sm leading-6 text-zinc-600"} overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] group-open:[display:block] group-open:[-webkit-line-clamp:unset]`}>{finding.summary}</span> : null}
          {!dense && !priority ? <span className="mt-3 inline-flex sm:hidden"><StatusBadge status={finding.status} /></span> : null}
        </span>
        {!dense ? <span className={`${priority ? "hidden self-center rounded-md border border-zinc-200 bg-white px-2 py-1 text-[0.65rem] font-semibold uppercase text-zinc-500 lg:block" : "hidden self-start text-xs font-medium text-zinc-500 sm:block"}`}>{finding.focus}</span> : null}
        <span className={priority ? "absolute right-2 top-3 flex items-center gap-2 sm:static" : dense ? "flex items-start gap-2" : "hidden items-start gap-2 sm:flex"}>
          {!dense ? <span className={priority ? "hidden sm:inline-flex" : ""}><StatusBadge status={finding.status} /></span> : null}
          <span aria-hidden="true" className="mt-1 text-zinc-400 transition group-open:rotate-45">+</span>
        </span>
      </summary>
      <div className={`${dense ? "pl-0 sm:pl-11" : priority ? "px-3 sm:pl-[4.75rem] sm:pr-4" : "pl-0 sm:pl-12"} pb-6`}>
        {dense ? <p className="mb-3 max-w-3xl text-sm leading-6 text-zinc-600">{finding.summary}</p> : null}
        {finding.vendors.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {finding.vendors.map((vendor, index) => <VendorBrandChip key={`${vendor}:${index}`} label={vendor} showMeta={false} />)}
          </div>
        ) : null}
        <ul className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
          {finding.evidence.map((item, index) => (
            <li className="border-l-2 border-sky-300 pl-3 leading-6" key={`${item}:${index}`}>{item}</li>
          ))}
        </ul>
        <div className="mt-5"><EvidenceTools correctionSteps={finding.correctionSteps} evidenceJson={finding.evidenceJson} /></div>
      </div>
    </details>
  );
}

function FindingsList({ dense = false, priority = false, report }: { dense?: boolean; priority?: boolean; report: ShadowReportData }) {
  return (
    <div className="border-t border-zinc-950">
      {report.findings.map((finding) => <FindingRow dense={dense} finding={finding} key={finding.id} priority={priority} />)}
    </div>
  );
}

function HorizontalTimeline({ dominant = false, report }: { dominant?: boolean; report: ShadowReportData }) {
  const events = report.timeline;
  const consentEvent = events.find((event) => /consent/i.test(event.label));
  const firstConcern = events.find((event) => event.tone === "concern");
  const leadMs = consentEvent && firstConcern && consentEvent.atMs > firstConcern.atMs
    ? consentEvent.atMs - firstConcern.atMs
    : null;
  return (
    <div className="overflow-x-auto pb-2">
      <div className={`${dominant ? "min-w-[58rem]" : "min-w-[48rem]"} relative pt-12`}>
        <div className="absolute left-0 right-0 top-[4.2rem] h-px bg-zinc-300" />
        <div className="relative grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(events.length, 2)}, minmax(0, 1fr))` }}>
          {events.map((event) => (
            <div className="relative min-w-0" key={`${event.at}-${event.label}`}>
              <span className={`absolute top-[0.72rem] h-3 w-3 rounded-full border-2 border-white ring-1 ${event.tone === "concern" ? "bg-rose-500 ring-rose-500" : event.tone === "positive" ? "bg-emerald-600 ring-emerald-600" : "bg-zinc-500 ring-zinc-500"}`} />
              {/consent/i.test(event.label) ? (
                <span aria-hidden="true" className="absolute left-[0.31rem] top-[1.45rem] h-6 border-l-2 border-dashed border-emerald-500" />
              ) : null}
              <p className={`${monoClass} text-xs font-semibold ${event.tone === "concern" ? "text-rose-700" : "text-zinc-600"}`}>{event.at}</p>
              <div className="mt-9 flex min-h-7 items-center gap-2">
                <p className={`${dominant ? "text-base" : "text-sm"} font-semibold text-zinc-950`}>{event.label}</p>
                {event.vendor ? (
                  <VendorBrandChip className="!h-7 !w-7 [&>span]:!h-4 [&>span]:!w-4" hideLabel label={event.vendor} showMeta={false} />
                ) : null}
              </div>
              <p className="mt-1 max-w-[11rem] overflow-hidden text-xs leading-5 text-zinc-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{event.detail}</p>
              {event === firstConcern && leadMs !== null ? (
                <span className="absolute -top-10 left-0 whitespace-nowrap rounded-md bg-rose-50 px-2 py-1 text-[0.65rem] font-semibold text-rose-800">
                  {Math.round(leadMs / 10) / 100}s before consent surface
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatRejectTimelineOffset(milliseconds: number) {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  const seconds = Math.round(milliseconds / 100) / 10;
  return `${seconds}s`;
}

function RejectPathTimeline({ report }: { report: ShadowReportData }) {
  const projection = report.rejectPath;
  if (!projection || projection.state === "incomplete" || projection.observationWindowMs === null) {
    return null;
  }
  const outcome = projection.state === "issue_observed"
    ? {
        badge: "Issue observed",
        detail: projection.note,
        label: (projection.timelineEvents?.length ?? 0) > 0
          ? "Reject did not suppress all qualifying activity"
          : projection.label,
        tone: "concern" as const,
      }
    : projection.state === "review_signal"
      ? {
          badge: "Review signal",
          detail: projection.note,
          label: "Post-Reject outcome needs review",
          tone: "review" as const,
        }
      : {
          badge: "No issue observed",
          detail: projection.note,
          label: "No qualifying post-Reject issue observed",
          tone: "positive" as const,
        };
  const events = [
    {
      atMs: 0,
      detail: "A deterministic resolver registered a confirmed refusal state.",
      label: "Reject confirmed",
      tone: "positive" as const,
    },
    ...(projection.timelineEvents ?? []).map((event) => ({ ...event, tone: "concern" as const })),
    {
      atMs: projection.observationWindowMs,
      detail: outcome.detail,
      label: outcome.label,
      tone: outcome.tone,
    },
  ];
  const toneClasses = projection.state === "issue_observed"
    ? "border-rose-300 bg-rose-50 text-rose-800"
    : projection.state === "review_signal"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-emerald-300 bg-emerald-50 text-emerald-800";

  return (
    <div className="mt-10 border-t border-zinc-300 pt-8" data-reject-path-state={projection.state} data-testid="post-reject-timeline">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-sky-700">After Reject</p>
          <h3 className="mt-1 text-xl font-semibold text-zinc-950">After optional cookies and tracking were rejected</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Offsets begin when the cookie banner’s Reject control was confirmed.</p>
        </div>
        <span className={`rounded-md border px-2.5 py-1 text-[0.68rem] font-semibold uppercase ${toneClasses}`}>{outcome.badge}</span>
      </div>
      <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">
        <span className="font-semibold">Expected after Reject:</span> optional trackers should stop sending requests and creating or updating browser storage during the observed window.
      </div>
      <div className="mt-6 overflow-x-auto pb-2">
        <div className="relative min-w-[48rem] pt-10">
          <div className="absolute left-0 right-0 top-[3.7rem] h-px bg-zinc-300" />
          <div className="relative grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(events.length, 2)}, minmax(0, 1fr))` }}>
            {events.map((event, index) => (
              <div className="relative min-w-0" key={`${event.atMs}:${event.label}:${index}`}>
                <span className={`absolute top-[0.72rem] h-3 w-3 rounded-full border-2 border-white ring-1 ${event.tone === "concern" ? "bg-rose-500 ring-rose-500" : event.tone === "review" ? "bg-amber-500 ring-amber-500" : "bg-emerald-600 ring-emerald-600"}`} />
                <p className={`${monoClass} text-xs font-semibold ${event.tone === "concern" ? "text-rose-700" : event.tone === "review" ? "text-amber-800" : "text-emerald-700"}`}>{formatRejectTimelineOffset(event.atMs)}</p>
                <p className="mt-9 text-sm font-semibold text-zinc-950">{event.label}</p>
                <p className="mt-1 max-w-[14rem] text-xs leading-5 text-zinc-500">{event.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PostRejectActivityInventory({ report }: { report: ShadowReportData }) {
  const projection = report.rejectPath;
  if (!projection || projection.state === "incomplete" || projection.observationWindowMs === null) {
    return null;
  }
  const events = projection.timelineEvents ?? [];
  const clean = projection.state === "no_issue_observed" && events.length === 0;
  const contradictionOnly = projection.state === "issue_observed" && events.length === 0;

  return (
    <div className="mt-10 border-t border-zinc-300 pt-8" data-testid="post-reject-activity-inventory">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-sky-700">Post-Reject activity</p>
          <h3 className="mt-1 text-xl font-semibold text-zinc-950">Requests and storage writes after Reject</h3>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-zinc-500">Reject should suppress new optional activity. It does not necessarily require every previously stored cookie to be deleted; unchanged stored presence remains a separate review-only signal.</p>
        </div>
        <span className={`${monoClass} rounded-md border px-2 py-1 text-xs font-semibold ${clean ? "border-emerald-200 bg-emerald-50 text-emerald-800" : events.length > 0 || contradictionOnly ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {events.length} active {events.length === 1 ? "event" : "events"}
        </span>
      </div>
      {events.length > 0 ? (
        <div className="mt-5 overflow-x-auto border border-zinc-200 bg-white">
          <table className="w-full min-w-[52rem] border-collapse text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>{["Activity", "Retained evidence", "After Reject", "Expected", "Result"].map((label) => <th className="border-b border-zinc-200 px-3 py-2 font-medium" key={label}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {events.map((event, index) => {
                const storageWrite = /storage/i.test(event.label);
                return (
                  <tr className="border-b border-zinc-100 last:border-0" key={`${event.atMs}:${event.label}:${index}`}>
                    <td className="px-3 py-3 font-semibold text-zinc-900">{event.label}</td>
                    <td className="px-3 py-3 text-zinc-600">{event.detail ?? "Retained event detail unavailable"}</td>
                    <td className={`${monoClass} px-3 py-3 text-zinc-700`}>{formatRejectTimelineOffset(event.atMs)}</td>
                    <td className="px-3 py-3 text-zinc-600">{storageWrite ? "No new optional write" : "Optional request suppressed"}</td>
                    <td className="px-3 py-3"><span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-800">Observed after Reject</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={`mt-5 rounded-md border px-3 py-3 text-sm ${clean ? "border-emerald-200 bg-emerald-50 text-emerald-900" : contradictionOnly ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          {clean
            ? "No qualifying non-essential request or storage write was retained after confirmed Reject."
            : contradictionOnly
              ? "No qualifying request or storage-write row was retained. The reported issue is the separate consent-state contradiction shown in the Reject result."
              : projection.note}
        </p>
      )}
    </div>
  );
}

type InventoryMixItem = {
  color: string;
  label: string;
  value: number;
};

function CompactInventoryMixPanel({
  collapsibleOverflow = false,
  items,
  legendColumns = 2,
  title,
}: {
  collapsibleOverflow?: boolean;
  items: InventoryMixItem[];
  legendColumns?: 1 | 2;
  title: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const hasOverflow = collapsibleOverflow && items.length > 4;
  const visibleItems = hasOverflow
    ? items.filter((item) => item.label.toLowerCase() !== "unknown").slice(0, 3)
    : items;
  const visibleLabels = new Set(visibleItems.map((item) => item.label));
  const overflowItems = hasOverflow ? items.filter((item) => !visibleLabels.has(item.label)) : [];
  let cursor = 0;
  const segments = items
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = cursor;
      cursor += (item.value / Math.max(total, 1)) * 100;
      return `${item.color} ${start}% ${cursor}%`;
    });

  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0 sm:px-3">
      <p className="text-center text-[0.62rem] font-semibold uppercase leading-4 text-zinc-500 md:text-left">{title}</p>
      <div className="mt-2 flex items-start justify-center gap-3 md:justify-start">
        <span
          aria-label={`${title}: ${items.map((item) => `${item.label} ${item.value}`).join(", ")}`}
          className="relative inline-flex h-12 w-12 shrink-0 self-start items-center justify-center rounded-full"
          role="img"
          style={{ background: segments.length > 0 ? `conic-gradient(${segments.join(", ")})` : "#e4e4e7" }}
        >
          <span className={`${monoClass} inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-zinc-900`}>{total}</span>
        </span>
        <div className={`hidden min-w-0 flex-1 gap-x-3 gap-y-1 md:grid ${legendColumns === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {visibleItems.map((item) => (
            <div className="flex min-w-0 items-center justify-between gap-2" key={item.label}>
              <span className="flex min-w-0 items-center gap-1.5 text-[0.65rem] text-zinc-500">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className={`${monoClass} text-[0.65rem] font-semibold text-zinc-800`}>{item.value}</span>
            </div>
          ))}
          {hasOverflow ? (
            <details className="group/mix col-span-full text-[0.65rem] text-zinc-500">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium [&::-webkit-details-marker]:hidden">
                <span>More…</span>
                <span aria-hidden="true" className="text-zinc-400 transition group-open/mix:rotate-45">+</span>
              </summary>
              <div className="mt-1 grid gap-1">
                {overflowItems.map((item) => (
                  <div className="flex min-w-0 items-center justify-between gap-2" key={item.label}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className={`${monoClass} font-semibold text-zinc-800`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CompactInventoryMix({ report }: { report: ShadowReportData }) {
  const countBy = (key: "evidence" | "purpose" | "relationship", value: string) =>
    report.inventory.reduce((total, row) =>
      total + (row[key].toLowerCase() === value.toLowerCase() ? row.recordCount : 0), 0
    );
  const purposeCounts = [...new Set(report.inventory.map((row) => row.purpose))]
    .map((purpose) => ({ label: purpose, value: countBy("purpose", purpose) }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
  return (
    <div className="mt-4 grid grid-cols-3 divide-x divide-zinc-200 border-t border-zinc-200 pt-3">
      <CompactInventoryMixPanel
        items={[
          { color: "#f43f5e", label: "Non-essential", value: countBy("evidence", "Non-essential") },
          { color: "#f59e0b", label: "Review", value: countBy("evidence", "Review") },
          { color: "#3b82f6", label: "Essential", value: countBy("evidence", "Essential") },
          { color: "#0ea5e9", label: "Contextual", value: countBy("evidence", "Contextual") }
        ]}
        title="Evidence mix"
      />
      <CompactInventoryMixPanel
        collapsibleOverflow
        items={purposeCounts.map((purpose, index) => ({
          color: ["#d97706", "#f59e0b", "#fbbf24", "#0ea5e9", "#94a3b8", "#8b5cf6"][index] ?? "#64748b",
          label: purpose.label,
          value: purpose.value,
        }))}
        legendColumns={1}
        title="Purpose mix"
      />
      <CompactInventoryMixPanel
        items={[
          { color: "#3b82f6", label: "Same-site", value: countBy("relationship", "Same-site") },
          { color: "#8b5cf6", label: "Cross-site", value: countBy("relationship", "Cross-site") },
          { color: "#f59e0b", label: "Mixed", value: countBy("relationship", "Mixed") },
          { color: "#94a3b8", label: "Unknown", value: countBy("relationship", "Unknown") }
        ]}
        title="Site relationship"
      />
    </div>
  );
}

type InventoryRow = ShadowReportData["inventory"][number];

function InventoryTypeIcon({ type }: { type: string }) {
  const isCookie = type.toLowerCase().includes("cookie") || type.toLowerCase().includes("storage");
  return (
    <span
      aria-label={isCookie ? "Cookie or storage" : "Tracker or request"}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${isCookie ? "border-sky-200 bg-sky-50 text-sky-700" : "border-violet-200 bg-violet-50 text-violet-700"}`}
      title={isCookie ? "Cookie or storage" : "Tracker or request"}
    >
      {isCookie ? (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path d="M20 13.2A8 8 0 1 1 10.8 4a3.1 3.1 0 0 0 3 4 3.2 3.2 0 0 0 4.1 4.1c.6.2 1.2.5 2.1 1.1Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <path d="M8.5 9.5h.01M7.5 15h.01M12.5 14h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path d="M17.6 7.3A7 7 0 0 0 5.3 10M15.2 7.4h2.7V4.7M6.4 16.7A7 7 0 0 0 18.7 14M8.8 16.6H6.1v2.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
}

function InventoryConfidenceDots({ confidence }: { confidence: string }) {
  const normalized = confidence.toLowerCase();
  const level = normalized.includes("high") ? 3 : normalized.includes("medium") ? 2 : normalized.includes("low") ? 1 : 0;
  const label = level === 3 ? "High" : level === 2 ? "Medium" : level === 1 ? "Low" : "Not retained";
  return (
    <span aria-label={`Confidence: ${label}`} className="inline-flex items-center gap-1" title={`Confidence: ${label}`}>
      {[1, 2, 3].map((dot) => (
        <span className={`h-2.5 w-2.5 rounded-full border border-slate-300 ${dot <= level ? "bg-slate-500" : "bg-white"}`} key={dot} />
      ))}
    </span>
  );
}

function inventoryEvidenceClasses(evidence: string) {
  if (evidence === "Non-essential") return "bg-rose-100 text-rose-800";
  if (evidence === "Review") return "bg-amber-100 text-amber-800";
  if (evidence === "Essential") return "bg-blue-100 text-blue-800";
  if (evidence === "Contextual") return "bg-sky-100 text-sky-800";
  return "bg-zinc-100 text-zinc-700";
}

function inventoryPurposeClasses(purpose: string) {
  const normalized = purpose.toLowerCase();
  if (/advert|marketing|retarget/.test(normalized)) return "bg-rose-100 text-rose-800";
  if (/analytic|audience|measurement|experiment/.test(normalized)) return "bg-amber-100 text-amber-800";
  if (/auth|security|fraud|functional/.test(normalized)) return "bg-emerald-100 text-emerald-800";
  if (/consent|privacy|compliance/.test(normalized)) return "bg-sky-100 text-sky-800";
  if (/embed|media|social/.test(normalized)) return "bg-violet-100 text-violet-800";
  if (/cdn|static|font|delivery/.test(normalized)) return "bg-blue-100 text-blue-800";
  return "bg-zinc-100 text-zinc-700";
}

function TwoLineCell({ children, title }: { children: ReactNode; title?: string }) {
  return <span className="overflow-hidden leading-5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]" title={title}>{children}</span>;
}

function InventoryRowDetails({ row }: { row: InventoryRow }) {
  const preConsent = typeof row.evidenceJson?.preConsent === "boolean"
    ? row.evidenceJson.preConsent ? "Yes" : "No"
    : "Not retained";
  const relevance = Array.isArray(row.evidenceJson?.regulatoryRelevance)
    ? row.evidenceJson.regulatoryRelevance.filter((item): item is string => typeof item === "string").join(", ") || "Not retained"
    : "Not retained";
  const values = [
    ["Request / name", row.requestNames],
    ["Evidence", row.evidence],
    ["Purpose", row.purpose],
    ["Category", row.category],
    ["First observed", row.observed],
    ["Pre-consent", preConsent],
    ["Observed records", String(row.recordCount)],
    ["Request events", row.requestCount === null ? "Not retained" : String(row.requestCount)],
    ["Domains", row.domains],
    ["Site relationship", `${row.relationship} · entity ${row.entityRelationship.toLowerCase()}`],
    ["Server context", row.serverLocation],
    ["Controlling entity", row.controllingEntity],
    ["Transfer mechanism", row.transferMechanism],
    ["Regulatory relevance", relevance],
  ];

  return (
    <dl className="mt-3 grid w-[34rem] max-w-[75vw] grid-cols-2 gap-x-5 gap-y-3 border-l-2 border-sky-200 pl-3 text-zinc-600">
      {values.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-[0.65rem] uppercase text-zinc-400">{label}</dt>
          <dd className="mt-1 break-words">{value}</dd>
        </div>
      ))}
      {row.evidenceJson ? <div className="col-span-full"><dt className="text-[0.65rem] uppercase text-zinc-400">Retained JSON</dt><dd className="mt-2"><JsonEvidence value={row.evidenceJson} /></dd></div> : null}
    </dl>
  );
}

function RuntimeInventoryTable({ report }: { report: ShadowReportData }) {
  const inventoryScrollClasses = report.inventory.length > 8
    ? "max-h-[48rem] overflow-auto"
    : "overflow-x-auto";

  return (
    <div className="mt-9 border-y border-zinc-300 bg-white">
      <div className="px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-500">Cookie and tracker inventory</p>
            <h3 className="mt-1 text-base font-semibold text-zinc-950 sm:text-lg">Every retained vendor and request group</h3>
          </div>
          <span className="flex shrink-0 items-center gap-3 text-xs font-semibold text-zinc-700">
            <span className={monoClass}>{report.metrics.vendors} vendors · {report.metrics.domains} domains</span>
          </span>
        </div>
        <CompactInventoryMix report={report} />
      </div>
      <details className="group/runtime border-t border-zinc-200">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 [&::-webkit-details-marker]:hidden">
          <span>View full inventory table</span>
          <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 bg-white text-lg text-zinc-500 transition group-open/runtime:rotate-45">+</span>
        </summary>
        <p className="mx-4 mb-4 max-w-3xl border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500">
          Every retained cookie, storage, tracker, and request group from the canonical runtime inventory is available below.
        </p>
        <div
          className={`${inventoryScrollClasses} border border-zinc-200 bg-white`}
          data-inventory-scroll={report.inventory.length > 8 ? "bounded" : "unbounded"}
        >
        <table className="w-full min-w-[86rem] table-fixed border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20 bg-zinc-50 text-zinc-500 shadow-[0_2px_8px_-6px_rgba(24,24,27,0.55)]">
            <tr>
              {[
                ["More", "w-[5.5rem]"], ["Vendor", "w-[10rem]"], ["Type", "w-[4rem]"], ["Purpose", "w-[11rem]"],
                ["Evidence mix", "w-[8rem]"], ["First seen", "w-[7rem]"], ["Domains", "w-[14rem]"],
                ["Relationship", "w-[12rem]"], ["Confidence", "w-[6rem]"], ["Priority", "w-[8rem]"],
              ].map(([label, width], index) => (
                <th className={`border-b border-zinc-200 px-3 py-2.5 font-medium ${width} ${index === 0 ? "sticky left-0 z-10 bg-zinc-50" : ""}`} key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.inventory.map((row, index) => (
              <tr className="border-b border-zinc-100 align-top last:border-0" key={`${row.vendor}:${row.purpose}:${index}`}>
                <td className="sticky left-0 z-10 bg-white px-3 py-3">
                  <details className="group/vendor relative">
                    <summary className="cursor-pointer list-none whitespace-nowrap font-semibold text-sky-700 hover:text-sky-900 [&::-webkit-details-marker]:hidden">
                      Inspect <span aria-hidden="true">+</span>
                    </summary>
                    <InventoryRowDetails row={row} />
                  </details>
                </td>
                <td className="px-3 py-3"><VendorBrandChip label={row.vendor} showMeta={false} /></td>
                <td className="px-3 py-3 text-zinc-600"><InventoryTypeIcon type={row.type} /></td>
                <td className="px-3 py-3 text-zinc-600"><span className={`inline-flex max-w-full rounded-md px-2 py-1 text-[0.68rem] font-semibold ${inventoryPurposeClasses(row.purpose)}`}><TwoLineCell title={row.purpose}>{row.purpose}</TwoLineCell></span></td>
                <td className="px-3 py-3 text-zinc-600"><span className={`inline-flex max-w-full rounded-md px-2 py-1 text-[0.68rem] font-semibold ${inventoryEvidenceClasses(row.evidence)}`}><TwoLineCell title={row.evidence}>{row.evidence}</TwoLineCell></span></td>
                <td className={`${monoClass} px-3 py-3 text-zinc-600`}><TwoLineCell title={row.observed}>{row.observed}</TwoLineCell></td>
                <td className={`${monoClass} px-3 py-3 text-zinc-600`}><TwoLineCell title={row.domains}>{row.domains}</TwoLineCell></td>
                <td className="px-3 py-3 text-zinc-600"><TwoLineCell title={`${row.relationship} · entity ${row.entityRelationship.toLowerCase()}`}>{row.relationship} · entity {row.entityRelationship.toLowerCase()}</TwoLineCell></td>
                <td className="px-3 py-3 text-zinc-600"><InventoryConfidenceDots confidence={row.confidence} /></td>
                <td className="px-3 py-3 text-zinc-600"><TwoLineCell title={row.priority}>{row.priority}</TwoLineCell></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
    </div>
  );
}

function VerdictBlock({ compact = false, report, showNextStep = true }: { compact?: boolean; report: ShadowReportData; showNextStep?: boolean }) {
  const reviewCounts = [
    report.coverage.concern > 0 ? `${report.coverage.concern} concern${report.coverage.concern === 1 ? "" : "s"}` : null,
    report.coverage.partial > 0 ? `${report.coverage.partial} partial` : null,
    report.coverage.review > 0 ? `${report.coverage.review} review` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.68rem] font-semibold uppercase text-sky-700">Scan assessment</span>
        <span className="text-xs font-medium text-zinc-500">{reviewCounts}</span>
      </div>
      <h2 className={`${compact ? "mt-4 text-2xl" : "mt-5 text-3xl"} max-w-4xl font-semibold leading-tight text-zinc-950`}>
        Executive overview
      </h2>
      <p className={`${compact ? "mt-3 text-[0.95rem] leading-7" : "mt-4 text-base leading-7"} max-w-4xl text-zinc-600`}>{report.verdict}</p>
      {showNextStep ? (
        <div className="mt-5 border-l-4 border-sky-500 pl-4">
          <p className="text-xs font-semibold uppercase text-zinc-500">First review step</p>
          <p className="mt-1 text-sm font-medium leading-6 text-zinc-900">{report.nextStep}</p>
        </div>
      ) : null}
    </div>
  );
}

function MobileVerdict({ report }: { report: ShadowReportData }) {
  const reviewCounts = [
    report.coverage.concern > 0 ? `${report.coverage.concern} concern${report.coverage.concern === 1 ? "" : "s"}` : null,
    report.coverage.partial > 0 ? `${report.coverage.partial} partial` : null,
    report.coverage.review > 0 ? `${report.coverage.review} review` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.68rem] font-semibold uppercase text-sky-700">Scan assessment</span>
        <span className="text-xs font-medium text-zinc-500">{reviewCounts}</span>
      </div>
      <h2 className="mt-4 text-2xl font-semibold leading-tight text-zinc-950">Executive overview</h2>
      <p className="mt-3 text-[0.95rem] leading-7 text-zinc-600">{report.verdict}</p>
    </div>
  );
}

function BriefingVariant({ report }: { report: ShadowReportData }) {
  return (
    <>
      <section className="mx-auto max-w-[86rem] px-5 pb-10 pt-8 lg:px-10 lg:pt-12">
        <ReportIdentity report={report} />
        <div className="mt-10 grid gap-8 border-y border-zinc-200 py-8 lg:grid-cols-[15rem_minmax(0,1fr)_18rem] lg:gap-10">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase text-zinc-500">Overall score</p>
            <ScoreScale report={report} />
          </div>
          <div className="border-zinc-200 lg:border-x lg:px-10">
            <VerdictBlock compact report={report} />
          </div>
          <div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Evidence coverage</p>
                <p className="mt-2 text-sm text-zinc-600"><span className={`${monoClass} font-semibold text-zinc-950`}>{report.coverage.usableEvidence}/{report.coverage.rows}</span> rows usable</p>
              </div>
              <span className="text-xs text-zinc-500">{report.coverage.limited} limited</span>
            </div>
            <div className="mt-5"><CoverageBar report={report} /></div>
          </div>
        </div>
        <div className="mt-8"><CompactMetrics report={report} /></div>
      </section>
      <section className="border-y border-zinc-200 bg-[#f7faf9]">
        <div className="mx-auto max-w-[86rem] px-5 py-10 lg:px-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-800">Observed sequence</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-950">What happened during the scan</h2>
            </div>
            <p className={`${monoClass} text-xs text-zinc-500`}>0s → {report.scan.observedWindow}</p>
          </div>
          <div className="mt-3"><HorizontalTimeline report={report} /></div>
        </div>
      </section>
      <section className="mx-auto max-w-[86rem] px-5 py-12 lg:px-10">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-rose-700">Review order</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Four high-priority findings</h2>
          </div>
          <p className="text-sm text-zinc-500">Open any row for retained evidence context.</p>
        </div>
        <FindingsList report={report} />
      </section>
    </>
  );
}

function TriageVariant({ report }: { report: ShadowReportData }) {
  return (
    <main className="mx-auto max-w-[90rem] px-4 py-6 lg:px-8 lg:py-8">
      <ReportIdentity compact report={report} />
      <div className="mt-7 grid gap-6 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="order-2 space-y-7 border-y border-zinc-200 py-6 xl:order-1 xl:border-y-0 xl:border-r xl:py-0 xl:pr-6">
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-500">Posture</p>
            <div className="mt-3"><ScoreScale compact report={report} /></div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
            {[
              ["Concerns", report.coverage.concern], ["Partial", report.coverage.partial], ["Positive", report.coverage.positive], ["Limited", report.coverage.limited],
              ["3P requests", report.metrics.thirdPartyRequests], ["Storage", report.metrics.nonEssentialStorage ?? "—"]
            ].map(([label, value]) => (
              <div className="border-t border-zinc-200 pt-3" key={label}>
                <dt className="text-xs text-zinc-500">{label}</dt>
                <dd className={`${monoClass} mt-1 text-xl font-semibold text-zinc-950`}>{value}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-500">First review step</p>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{report.nextStep}</p>
          </div>
        </aside>
        <div className="order-1 min-w-0 xl:order-2">
          <div className="border-b border-zinc-950 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-rose-700">Action queue</p>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-950">Review these findings first</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className={`${monoClass} rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 xl:hidden`}>{report.score.value}/100</span>
                <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800">{report.findings.length} open {report.findings.length === 1 ? "concern" : "concerns"}</span>
              </div>
            </div>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-600">{report.verdict}</p>
          </div>
          <FindingsList dense report={report} />
          <div className="mt-9 grid gap-6 border-t border-zinc-200 pt-7 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-950">Consent controls</h3>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {Object.entries(report.controls).map(([label, value]) => (
                  <div className="border-l-2 border-zinc-200 pl-3" key={label}>
                    <p className="text-xs capitalize text-zinc-500">{label}</p>
                    <p className={`mt-1 text-xs font-semibold ${value === "Observed" ? "text-emerald-700" : "text-rose-700"}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-950">Coverage mix</h3>
              <div className="mt-4"><CoverageBar report={report} /></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function TimelineVariant({
  allowRestrictedScanOptions,
  defaultScanFrom,
  mode,
  report,
}: Pick<ShadowScanReportProps, "allowRestrictedScanOptions" | "defaultScanFrom" | "mode"> & {
  report: ShadowReportData;
}) {
  return (
    <>
      <section className="mx-auto max-w-[90rem] px-5 pb-8 pt-8 lg:px-10">
        <ReportIdentity
          allowRestrictedScanOptions={allowRestrictedScanOptions}
          compact
          defaultScanFrom={defaultScanFrom}
          enhancedActions
          mode={mode}
          report={report}
        />
        <div className="mt-9 grid gap-8 border-t border-zinc-200 pt-8 lg:grid-cols-[minmax(20rem,0.95fr)_minmax(0,1.65fr)] lg:gap-10">
          <div>
            <ScoreScale compact report={report} />
            <SignalSnapshot report={report} />
          </div>
          <div>
            <div className="lg:hidden"><MobileVerdict report={report} /></div>
            <div className="hidden lg:block"><VerdictBlock compact report={report} showNextStep={false} /></div>
            <BenchmarkComparison report={report} />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[90rem] px-5 py-8 lg:px-10 lg:py-9">
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase text-rose-700">Priority review</p>
              <h2 className="mt-0.5 text-xl font-semibold text-zinc-950 sm:text-2xl">Top issues needing attention</h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`${monoClass} shrink-0 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700`}>{report.findings.length} issues</span>
            <p className="hidden text-xs text-zinc-500 md:block">Open for evidence, JSON, and correction steps.</p>
          </div>
        </div>
        <div className="mt-4"><FindingsList priority report={report} /></div>
      </section>
      <section className="border-y border-zinc-950 bg-[#fffdf8]">
        <div className="mx-auto max-w-[90rem] px-5 py-10 lg:px-10 lg:py-12">
          <p className="text-xs font-semibold uppercase text-rose-700">Cookies and trackers timeline</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">First-seen timestamps place retained third-party requests and embeds relative to the first observed consent banner.</p>
          <div className="mt-6"><HorizontalTimeline dominant report={report} /></div>
          <RejectPathTimeline report={report} />
          <PostRejectActivityInventory report={report} />
          <RuntimeInventoryTable report={report} />
        </div>
      </section>
    </>
  );
}

const scorecardDomains = [
  {
    label: "Consent",
    score: "Review",
    tone: "concern" as const,
    summary: "Consent surface observed; first-layer Reject and Options not observed.",
    metric: "1 observed · 2 not observed"
  },
  {
    label: "Runtime",
    score: "Review",
    tone: "concern" as const,
    summary: "Tracking-classified requests and embeds were retained before a recorded consent action.",
    metric: "8 third-party requests"
  },
  {
    label: "Policy",
    score: "Mixed",
    tone: "context" as const,
    summary: "Public policy surfaces were retained; several disclosure topics were not confirmed.",
    metric: "2 policy surfaces"
  },
  {
    label: "Transport",
    score: "Positive",
    tone: "positive" as const,
    summary: "HTTPS, certificate validity, redirect behavior, mixed content, and form transport were observed positively.",
    metric: "5 positive signals"
  }
];

function ScorecardVariant({ report }: { report: ShadowReportData }) {
  return (
    <main className="mx-auto max-w-[90rem] px-5 py-8 lg:px-10">
      <ReportIdentity compact report={report} />
      <div className="mt-8 grid gap-6 border-y border-zinc-200 py-7 lg:grid-cols-[14rem_minmax(0,1fr)_21rem]">
        <ScoreScale compact report={report} />
        <div className="border-zinc-200 lg:hidden"><MobileVerdict report={report} /></div>
        <div className="hidden border-zinc-200 lg:block lg:border-x lg:px-8"><VerdictBlock compact report={report} /></div>
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">Checklist coverage</p>
          <p className="mt-2 text-sm text-zinc-600"><span className={`${monoClass} font-semibold text-zinc-950`}>{report.coverage.rows}</span> in-scope rows</p>
          <div className="mt-5"><CoverageBar report={report} /></div>
        </div>
      </div>
      <section className="py-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-500">Domain scorecard</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Four views of the same retained evidence</h2>
          </div>
          <p className="text-sm text-zinc-500">Status is observational, not a compliance determination.</p>
        </div>
        <div className="mt-6 grid border-l border-t border-zinc-200 md:grid-cols-2 xl:grid-cols-4">
          {scorecardDomains.map((domain) => (
            <article className="min-h-[15rem] border-b border-r border-zinc-200 bg-white p-5" key={domain.label}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-zinc-950">{domain.label}</h3>
                <span className={`h-2.5 w-2.5 rounded-full ${domain.tone === "concern" ? "bg-rose-500" : domain.tone === "positive" ? "bg-emerald-600" : "bg-sky-400"}`} />
              </div>
              <p className="mt-8 text-2xl font-semibold text-zinc-950">{domain.score}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{domain.summary}</p>
              <p className={`${monoClass} mt-5 border-t border-zinc-200 pt-3 text-xs text-zinc-500`}>{domain.metric}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="grid gap-10 border-t border-zinc-950 py-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Priority findings</h2>
          <div className="mt-4"><FindingsList dense report={report} /></div>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Coverage detail</h2>
          <div className="mt-5"><CoverageBar detailed report={report} /></div>
          <p className="mt-6 text-sm leading-6 text-zinc-600">Contextual and limited rows stay separate from confirmed concerns and positive evidence. Missing evidence is not converted into an observed gap.</p>
        </div>
      </section>
    </main>
  );
}

function MinimalVariant({ report }: { report: ShadowReportData }) {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 lg:py-14">
      <ReportIdentity compact report={report} />
      <div className="mt-16 grid gap-8 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <ScoreScale compact report={report} />
        <div>
          <p className="text-xs font-semibold uppercase text-rose-700">Review recommended</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-zinc-950">Consent controls and pre-consent third-party activity need review.</h2>
          <p className="mt-5 text-base leading-7 text-zinc-600">{report.verdict}</p>
          <p className="mt-5 text-sm font-medium leading-6 text-zinc-950">{report.nextStep}</p>
        </div>
      </div>
      <div className="mt-16 divide-y divide-zinc-200 border-y border-zinc-200">
        <details className="group/minimal py-6" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <div><p className="text-xs font-semibold uppercase text-rose-700">01</p><h2 className="mt-2 text-xl font-semibold text-zinc-950">What needs attention?</h2></div>
            <span aria-hidden="true" className="text-xl text-zinc-400 transition group-open/minimal:rotate-45">+</span>
          </summary>
          <div className="mt-5"><FindingsList dense report={report} /></div>
        </details>
        <details className="group/minimal py-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <div><p className="text-xs font-semibold uppercase text-sky-700">02</p><h2 className="mt-2 text-xl font-semibold text-zinc-950">What did the scan observe?</h2></div>
            <span aria-hidden="true" className="text-xl text-zinc-400 transition group-open/minimal:rotate-45">+</span>
          </summary>
          <div className="mt-7"><HorizontalTimeline report={report} /></div>
          <div className="mt-8"><CompactMetrics report={report} /></div>
        </details>
        <details className="group/minimal py-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <div><p className="text-xs font-semibold uppercase text-zinc-500">03</p><h2 className="mt-2 text-xl font-semibold text-zinc-950">How complete is the evidence?</h2></div>
            <span aria-hidden="true" className="text-xl text-zinc-400 transition group-open/minimal:rotate-45">+</span>
          </summary>
          <div className="mt-7"><CoverageBar detailed report={report} /></div>
          <p className="mt-6 max-w-3xl text-sm leading-6 text-zinc-600">{report.coverage.usableEvidence} of {report.coverage.rows} in-scope rows had usable automated evidence. {report.coverage.limited} technical limits were recorded. Context and limitations remain distinct from positive evidence and observed concerns.</p>
        </details>
      </div>
    </main>
  );
}

function EvidenceDirectory({ report }: { report: ShadowReportData }) {
  const consentVendor = report.consentVendor ?? "Consent platform not identified";
  const observedGdprTransparencyRows = report.gdprTransparencyRows.filter((row) => row.status === "Observed").length;
  return (
    <section className="border-t border-zinc-950 bg-white" id="evidence">
      <div className="mx-auto max-w-[90rem] px-5 py-12 lg:px-10 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(32rem,1.2fr)] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase text-sky-700">Evidence index</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Every layer, one step away</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Consent, tracking &amp; external services, pre-consent runtime, GDPR Transparency, transport security and collection details.</p>
          </div>
          <RatingMix report={report} />
        </div>
        <div className="mt-9 grid items-start gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
          <div className="border-l border-t border-zinc-200">
            <details className="group/consent border-b border-r border-zinc-200 p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                <div><p className="text-xs font-semibold uppercase text-zinc-500">Consent surface</p><h3 className="mt-1 text-lg font-semibold text-zinc-950">Controls and CMP context</h3></div>
                <span aria-hidden="true" className="text-zinc-400 transition group-open/consent:rotate-45">+</span>
              </summary>
              <div className="mt-5"><ControlStatusGrid report={report} /></div>
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4">
                <VendorBrandChip label={consentVendor} showMeta={false} />
                <p className="text-sm leading-6 text-zinc-600">CMP identity and control context are retained in the canonical consent projection.</p>
              </div>
              {report.rejectPath ? <div className="mt-5"><CompactRejectPathCard projection={report.rejectPath} /></div> : null}
              <EvidenceIndexRows rows={report.consentRows} />
            </details>
            <details className="group/tracking border-b border-r border-zinc-200 p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                <div><p className="text-xs font-semibold uppercase text-zinc-500">Tracking &amp; external services</p><h3 className="mt-1 text-lg font-semibold text-zinc-950">{report.trackingExternalRows.length} findings</h3></div>
                <span aria-hidden="true" className="text-zinc-400 transition group-open/tracking:rotate-45">+</span>
              </summary>
              <EvidenceIndexRows rows={report.trackingExternalRows} />
            </details>
            <details className="group/policy border-b border-r border-zinc-200 p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                <div><p className="text-xs font-semibold uppercase text-zinc-500">Policy and transparency</p><h3 className="mt-1 text-lg font-semibold text-zinc-950">{observedGdprTransparencyRows} of {report.gdprTransparencyRows.length} observed</h3></div>
                <span aria-hidden="true" className="text-zinc-400 transition group-open/policy:rotate-45">+</span>
              </summary>
              <div className="mt-5 divide-y divide-zinc-200 border-t border-zinc-200">
                {report.gdprTransparencyRows.map((row) => (
                  <details className="group/policy-row py-3" key={row.id}>
                    <summary className={`${row.id === "privacy-notice-surface" ? "grid sm:flex" : "flex"} cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden`}>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-zinc-950">{row.title}</span>
                        <span className="mt-1 overflow-hidden text-xs leading-5 text-zinc-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] group-open/policy-row:[display:block] group-open/policy-row:[-webkit-line-clamp:unset]">{row.summary}</span>
                      </span>
                      <span className={`${row.id === "privacy-notice-surface" ? "justify-start sm:justify-end" : ""} flex shrink-0 items-center gap-2`}>
                        {(row.policyEvidence || (row.id === "privacy-notice-surface" && report.scan.id === SHADOW_REPORT.scan.id)) ? (
                          <ShadowPolicyEvidenceViewer
                            evidence={row.policyEvidence ?? SHADOW_PRIVACY_NOTICE_EVIDENCE}
                            findingLabel={row.title}
                          />
                        ) : null}
                        <StatusBadge status={row.status} />
                        <span aria-hidden="true" className="text-zinc-400 transition group-open/policy-row:rotate-45">+</span>
                      </span>
                    </summary>
                    <div className="mt-4"><EvidenceTools canonicalEvidenceJson={row.canonicalEvidenceJson} correctionSteps={row.correctionSteps} evidenceJson={row.evidenceJson} evidenceRefs={row.evidenceRefs} /></div>
                  </details>
                ))}
              </div>
            </details>
          </div>
          <div className="border-l border-t border-zinc-200">
            <details className="group/runtime border-b border-r border-zinc-200 p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                <div><p className="text-xs font-semibold uppercase text-zinc-500">Pre-consent runtime</p><h3 className="mt-1 text-lg font-semibold text-zinc-950">{report.preConsentRuntimeRows.length} findings</h3></div>
                <span aria-hidden="true" className="text-zinc-400 transition group-open/runtime:rotate-45">+</span>
              </summary>
              <EvidenceIndexRows rows={report.preConsentRuntimeRows} stackedTools />
            </details>
            <details className="group/transport border-b border-r border-zinc-200 p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                <div><p className="text-xs font-semibold uppercase text-zinc-500">Transport security</p><h3 className="mt-1 text-lg font-semibold text-zinc-950">{report.transportRows.filter((row) => row.status === "Observed").length} positive observations</h3></div>
                <span aria-hidden="true" className="text-zinc-400 transition group-open/transport:rotate-45">+</span>
              </summary>
              <div className="mt-5 divide-y divide-zinc-200 border-t border-zinc-200">
                {report.transportRows.map((row) => (
                  <details className="group/transport-row py-3" key={row.id}>
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="flex min-w-0 gap-3"><span aria-hidden="true" className={row.status === "Observed" ? "text-emerald-700" : "text-zinc-400"}>{row.status === "Observed" ? "✓" : "—"}</span><span><span className="block text-sm font-semibold text-zinc-950">{row.title}</span><span className="mt-1 overflow-hidden text-xs leading-5 text-zinc-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] group-open/transport-row:[display:block] group-open/transport-row:[-webkit-line-clamp:unset]">{row.summary}</span></span></span>
                      <span className="flex shrink-0 items-center gap-2"><StatusBadge status={row.status} /><span aria-hidden="true" className="text-zinc-400 transition group-open/transport-row:rotate-45">+</span></span>
                    </summary>
                    <div className="mt-4"><EvidenceTools canonicalEvidenceJson={row.canonicalEvidenceJson} correctionSteps={row.correctionSteps} evidenceJson={row.evidenceJson} evidenceRefs={row.evidenceRefs} stacked /></div>
                  </details>
                ))}
              </div>
            </details>
            {report.metrics.forms > 0 ? (
              <details className="group/collection border-b border-r border-zinc-200 p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <div><p className="text-xs font-semibold uppercase text-zinc-500">Collection surfaces</p><h3 className="mt-1 text-lg font-semibold text-zinc-950">{report.metrics.forms} {report.metrics.forms === 1 ? "form" : "forms"} · {report.metrics.fields} {report.metrics.fields === 1 ? "field" : "fields"}</h3></div>
                  <span aria-hidden="true" className="text-zinc-400 transition group-open/collection:rotate-45">+</span>
                </summary>
                <p className="mt-5 text-sm leading-6 text-zinc-600">Read-only main-document inventory. Field values were not retained. Assessment: {report.collectionStatus ?? "Unavailable"}.</p>
                {(report.collectionLimitations?.length ?? 0) > 0 ? (
                  <p className="mt-2 text-xs leading-5 text-amber-800">Coverage limits: {report.collectionLimitations?.join(", ")}.</p>
                ) : null}
                <div className="mt-4 divide-y divide-zinc-200 border-t border-zinc-200">
                  {(report.collectionSurfaces ?? []).map((surface, formIndex) => (
                    <details className="group/form py-3" key={`${surface.pageUrl}:${surface.title}:${formIndex}`}>
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-950">{surface.title}</span>
                          <span className={`${monoClass} mt-1 block break-all text-[0.68rem] leading-5 text-zinc-500`}>{surface.pageUrl}</span>
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500">{surface.method} · {surface.actionRelationship} · {surface.fields.length} {surface.fields.length === 1 ? "field" : "fields"} <span aria-hidden="true" className="ml-1 transition group-open/form:rotate-45">+</span></span>
                      </summary>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-600">
                        <div><dt className="uppercase text-zinc-400">Action host</dt><dd className="mt-1">{surface.actionHostname ?? "Current page action"}</dd></div>
                        <div><dt className="uppercase text-zinc-400">Confidence</dt><dd className="mt-1">{surface.confidence}</dd></div>
                      </dl>
                      {surface.fieldsTruncated ? <p className="mt-3 text-xs text-amber-800">Additional candidate fields were not retained.</p> : null}
                      <div className="mt-4 overflow-x-auto border border-zinc-200">
                        <table className="w-full min-w-[42rem] border-collapse text-left text-xs">
                          <thead className="bg-zinc-50 text-zinc-500"><tr>{["Field", "Type", "Category", "Required", "State", "Confidence", "Evidence refs"].map((label) => <th className="border-b border-zinc-200 px-3 py-2 font-medium" key={label}>{label}</th>)}</tr></thead>
                          <tbody>{surface.fields.map((field, fieldIndex) => (
                            <tr className="border-b border-zinc-100 last:border-0" key={`${field.label}:${fieldIndex}`}>
                              <td className="px-3 py-2 font-medium text-zinc-900">{field.label}</td>
                              <td className={`${monoClass} px-3 py-2 text-zinc-600`}>{field.inputType}</td>
                              <td className="px-3 py-2 text-zinc-600">{field.semanticCategory}</td>
                              <td className="px-3 py-2 text-zinc-600">{field.required ? "Yes" : "No"}</td>
                              <td className="px-3 py-2 text-zinc-600">{field.state}</td>
                              <td className="px-3 py-2 text-zinc-600">{field.confidence}</td>
                              <td className={`${monoClass} max-w-48 break-all px-3 py-2 text-zinc-500`}>{field.evidenceRefs.join(", ") || "Not retained"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
        <div className="mt-10 [&_section]:!rounded-md [&_section]:!border-zinc-200 [&_section]:!bg-zinc-50/70 [&_.scan-report-button]:!h-9 [&_.scan-report-button]:!w-9 [&_.scan-report-button]:!rounded-md [&_.scan-report-button]:!border-zinc-300 [&_.scan-report-button]:!bg-white [&_.scan-report-button]:!text-zinc-600 [&_.scan-report-button]:!shadow-none [&_.scan-report-button]:hover:!border-zinc-500 [&_.scan-report-button]:hover:!text-zinc-950">
          <AgentSummaryActions domainLabel={report.scan.host} scanId={report.scan.id} />
        </div>
        <footer className="mt-10 flex flex-col gap-3 border-t border-zinc-200 pt-5 text-xs leading-5 text-zinc-500 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-3xl">CertScore.ai can make mistakes. Automated observations can contain errors; verify findings before relying on them. Findings describe retained scan evidence and are not legal certification or legal advice.</p>
          <p className={`${monoClass} shrink-0`}>scan_id: {report.scan.id}</p>
        </footer>
      </div>
    </section>
  );
}

function VariantBody({
  allowRestrictedScanOptions,
  defaultScanFrom,
  mode,
  report = SHADOW_REPORT,
  variant,
}: ShadowScanReportProps) {
  if (variant === "triage") return <TriageVariant report={report} />;
  if (variant === "timeline") return (
    <TimelineVariant
      allowRestrictedScanOptions={allowRestrictedScanOptions}
      defaultScanFrom={defaultScanFrom}
      mode={mode}
      report={report}
    />
  );
  if (variant === "scorecard") return <ScorecardVariant report={report} />;
  if (variant === "minimal") return <MinimalVariant report={report} />;
  return <BriefingVariant report={report} />;
}

export function ShadowScanReport({
  allowRestrictedScanOptions,
  defaultScanFrom,
  mode = "public",
  report = SHADOW_REPORT,
  variant,
}: ShadowScanReportProps) {
  const reportContent = (
    <>
      <VariantBody
        allowRestrictedScanOptions={allowRestrictedScanOptions}
        defaultScanFrom={defaultScanFrom}
        mode={mode}
        report={report}
        variant={variant}
      />
      <EvidenceDirectory report={report} />
    </>
  );

  if (mode === "authenticated") {
    return (
      <div className="-mx-5 min-h-screen overflow-x-hidden bg-[#fcfcfb] text-zinc-950 lg:-mx-10">
        {reportContent}
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fcfcfb] text-zinc-950">
      <SiteHeader mobilePrimaryAction="sign-in" wide />
      {reportContent}
      <SiteFooter hideDisclaimer wide />
    </div>
  );
}
