import type { ReactNode } from "react";
import Link from "next/link";
import {
  REPORT_PRIMARY_PILLARS,
  getReportEvidenceCategoriesForSection,
  getReportSectionsForPillar,
  getReportSignalsForEvidenceCategory,
  getReportUnifiedFindingByAlias,
  getReportUnifiedFindingForValidationRule,
  getScanNoGoLimitationKindLabel,
  resolveScanNoGoPresentation,
  type PreviewScanPayload,
  type PreviewSampleFinding,
  type ReportSignalDefinition,
  type SignalEnrichmentWorkflowStageStatus
} from "@website-signal-risk-scanner/shared";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { CopyJsonButton } from "./copy-json-button";
import { ScanCompletedEvent } from "../analytics/data-layer-events";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { EvidenceJsonBlock } from "./evidence-json-block";
import {
  ExecutiveSummaryCard,
  buildRegulatoryLensesFromUnifiedPackets,
  type ExecutivePolicySurface,
  type ExecutiveScanInterruption,
  type ExecutiveTimelineEvent
} from "./executive-summary-card";
import { FindingsSection } from "./findings-section";
import { FullScanProgressCard } from "./full-scan-progress-card";
import { FingerprintingPanel } from "./fingerprinting-panel";
import {
  BetaRegulatoryChecklistCard,
  type BetaRegulatoryChecklistArea,
  type BetaRegulatoryChecklistRow,
  type BetaRegulatoryChecklistStatus
} from "./beta-regulatory-checklist-card";
import {
  GdprEprivacyCoverageChecklistCard,
  GdprEprivacyCoverageSummaryPills
} from "./gdpr-eprivacy-coverage-checklist-card";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "../../lib/scans/gdpr-eprivacy-checklist-rationale";
import {
  getAssessmentDirection,
  getEvidenceLabel
} from "../../lib/scans/gdpr-eprivacy-assessment-direction";
import { InfoTip } from "./info-tip";
import { RedirectFlowPanel } from "./redirect-flow-panel";
import { RegulatoryChecklistSection } from "./regulatory-checklist-section";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";
import { ScanPageHeader } from "./scan-page-header";
import { VendorBrandChip } from "./vendor-brand-chip";
import { NoGoBrowserExtensionRecovery } from "./no-go-browser-extension-recovery";
import {
  EMPHASIS_METRIC_CARD_CLASS,
  EMPHASIS_METRIC_CARD_VALUE_CLASS,
  METRIC_CARD_CLASS,
  METRIC_CARD_VALUE_CLASS,
  METRIC_GRID_CLASS,
  SectionSubsection,
  StaticSubsection,
  SummaryMetricTile
} from "./report-primitives";
import {
  deriveCertScoreFindings,
} from "../../lib/scans/derive-findings";
import { buildScanCalibrationSummary } from "../../lib/scans/calibration-summary";
import {
  compactEvidenceJsonForDisplay,
  sanitizePublicReportEvidenceText
} from "../../lib/scans/compact-evidence-json";
import {
  dedupeHeadlineFindings,
  deriveConsentAuditFindings
} from "../../lib/scans/consent-audit-findings";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import { getHybridRuntimeEvidence } from "../../lib/scans/hybrid-runtime-evidence";
import { buildPromotionGradePreconsentRequests } from "../../lib/scans/preconsent-public-evidence";
import {
  getReportFacingScannedPageUrl,
  getReportFacingScannedPageUrls,
  isRuntimeRequestEvidenceUrl,
  stripReportUrlAnnotation
} from "../../lib/scans/report-facing-page-url";
import { buildSupplementalRuntimeUnifiedFindingPackets } from "../../lib/scans/supplemental-runtime-unified-findings";
import {
  findMergedSignalValue,
  getReportSignalValue
} from "../../lib/scans/report-signal-values";
import {
  getUnifiedFindingCategoryRelation,
  type UnifiedFindingDisplayPacket
} from "../../lib/scans/unified-findings";
import {
  buildScanReportUnifiedFindingState,
  buildScanReportUnifiedFindings as buildScanReportUnifiedFindingsFromState,
  selectOwnerUnifiedFindingsForSection,
  type ScanReportUnifiedFindingState
} from "../../lib/scans/scan-report-unified-findings";
import {
  type CanonicalReviewFinding,
  type CanonicalReviewIssue,
  type CanonicalSignalItem
} from "../../lib/scans/scan-report-review-findings";
import {
  getSurfacingDecisionStateBadgeClasses,
  getSurfacingDecisionStateLabel,
  getSurfacingLaneBadgeClasses,
  getSurfacingLaneLabel,
  isConfidenceCoverageSurfacing,
  isMainNarrativeSurfacing,
  isSupportingContextSurfacing
} from "../../lib/scans/report-surfacing-presentation";
import { isPolicyPositiveSignalKey } from "../../lib/scans/policy-positive-signal-contract";
import {
  isMeaningfulPolicyText,
  normalizePolicySnippet
} from "../../lib/scans/policy-snippet-normalization";
import {
  getPolicyEvidenceSnippets,
  getPolicyActionableFlags,
  getPolicyMentions,
  getPolicyPageType,
  getPolicyPageUrl,
  getPolicySummaryText,
  prioritizePublicPolicySurfaces
} from "../../lib/scans/policy-enrichment-row";
import { isGenericBrowserCookieHelpUrl } from "../../lib/scans/policy-surface-url-hygiene";
import { deriveHighRiskTrackingContext } from "../../lib/scans/high-risk-tracking-context";
import {
  buildRuntimeCookieInventory,
  hasUnresolvedNonEssentialPreconsentStorageEvidence,
  isEligibleNonEssentialPreconsentStorageMetricRow,
  isEligibleNonEssentialPreconsentStorageRow,
  type RuntimeCookieEvidenceRow
} from "../../lib/scans/runtime-cookie-evidence";
import {
  buildReportSurfaceVendorProjection,
  buildRuntimeInventoryGroupRows,
  buildTrackerInventoryGroupRows,
  buildTrackerInventoryRows,
  deriveInventoryMacroCategory,
  formatGroupedParty,
  getInventoryGroupRowRenderKey,
  getTrackerConsentReviewPriority,
  isCmpOrFunctionalVendorDomain,
  isTimedPreConsentInventoryRow,
  type ConsentReviewPriority,
  type InventoryConfidence,
  type InventoryGroupRow,
  type TrackerInventoryRow
} from "../../lib/scans/runtime-inventory-projection";
import {
  getAllowedConflictType,
  type PolicyBehaviorConflictClaimType,
  type PolicyBehaviorConflictType,
  type PolicyBehaviorRuntimeObservationType
} from "../../lib/scans/contradiction-evidence-contract";
import { getFindingReferenceHrefForReportFindingId } from "../../lib/marketing/finding-reference-links";
import {
  getPublicReportFindingDisplay,
  getPublicReportFindingFallbackNote
} from "../../lib/scans/public-report-finding-display";
import {
  buildReportFacingProjectionCopy,
  filterReportFacingDemotionReasons,
  getReportFacingReviewLane,
  type ReportFacingProjectionEligibility
} from "../../lib/scans/report-facing-demotion-reasons";
import {
  evaluateFindingEvidenceContractForPacket,
  getFindingEvidenceContractForUnifiedFinding
} from "../../lib/scans/finding-evidence-contracts";
import { deriveScanExecutionSummary } from "../../lib/scans/scan-timeout-summary";
import { deriveScanStopReason } from "../../lib/scans/scan-stop-reason";
import {
  deriveGdprEprivacyCoverageChecklist,
  type GdprEprivacyCoverageChecklistInput,
  type GdprEprivacyCoverageChecklistItem
} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { getReportableGdprEprivacyCoverageItems } from "../../lib/scans/gdpr-eprivacy-reportable-rows";
import { deriveRegulatoryCoverageScore } from "../../lib/scans/regulatory-coverage-score";
import { buildRegulatoryGapTopFindings } from "../../lib/scans/regulatory-gap-top-findings";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import {
  formatCollectionEndpointType,
} from "../../lib/scans/tracker-risk";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { PendingButtonLink } from "../ui/pending-link";
import { ViewerTimestamp } from "../time/viewer-timestamp";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";

export { getTrackerConsentReviewPriority };

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item): string => sanitizePublicReportEvidenceText(formatValue(item))).join(", ") : "[]";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return sanitizePublicReportEvidenceText(String(value));
}

function tryFormatJsonEvidencePacket(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || (typeof parsed !== "object" && !Array.isArray(parsed))) {
      return null;
    }

    return JSON.stringify(compactEvidenceJsonForDisplay(parsed), null, 2);
  } catch {
    return null;
  }
}

function SnapshotValue({ value }: { value: unknown }) {
  const jsonPayload = tryFormatJsonEvidencePacket(value);

  if (jsonPayload) {
    return (
      <div className="relative w-full max-w-full text-left">
        <EvidenceJsonBlock
          payload={jsonPayload}
          className="relative w-full max-w-full rounded-lg bg-slate-950"
          preClassName="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 pr-12 font-mono text-[11px] leading-5 text-slate-100"
        />
      </div>
    );
  }

  return <span>{formatValue(value)}</span>;
}

function formatCompactValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "Not observed";
    }

    if (value.length <= 3) {
      return value.join(", ");
    }

    return `${value.slice(0, 3).join(", ")} +${value.length - 3} more`;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function formatDurationMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }

  if (value < 1000) {
    return `${value}ms`;
  }

  const totalSeconds = Math.round(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

function formatScanTimeLabel(input: {
  completedAt: string | null | undefined;
  createdAt: string | null | undefined;
  durationMs?: number | null | undefined;
  startedAt: string | null | undefined;
}) {
  if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs) && input.durationMs >= 0) {
    return formatScanTimeDurationMs(input.durationMs);
  }

  const scanOpenedAt = input.createdAt ?? input.startedAt;

  if (!scanOpenedAt || !input.completedAt) {
    return null;
  }

  const startedAtMs = Date.parse(scanOpenedAt);
  const completedAtMs = Date.parse(input.completedAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs) || completedAtMs < startedAtMs) {
    return null;
  }

  return formatScanTimeDurationMs(completedAtMs - startedAtMs);
}

function formatScanReadyTimeLabel(input: {
  completedAt: string | null | undefined;
  createdAt: string | null | undefined;
  startedAt: string | null | undefined;
}) {
  const scanOpenedAt = input.createdAt ?? input.startedAt;

  if (!scanOpenedAt || !input.completedAt) {
    return null;
  }

  const startedAtMs = Date.parse(scanOpenedAt);
  const completedAtMs = Date.parse(input.completedAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs) || completedAtMs < startedAtMs) {
    return null;
  }

  return formatScanTimeDurationMs(completedAtMs - startedAtMs);
}

function formatScanTimeDurationMs(durationMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} hr`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} min`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} sec`);
  }

  return parts.join(" ");
}

function formatFirstSeenMs(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? formatElapsedSeconds(value) : "—";
}

function formatInventoryTiming(row: InventoryGroupRow) {
  if (row.type === "cookie" && row.firstSeenMs === null && /snapshot/.test(row.timingEvidence ?? "")) {
    return "Present; write time unconfirmed";
  }
  return formatFirstSeenMs(row.firstSeenMs);
}

function formatElapsedSeconds(value: number) {
  const seconds = Math.max(0, value) / 1000;
  return `${seconds.toPrecision(3)}s`;
}

function formatInventorySummaryTime(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return formatElapsedSeconds(value);
}

function InventoryVendorCell({ label }: { label: string }) {
  return (
    <VendorBrandChip
      className="max-w-full rounded-lg py-1"
      label={label}
      showMeta={false}
      suffix={null}
    />
  );
}

const CONSENT_REVIEW_PRIORITY_LABELS: Record<ConsentReviewPriority, string> = {
  contextual: "Contextual",
  high: "High",
  medium: "Medium",
  review_needed: "Review"
};

const CONSENT_REVIEW_PRIORITY_INFOTIPS: Record<ConsentReviewPriority, string> = {
  contextual: "Observed activity from categories commonly associated with site operation, security, payment, authentication, consent management, CDN/static delivery, or other context-dependent functions.",
  high: "Pre-consent activity from a category commonly associated with advertising, audience measurement, retargeting, behavioral tracking, session replay, or fingerprinting.",
  medium: "Pre-consent activity that is review-relevant, such as analytics, experimentation, personalization, tag management, marketing automation, or vendor-associated first-party storage, but may require context before being treated as a stronger concern.",
  review_needed: "Unknown, ambiguous, low-confidence, or insufficiently classified evidence that should be manually reviewed."
};

const INVENTORY_CONFIDENCE_LABELS: Record<InventoryConfidence, string> = {
  high: "High",
  low: "Low",
  medium: "Medium"
};

function consentReviewPriorityTone(priority: ConsentReviewPriority) {
  return priority === "review_needed" ? "medium" : priority;
}

function InventoryPriorityCell({
  priority,
}: {
  priority: ConsentReviewPriority;
}) {
  const label = CONSENT_REVIEW_PRIORITY_LABELS[priority];
  const infotip = CONSENT_REVIEW_PRIORITY_INFOTIPS[priority];
  const tone = consentReviewPriorityTone(priority);
  const toneClass = {
    contextual: "border-sky-200 bg-sky-50 text-sky-700",
    high: "border-rose-200 bg-rose-50 text-rose-700",
    medium: "border-amber-200 bg-amber-50 text-amber-700",
    neutral: "border-slate-200 bg-white text-slate-600"
  }[tone];
  const iconClassName = "h-2.5 w-2.5 shrink-0";
  const icon = {
    contextual: (
      <svg aria-hidden="true" className={iconClassName} fill="none" viewBox="0 0 20 20">
        <path d="M6.4 8.2h7.2M6.4 11.8h7.2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    ),
    high: (
      <svg aria-hidden="true" className={iconClassName} fill="none" viewBox="0 0 24 24">
        <path d="M12 4.5 21 19H3L12 4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M12 9v4.5M12 17h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
      </svg>
    ),
    medium: (
      <svg aria-hidden="true" className={iconClassName} fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7.5v6M12 17h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
      </svg>
    ),
    review_needed: (
      <svg aria-hidden="true" className={iconClassName} fill="none" viewBox="0 0 24 24">
        <path d="M7 20V5.5M7 5.5h9.5l-1.4 3 1.4 3H7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    )
  }[priority];

  return (
    <span
      className={`inline-flex max-w-[6rem] items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.08em] ${toneClass}`}
      title={`${label}: ${infotip}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

function InventoryConfidenceCell({ confidence }: { confidence: InventoryConfidence }) {
  const confidenceLabel = INVENTORY_CONFIDENCE_LABELS[confidence];
  const confidenceLevel = confidence === "high" ? 3 : confidence === "medium" ? 2 : confidence === "low" ? 1 : 0;

  return (
    <span
      className="inline-flex items-center gap-1"
      title={`Confidence: ${confidenceLabel}`}
      aria-label={`Confidence: ${confidenceLabel}`}
    >
      {[1, 2, 3].map((level) => (
        <span
          key={level}
          className={`h-2 w-2 rounded-full border border-slate-300 ${level <= confidenceLevel ? "bg-slate-500" : "bg-white"}`}
        />
      ))}
    </span>
  );
}

function InventoryTypeIcon({ type }: { type: "cookie" | "tracker" }) {
  if (type === "cookie") {
    return (
      <span
        aria-label="Cookie"
        className="inline-flex h-[1.6rem] w-[1.6rem] items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700"
        title="Cookie"
      >
        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
          <path d="M20 13.2A8 8 0 1 1 10.8 4a3.1 3.1 0 0 0 3 4 3.2 3.2 0 0 0 4.1 4.1c.6.2 1.2.5 2.1 1.1Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M8.5 9.5h.01M7.5 15h.01M12.5 14h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.6" />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-label="Tracker"
      className="inline-flex h-[1.6rem] w-[1.6rem] items-center justify-center rounded-md border border-violet-200 bg-violet-50 text-violet-700"
      title="Tracker"
    >
      <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
        <path d="M17.6 7.3A7 7 0 0 0 5.3 10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        <path d="M15.2 7.4h2.7V4.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M6.4 16.7A7 7 0 0 0 18.7 14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        <path d="M8.8 16.6H6.1v2.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    </span>
  );
}

function formatInventoryParty(value: "first_party" | "third_party" | "unknown" | string | null | undefined) {
  if (value === "first_party") {
    return "1st";
  }
  if (value === "third_party") {
    return "3rd";
  }
  return "—";
}

function formatInventoryCellForCopy(value: string | number | null | undefined) {
  return String(value ?? "—").replace(/[\t\r\n]+/g, " ").trim() || "—";
}

function InventoryPriorityDonut({ compact = false, rows }: { compact?: boolean; rows: InventoryGroupRow[] }) {
  const segments = [
    { color: "#fb7185", count: rows.filter((row) => row.priority === "high").length, label: "High" },
    { color: "#fbbf24", count: rows.filter((row) => row.priority === "review_needed").length, label: "Review" },
    { color: "#38bdf8", count: rows.filter((row) => row.priority === "medium").length, label: "Medium" },
    { color: "#94a3b8", count: rows.filter((row) => row.priority === "contextual").length, label: "Contextual" }
  ];
  const total = Math.max(rows.length, 1);
  let cursor = 0;
  const gradientStops = segments.flatMap((segment) => {
    const start = cursor;
    const end = cursor + (segment.count / total) * 100;
    cursor = end;
    return [`${segment.color} ${start}%`, `${segment.color} ${end}%`];
  });
  const gradient = rows.length > 0 ? `conic-gradient(${gradientStops.join(", ")})` : "conic-gradient(#e2e8f0 0 100%)";

  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "mt-3"}`}>
      <div
        aria-label="Priority distribution"
        className={`${compact ? "h-14 w-14" : "h-20 w-20"} grid shrink-0 place-items-center rounded-full`}
        style={{ background: gradient }}
      >
        <div className={`${compact ? "h-8 w-8 text-[10px]" : "h-11 w-11 text-[11px]"} grid place-items-center rounded-full bg-white font-semibold text-slate-600 shadow-sm`}>
          {rows.length}
        </div>
      </div>
      <div className={`${compact ? "grid-cols-4 gap-x-2" : "grid-cols-2 gap-x-3 gap-y-1.5"} grid min-w-0 flex-1`}>
        {segments.map((segment) => (
          <div key={segment.label} className="flex min-w-0 items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className="truncate text-[11px] font-medium text-slate-500">{compact && segment.label === "Contextual" ? "Ctx" : segment.label}</span>
            <span className="ml-auto text-[11px] font-semibold text-slate-700">{segment.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InventoryPurposeCard({ rows }: { rows: InventoryGroupRow[] }) {
  const purposeCounts = Array.from(rows.reduce((counts, row) => {
    counts.set(row.purpose, (counts.get(row.purpose) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())).sort((left, right) => {
    const countDelta = right[1] - left[1];
    return countDelta !== 0 ? countDelta : left[0].localeCompare(right[0]);
  });
  const topPurposes = purposeCounts.slice(0, 4);
  const hiddenPurposeCount = Math.max(0, purposeCounts.length - topPurposes.length);
  const colors = ["#0ea5e9", "#8b5cf6", "#14b8a6", "#f59e0b"];
  const visibleTotal = topPurposes.reduce((total, [, count]) => total + count, 0);
  const otherTotal = Math.max(0, rows.length - visibleTotal);
  const chartSegments = [
    ...topPurposes.map(([purpose, count], index) => ({ color: colors[index] ?? "#64748b", count, label: purpose })),
    ...(otherTotal > 0 ? [{ color: "#cbd5e1", count: otherTotal, label: "Other" }] : [])
  ];
  let cursor = 0;
  const gradientStops = chartSegments.flatMap((segment) => {
    const start = cursor;
    const end = cursor + (segment.count / Math.max(rows.length, 1)) * 100;
    cursor = end;
    return [`${segment.color} ${start}%`, `${segment.color} ${end}%`];
  });
  const gradient = rows.length > 0 ? `conic-gradient(${gradientStops.join(", ")})` : "conic-gradient(#e2e8f0 0 100%)";

  return (
    <div className="min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Purpose mix</p>
      <div className="mt-3 flex items-center gap-3">
        <div
          aria-label="Purpose distribution"
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
          style={{ background: gradient }}
        >
          <div className="grid h-11 w-11 place-items-center rounded-full bg-white text-[11px] font-semibold text-slate-600 shadow-sm">
            {rows.length}
          </div>
        </div>
        <div className="grid min-w-0 flex-1 gap-2">
        {topPurposes.length > 0 ? topPurposes.map(([purpose, count]) => (
          <div key={purpose} className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chartSegments.find((segment) => segment.label === purpose)?.color ?? "#64748b" }} />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600">{purpose}</span>
            <span className="text-xs font-semibold text-slate-800">{count}</span>
          </div>
        )) : (
          <p className="text-xs leading-5 text-slate-500">No retained purposes.</p>
        )}
        {hiddenPurposeCount > 0 ? (
          <p className="text-xs leading-5 text-slate-500">+{hiddenPurposeCount} more purpose{hiddenPurposeCount === 1 ? "" : "s"}</p>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function buildRuntimeInventoryCopyPayload(rows: InventoryGroupRow[]) {
  const copyRows = [
    ["Type", "Vendor", "Purpose", "Priority", "First seen", "Cookie name(s)", "Domain", "Confidence", "Party", "Category"],
    ...rows.map((row) => [
      row.type === "cookie" ? "Cookie" : "Tracker",
      row.vendor,
      row.purpose,
      CONSENT_REVIEW_PRIORITY_LABELS[row.priority],
      formatFirstSeenMs(row.firstSeenMs),
      row.cookieNames.join(", ") || "—",
      row.domains.join(", ") || "—",
      INVENTORY_CONFIDENCE_LABELS[row.confidence],
      formatGroupedParty(row.party),
      getRuntimeInventoryMacroCategory(row)
    ])
  ];

  return copyRows.map((row) => row.map(formatInventoryCellForCopy).join("\t")).join("\n");
}

function getRuntimeInventoryMacroCategory(row: InventoryGroupRow) {
  return row.macroCategory ?? deriveInventoryMacroCategory({
    priority: row.priority,
    purpose: row.purpose,
    vendor: row.vendor
  });
}

function RuntimeInventoryTable({
  cookieRows,
  firstPartyDomain,
  trackerRows
}: {
  cookieRows: RuntimeCookieEvidenceRow[];
  firstPartyDomain?: string | null;
  trackerRows: TrackerInventoryRow[];
}) {
  const groupedInventoryRows = buildRuntimeInventoryGroupRows({ cookieRows, firstPartyDomain, trackerRows });
  const copyPayload = buildRuntimeInventoryCopyPayload(groupedInventoryRows);

  return (
    <section>
      <details className="group/inventory relative overflow-visible rounded-3xl border border-slate-200 bg-white shadow-[0_18px_60px_-32px_rgba(15,23,42,0.18)]" open>
        <summary className="flex min-h-[4.75rem] cursor-pointer list-none flex-wrap items-center gap-3 px-3.5 py-4 pr-14 marker:hidden [&::-webkit-details-marker]:hidden lg:px-5 lg:pr-16">
          <ScanReportDisclosureIcon className="group-open/inventory:rotate-90" />
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Pre-consent Cookies & Trackers</p>
        </summary>
        <CopyJsonButton
          className="absolute right-3 top-4 z-20 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-950 lg:right-5"
          label="Copy table"
          payload={copyPayload}
        />
        <div className="grid gap-4 px-3.5 pb-5 pt-0 lg:grid-cols-[minmax(17rem,0.9fr)_minmax(0,2.1fr)] lg:items-start lg:px-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:h-[317px] lg:grid-cols-1 lg:grid-rows-2">
            <InventoryPurposeCard rows={groupedInventoryRows} />
            <div className="min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Priority mix</p>
              <InventoryPriorityDonut rows={groupedInventoryRows} />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 lg:h-[317px]">
            <div className="max-h-[340px] overflow-auto lg:h-full lg:max-h-none">
            <table className="w-full min-w-[1200px] table-fixed border-collapse text-left text-[13px]">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="w-[50px] whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">Type</th>
                  <th className="w-[190px] whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">Vendor</th>
                  <th className="w-[130px] whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">Purpose</th>
                  <th className="w-[130px] whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">Priority</th>
                  <th className="w-[98px] whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">First seen</th>
                  <th className="w-[150px] whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">Cookie names</th>
                  <th className="w-[210px] whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">Domain</th>
                  <th className="w-[96px] whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">Confidence</th>
                  <th className="w-[64px] whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">Party</th>
                  <th className="w-[120px] whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {groupedInventoryRows.map((row, index) => (
                  <tr key={getInventoryGroupRowRenderKey(row, index)} className="h-10">
                    <td className="truncate whitespace-nowrap px-2.5 py-1.5">
                      <InventoryTypeIcon type={row.type} />
                    </td>
                    <td className="truncate whitespace-nowrap px-2.5 py-1.5">
                      <InventoryVendorCell label={row.vendor} />
                    </td>
                    <td className="truncate whitespace-nowrap px-2.5 py-1.5">{row.purpose}</td>
                    <td className="truncate whitespace-nowrap px-2.5 py-1.5">
                      <InventoryPriorityCell
                        priority={row.priority}
                      />
                    </td>
                    <td className="truncate whitespace-nowrap px-2.5 py-1.5" title={row.type === "cookie" && row.firstSeenMs === null && /snapshot/.test(row.timingEvidence ?? "") ? "Present before recorded consent — write timing unconfirmed" : undefined}>{formatInventoryTiming(row)}</td>
                    <td className="truncate whitespace-nowrap px-2.5 py-1.5" title={row.cookieNames.join(", ") || undefined}>{row.cookieNames.join(", ") || "—"}</td>
                    <td className="truncate whitespace-nowrap px-2.5 py-1.5" title={row.domains.join(", ") || undefined}>{row.domains.join(", ") || "—"}</td>
                    <td className="truncate whitespace-nowrap px-2.5 py-1.5">
                      <InventoryConfidenceCell confidence={row.confidence} />
                    </td>
                    <td className="truncate whitespace-nowrap px-2.5 py-1.5">{formatGroupedParty(row.party)}</td>
                    <td className="truncate whitespace-nowrap px-2.5 py-1.5">{getRuntimeInventoryMacroCategory(row)}</td>
                  </tr>
                ))}
                {groupedInventoryRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-center text-slate-500" colSpan={10}>No retained cookie or tracker rows for this scan.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

function getRuntimeArtifactNumber(
  runtimeArtifacts: ScanDetailResponse["runtimeArtifacts"],
  key: string
) {
  if (!runtimeArtifacts) {
    return null;
  }

  const value = runtimeArtifacts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatReasonLabel(value: string) {
  return value
    .split("_")
    .filter((part) => part.length > 0)
    .map((part, index) => (index === 0 ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part))
    .join(" ");
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatRating(value: unknown) {
  const numericValue = getFiniteNumber(value);

  if (numericValue === null) {
    return "—";
  }

  const clamped = Math.min(100, Math.max(0, numericValue));
  const rating = Math.round((clamped / 20) * 10) / 10;
  return `${rating.toFixed(1)}/5`;
}

function averageNumbers(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function invertRiskScore(value: unknown) {
  const numericValue = getFiniteNumber(value);
  if (numericValue === null) {
    return null;
  }

  return Math.min(100, Math.max(0, 100 - numericValue));
}

function derivePreconsentSectionScore(input: {
  consentAuditCompleted: boolean;
  consentRejectReducedTracking: unknown;
  preConsentTrackingObserved: boolean;
  preconsentViolationCount: number | null;
}) {
  let score = 100;

  if (input.preConsentTrackingObserved) {
    score -= 35;
  }

  const violationCount = input.preconsentViolationCount ?? 0;
  if (violationCount > 0) {
    score -= Math.min(35, violationCount * 12);
  }

  if (input.consentAuditCompleted && input.consentRejectReducedTracking === false) {
    score -= 15;
  }

  return Math.min(100, Math.max(0, score));
}

function getSnapshotNumber(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getSnapshotBoolean(snapshot: Record<string, unknown>, key: string) {
  return snapshot[key] === true;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordBoolean(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return false;
  }

  return (record as Record<string, unknown>)[key] === true;
}

export function getRecordOptionalBoolean(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}

function getRecordNumber(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecordStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function hasIncompleteScanCoverage(scanRecord: Pick<ScanDetailResponse, "scan" | "snapshot" | "events">) {
  if (scanRecord.scan.status !== "completed") {
    return false;
  }

  const snapshot = scanRecord.snapshot;
  if (!snapshot) {
    return false;
  }

  const coverageLevel = typeof snapshot.coverage_level === "string" ? snapshot.coverage_level : null;
  const scanOutcome = typeof snapshot.scan_outcome === "string" ? snapshot.scan_outcome : null;
  const runtimeLimitationKeys = Array.isArray(snapshot.runtime_limitation_keys)
    ? snapshot.runtime_limitation_keys.filter((value): value is string => typeof value === "string")
    : [];
  const preConsentRuntimeFailedWithoutVisualEvidence =
    runtimeLimitationKeys.includes("pre_consent_runtime_failed") &&
    runtimeLimitationKeys.includes("visual_capture_unavailable");
  const pagesScanned = getFiniteNumber(snapshot.pages_scanned) ?? scanRecord.scan.pagesScanned;
  const pagesRequested = scanRecord.scan.pagesRequested;
  const totalSignals = getRecordNumber(snapshot, "total_signals");
  const reportFindingCount = getRecordNumber(snapshot, "report_finding_count");
  const verifiedPublicSurfacesCount = getRecordNumber(snapshot, "verified_public_surfaces_count");
  const retainedPublicSurfaceCount =
    typeof pagesScanned === "number"
      ? Math.max(pagesScanned, verifiedPublicSurfacesCount ?? 0)
      : verifiedPublicSurfacesCount;
  const hasUsableHomepageEvidence =
    getRecordString(snapshot, "homepage_fetch_status") === "ok" &&
    (getRecordNumber(snapshot, "homepage_fetch_http_status") ?? 0) < 400 &&
    (typeof pagesScanned !== "number" || pagesScanned > 0) &&
    (typeof snapshot.normalized_body_hash === "string" && snapshot.normalized_body_hash.trim().length > 0);
  const hasMaterialRetainedCoverage =
    typeof retainedPublicSurfaceCount === "number" &&
    retainedPublicSurfaceCount > 0 &&
    (totalSignals ?? 0) >= 20 &&
    (
      ((reportFindingCount ?? 0) >= 3 && hasUsableHomepageEvidence) ||
      ((reportFindingCount ?? 0) >= 3 &&
        (typeof pagesRequested !== "number" || retainedPublicSurfaceCount >= Math.min(pagesRequested, 3)))
    );
  const hasMaterialHomepageLimit = hasMaterialHomepageAccessLimitation(snapshot);
  const hasHardAccessLimitation =
    hasMaterialHomepageLimit ||
    preConsentRuntimeFailedWithoutVisualEvidence ||
    snapshot.timeout_flag === true ||
    Boolean(scanOutcome && /blocked|captcha|forbidden|timeout|restricted|unknown_access/i.test(scanOutcome));
  const hasProtectedRouteOnlyLimitation =
    hasUsableHomepageEvidence &&
    !hasMaterialHomepageLimit &&
    retainedPublicSurfaceCount !== null &&
    retainedPublicSurfaceCount > 0 &&
    (
      snapshot.auth_wall_suspected === true ||
      snapshot.auth_wall_detected === true ||
      snapshot.challenge_suspected === true ||
      getRecordString(snapshot, "block_page_classification") === "login_wall_probable" ||
      Boolean(scanOutcome && /auth|login|sign.?in|protected_route/i.test(scanOutcome))
    );

  if (hasProtectedRouteOnlyLimitation && !hasHardAccessLimitation) {
    return false;
  }

  return (
    coverageLevel === "limited_none" ||
    hasHardAccessLimitation ||
    (!hasMaterialRetainedCoverage &&
      (coverageLevel === "limited_partial" ||
        snapshot.partial_scan === true ||
        snapshot.incomplete_pages === true ||
        Boolean(scanOutcome && /partial|incomplete|degraded/i.test(scanOutcome)))) ||
    (typeof pagesScanned === "number" && pagesScanned === 0 && coverageLevel !== "broad")
  );
}

function getRecordObjectArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [];
}

function getHybridRuntimeSummaryRows(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  if (!hybrid) {
    return null;
  }

  const networkSummary = getRecord(hybrid.networkSummary);
  const consentSummary = getRecord(hybrid.consentSummary);
  const storageSummary = getRecord(hybrid.storageSummary);
  const uiSummary = getRecord(hybrid.uiSummary);
  const mediaSummary = getRecord(hybrid.mediaSummary);
  const fingerprintSummary = getRecord(hybrid.fingerprintSummary);
  const vendorSummary = getRecord(hybrid.vendorSummary);
  const rawThirdPartyDomains = getRecordStringArray(vendorSummary, "rawThirdPartyDomains")
    .filter((host) => !isCmpOrFunctionalVendorDomain(host));

  return [
    { label: "Requests observed", value: networkSummary?.totalRequestCount },
    { label: "Third-party requests", value: networkSummary?.thirdPartyRequestCount },
    { label: "Third-party domains", value: rawThirdPartyDomains },
    { label: "Consent banner", value: consentSummary?.bannerPresent },
    { label: "Reject option present", value: consentSummary?.rejectPresent },
    { label: "Cookie wall detected", value: consentSummary?.cookieWallDetected },
    { label: "Cookies seen", value: storageSummary?.cookiesSeenCount },
    {
      label: "Storage writes",
      value:
        storageSummary?.localStorageWriteDetected === true || storageSummary?.sessionStorageWriteDetected === true
          ? "Observed"
          : "Not observed"
    },
    { label: "Fingerprint tier", value: fingerprintSummary?.tier },
    { label: "Fingerprint reasons", value: fingerprintSummary?.reasons },
    { label: "Popup count", value: uiSummary?.popupCount },
    {
      label: "Overlay or forced action",
      value:
        uiSummary?.overlayDetected === true || uiSummary?.forcedActionRequired === true || uiSummary?.interstitialDetected === true
    },
    {
      label: "Autoplay observed",
      value: mediaSummary?.autoplayVideoObserved === true || mediaSummary?.autoplayAudioObserved === true
    }
  ];
}

function firstTimelineMs(...values: unknown[]) {
  const numbers = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);

  return numbers[0] ?? null;
}

function firstTimelineMsFromRows(
  rows: Record<string, unknown>[],
  predicate: (row: Record<string, unknown>) => boolean
) {
  return firstTimelineMs(
    rows
      .filter(predicate)
      .map((row) =>
        firstTimelineMs(
          row.timestampMs,
          row.timestamp_ms,
          row.tsMs,
          row.ts_ms,
          row.firstObservedAtMs,
          row.first_observed_at_ms,
          row.firstObservedMs,
          row.first_observed_ms,
          row.observedAtMs,
          row.observed_at_ms,
          row.firstSeenMs,
          row.first_seen_ms
        )
      )
  );
}

function firstConcreteFingerprintingTimelineMs(rows: Record<string, unknown>[]) {
  return firstTimelineMsFromRows(rows, (row) =>
    ["scriptHost", "script_host", "scriptUrl", "script_url", "requestUrl", "request_url", "responsibleScriptUrl"]
      .some((key) => typeof row[key] === "string" && (row[key] as string).trim().length > 0)
  );
}

function getTimelineVendorLabel(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  for (const key of ["vendorName", "vendor_name", "vendor", "productName", "product_name", "ownerName", "owner_name", "host", "domain"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstTimelineRow(rows: Record<string, unknown>[], predicate: (row: Record<string, unknown>) => boolean) {
  return rows
    .filter(predicate)
    .map((row) => ({ row, atMs: firstTimelineMsFromRows([row], () => true) }))
    .filter((item): item is { row: Record<string, unknown>; atMs: number } => item.atMs !== null)
    .sort((left, right) => left.atMs - right.atMs)[0]?.row ?? null;
}

function isTypedThirdPartyTimelineRow(row: Record<string, unknown>) {
  return row.thirdParty === true ||
    row.third_party === true ||
    row.isThirdParty === true ||
    row.is_third_party === true ||
    row.firstPartyOrThirdParty === "third_party" ||
    row.first_party_or_third_party === "third_party";
}

export function buildExecutiveTimelineEvents(
  runtimeArtifacts: Record<string, unknown> | null | undefined
): ExecutiveTimelineEvent[] {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  if (!hybrid) {
    return [];
  }

  const timelineMarkers = getRecord(hybrid.timelineMarkers) ?? getRecord(hybrid.timeline_markers);
  const requestRows = [
    ...getRecordObjectArray(hybrid, "requestPurposeClassificationConfidence"),
    ...getRecordObjectArray(hybrid, "request_purpose_classification_confidence"),
    ...getRecordObjectArray(hybrid, "requestObservations"),
    ...getRecordObjectArray(hybrid, "request_observations")
  ];
  const embeddedSummary = getRecord(hybrid.embeddedContentSummary) ?? getRecord(hybrid.embedded_content_summary);
  const iframeSummary = getRecord(hybrid.iframeSummary) ?? getRecord(hybrid.iframe_summary);
  const embeddedRows = [
    ...getRecordObjectArray(embeddedSummary, "observations"),
    ...getRecordObjectArray(iframeSummary, "iframeEvents"),
    ...getRecordObjectArray(iframeSummary, "iframe_events")
  ];
  const cookieRows = [
    ...getRecordObjectArray(hybrid, "cookieObservations"),
    ...getRecordObjectArray(hybrid, "cookie_observations"),
    ...getRecordObjectArray(hybrid, "storageObservations"),
    ...getRecordObjectArray(hybrid, "storage_observations")
  ];
  const consentSummary = getRecord(hybrid.consentSummary) ?? getRecord(hybrid.consent_summary);
  const firstRequestRow = firstTimelineRow(requestRows, isTypedThirdPartyTimelineRow);
  const firstCookieRow = firstTimelineRow(cookieRows, () => true);
  const firstAdRow = firstTimelineRow(requestRows, (row) => /advertising|adtech|retargeting|marketing/i.test(String(row.category ?? row.vendorCategory ?? row.vendor_category ?? row.classification ?? "")));
  const firstAnalyticsRow = firstTimelineRow(requestRows, (row) => /analytics|measurement/i.test(String(row.category ?? row.vendorCategory ?? row.vendor_category ?? "")));
  const firstEmbeddedRow = firstTimelineRow(embeddedRows, (row) => row.preConsent !== false && row.pre_consent !== false);
  const sessionReplaySummary =
    getRecord(hybrid.sessionReplayEvidenceSummary) ?? getRecord(hybrid.session_replay_evidence_summary);
  const fingerprintRows = [
    ...getRecordObjectArray(hybrid, "fingerprintingRuntimeEvidence"),
    ...getRecordObjectArray(hybrid, "fingerprinting_runtime_evidence")
  ];
  const fingerprintSummary =
    getRecord(hybrid.fingerprintingEvidenceSummary) ?? getRecord(hybrid.fingerprinting_evidence_summary);
  const embeddedEvidenceObserved = embeddedSummary?.embeddedContentObserved === true ||
    embeddedSummary?.embedded_content_observed === true;
  const concreteFingerprintMs = fingerprintSummary?.strongCorroboratorObserved === true ||
    fingerprintSummary?.strong_corroborator_observed === true
    ? firstConcreteFingerprintingTimelineMs(fingerprintRows)
    : null;
  const fingerprintCandidateMs = concreteFingerprintMs === null
    ? firstTimelineMsFromRows(fingerprintRows, () => true)
    : null;
  const events: ExecutiveTimelineEvent[] = [];
  const pushEvent = (event: ExecutiveTimelineEvent) => {
    if (!Number.isFinite(event.atMs) || event.atMs < 0) {
      return;
    }
    if (events.some((existing) => existing.label === event.label)) {
      return;
    }
    events.push(event);
  };

  pushEvent({
    atMs: firstTimelineMs(
      timelineMarkers?.firstConsentSurfaceVisibleMs,
      timelineMarkers?.first_consent_surface_visible_ms,
      timelineMarkers?.firstCmpVisibleMs,
      timelineMarkers?.first_cmp_visible_ms,
      consentSummary?.observedAtMs,
      consentSummary?.observed_at_ms,
      consentSummary?.firstObservedAtMs,
      consentSummary?.first_observed_at_ms
    ) ?? -1,
    label: "Consent banner",
    tone: "emerald",
    vendorLabel: getTimelineVendorLabel(consentSummary)
  });
  pushEvent({
    atMs: firstRequestRow
      ? firstTimelineMs(
          timelineMarkers?.firstNonEssentialRequestMs,
          timelineMarkers?.first_non_essential_request_ms,
          timelineMarkers?.firstThirdPartyRequestMs,
          timelineMarkers?.first_third_party_request_ms
        ) ?? -1
      : -1,
    label: "3P request",
    tone: "amber",
    vendorLabel: getTimelineVendorLabel(firstRequestRow)
  });
  pushEvent({
    atMs:
      firstTimelineMs(
        timelineMarkers?.firstTrackingCookieSetMs,
        timelineMarkers?.first_tracking_cookie_set_ms,
        timelineMarkers?.firstCookieWriteMs,
        timelineMarkers?.first_cookie_write_ms
      ) ?? -1,
    label: "Cookie/storage",
    tone: "amber",
    vendorLabel: getTimelineVendorLabel(firstCookieRow)
  });
  pushEvent({
    atMs:
      firstTimelineMsFromRows(requestRows, (row) =>
        /advertising|adtech|retargeting|marketing/i.test(
          String(row.category ?? row.vendorCategory ?? row.vendor_category ?? row.classification ?? "")
        )
      ) ?? -1,
    label: "Ad vendor",
    tone: "rose",
    vendorLabel: getTimelineVendorLabel(firstAdRow)
  });
  pushEvent({
    atMs:
      firstTimelineMsFromRows(requestRows, (row) =>
        /analytics|measurement/i.test(String(row.category ?? row.vendorCategory ?? row.vendor_category ?? ""))
      ) ?? -1,
    label: "Analytics",
    tone: "sky",
    vendorLabel: getTimelineVendorLabel(firstAnalyticsRow)
  });
  pushEvent({
    atMs:
      firstTimelineMs(
        sessionReplaySummary?.firstSeenMs,
        sessionReplaySummary?.first_seen_ms,
        sessionReplaySummary?.firstObservedMs,
        sessionReplaySummary?.first_observed_ms
      ) ?? -1,
    label: "Session replay",
    tone: "rose"
  });
  pushEvent({
    atMs: concreteFingerprintMs ?? fingerprintCandidateMs ?? -1,
    label: concreteFingerprintMs === null ? "Fingerprinting candidate" : "Fingerprinting",
    tone: "rose"
  });
  pushEvent({
    atMs: embeddedEvidenceObserved
      ? firstTimelineMsFromRows(embeddedRows, (row) => row.preConsent !== false && row.pre_consent !== false) ?? -1
      : -1,
    label: "Embedded content",
    tone: "amber",
    vendorLabel: getTimelineVendorLabel(firstEmbeddedRow)
  });

  return events.sort((left, right) => left.atMs - right.atMs).slice(0, 8);
}

function getPolicyField(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return null;
}

type PolicyBehaviorContradiction = {
  claim: string;
  evidence: string[];
  observedBehavior: string;
  policyPageUrl: string | null;
  policyClaimType?: PolicyBehaviorConflictClaimType | null;
  policyConfidence?: number | null;
  policyExtractionStatus?: string | null;
  policySnippet: string | null;
  policySummary: string | null;
  relatedVendors: string[];
  runtimeConfidence?: number | null;
  runtimeObservationType?: PolicyBehaviorRuntimeObservationType | null;
  runtimePhase?: "pre_consent" | "unknown";
  runtimeScriptHosts?: string[];
  runtimeSummary: string;
  runtimeVendors: string[];
  conflictReasoning?: string | null;
  conflictSupportsPromotion?: boolean;
  conflictType?: PolicyBehaviorConflictType | null;
  supportingSignals: string[];
  severity: "high" | "medium";
  status: "contradiction" | "violation risk" | "likely contradiction";
  title: string;
};

function getPolicySnippetValues(row: Record<string, unknown> | null) {
  if (!row) {
    return [];
  }

  const snippets = getPolicyEvidenceSnippets(row);
  const snippetValues = snippets && typeof snippets === "object" ? Object.values(snippets) : [];

  return uniqueStrings([
    ...snippetValues.map((value) => (typeof value === "string" ? normalizePolicySnippet(value) : null)),
    getPolicySummaryText(row) ? normalizePolicySnippet(getPolicySummaryText(row) ?? "") : null
  ]);
}

function getPolicyRowNumber(row: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getPolicyRowString(row: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function hasContradictionGradePolicyExtraction(row: Record<string, unknown> | null) {
  const policyPageUrl = row ? getPolicyPageUrl(row) : null;
  const semanticConfidence = getPolicyRowNumber(row, ["policy_semantic_confidence", "policySemanticConfidence"]);
  const coverageRatio = getPolicyRowNumber(row, ["policy_coverage_ratio", "policyCoverageRatio"]);
  const extractionStatus = getPolicyRowString(row, ["policy_extraction_status", "policyExtractionStatus"]) ?? "fetched";
  const snippetCount = getPolicyRowNumber(row, ["policy_snippet_count", "policySnippetCount"]);

  return Boolean(
    policyPageUrl &&
      extractionStatus === "fetched" &&
      (semanticConfidence === null || semanticConfidence >= 0.55) &&
      (coverageRatio === null || coverageRatio >= 0.25) &&
      (snippetCount === null || snippetCount > 0)
  );
}

function deriveConsentGatingPolicyAnchor(row: Record<string, unknown> | null) {
  const snippets = getPolicySnippetValues(row);
  const policyPageUrl = row ? getPolicyPageUrl(row) : null;
  const semanticConfidence = getPolicyRowNumber(row, ["policy_semantic_confidence", "policySemanticConfidence"]);

  if (!hasContradictionGradePolicyExtraction(row)) {
    return null;
  }

  for (const snippet of snippets) {
    const lowerSnippet = snippet.toLowerCase();
    const mentionsNonEssential =
      /optional|non[-\s]?essential|analytics|advertis(?:e|ing)|marketing|tracking|targeting|performance/.test(lowerSnippet);
    const mentionsConsent = /consent|choice|permission|opt[-\s]?in|accept|agree/.test(lowerSnippet);
    const necessaryOnly =
      /(only|solely|strictly)\s+(necessary|required|essential)/.test(lowerSnippet) ||
      /necessary cookies? (?:only|until|before)/.test(lowerSnippet);
    const marketingBeforeConsent =
      /(advertis(?:e|ing)|marketing|tracking|targeting|analytics).{0,80}(consent|choice|permission|opt[-\s]?in)/.test(lowerSnippet) ||
      /(consent|choice|permission|opt[-\s]?in).{0,80}(advertis(?:e|ing)|marketing|tracking|targeting|analytics)/.test(lowerSnippet);
    const rejectDisablesTracking =
      /(reject|decline|disable|turn off).{0,80}(analytics|advertis(?:e|ing)|marketing|tracking|targeting|non[-\s]?essential)/.test(lowerSnippet);
    const vagueConsentReference =
      /(?:we value your privacy|may use cookies|use cookies to improve|cookies and similar technologies)/.test(lowerSnippet) &&
      !necessaryOnly &&
      !marketingBeforeConsent &&
      !rejectDisablesTracking;

    if (vagueConsentReference) {
      continue;
    }

    let claimType: PolicyBehaviorConflictClaimType | null = null;
    if (necessaryOnly && mentionsConsent) {
      claimType = "only_necessary_cookies_before_choice";
    } else if ((mentionsNonEssential && mentionsConsent) || marketingBeforeConsent || rejectDisablesTracking) {
      claimType = "no_marketing_tracking_before_consent";
    }

    if (!claimType) {
      continue;
    }

    return {
      claimType,
      confidence: semanticConfidence ?? 0.82,
      extractionStatus: "fetched",
      normalizedClaim: snippet,
      snippet,
      sourceUrl: policyPageUrl
    };
  }

  return null;
}

function deriveConsentGatingPolicyAnchorFromRows(rows: Array<Record<string, unknown>>) {
  const privacyPolicyAnchor = rows
    .filter((row) => getPolicyPageType(row) === "privacy_policy" || getPolicyPageType(row) === "cookie_policy")
    .map((row) => deriveConsentGatingPolicyAnchor(row))
    .find(Boolean);
  if (privacyPolicyAnchor) {
    return privacyPolicyAnchor;
  }

  return rows.map((row) => deriveConsentGatingPolicyAnchor(row)).find(Boolean) ?? null;
}

function derivePreconsentObservationType(
  preconsentRows: Array<{ vendorCategory: string; vendorName: string }>
): PolicyBehaviorRuntimeObservationType | null {
  const categories = preconsentRows
    .map((row) => (typeof row.vendorCategory === "string" ? row.vendorCategory.toLowerCase() : ""))
    .filter((value) => value.length > 0);
  const vendorNames = preconsentRows
    .map((row) => (typeof row.vendorName === "string" ? row.vendorName.toLowerCase() : ""))
    .filter((value) => value.length > 0);
  const haystack = [...categories, ...vendorNames].join(" ");

  if (/advertis|marketing|adtech|retarget|targeting|social|doubleclick|facebook|linkedin|reddit|tiktok|snap/.test(haystack)) {
    return "marketing_vendor_fired_pre_consent";
  }
  if (/analytics|measurement|session[_\s-]?replay|replay|hotjar|clarity|fullstory|google analytics|ga4/.test(haystack)) {
    return "analytics_vendor_fired_pre_consent";
  }

  return preconsentRows.length > 0 ? "analytics_vendor_fired_pre_consent" : null;
}

function derivePolicyBehaviorContradictions(input: {
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  primaryPolicyEnrichment?: Record<string, unknown> | null;
  policyEnrichments: Array<Record<string, unknown>>;
  preconsentViolations: Array<{
    evidenceUrls: string[];
    scriptHost?: string | null;
    vendorCategory: string;
    vendorName: string;
  }>;
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  trackerVendors: Array<{
    beforeConsent: boolean | null;
    vendorCategory: string;
    vendorDisplayCategory?: string | null;
    vendorName: string;
  }>;
}) {
  const privacyEnrichment =
    input.primaryPolicyEnrichment ??
    input.policyEnrichments.find((row) => getPolicyPageType(row) === "privacy_policy") ??
    input.policyEnrichments[0] ??
    null;
  const contradictions: PolicyBehaviorContradiction[] = [];
  const trackerVendors = input.trackerVendors.map((tracker) => tracker.vendorName);
  const advertisingVendors = input.trackerVendors
    .filter((tracker) => tracker.vendorCategory === "advertising")
    .map((tracker) => tracker.vendorName);
  const sessionReplayVendors = input.trackerVendors
    .filter((tracker) => tracker.vendorCategory === "session_replay")
    .map((tracker) => tracker.vendorName);
  const preconsentVendors = input.preconsentViolations.map((row) => row.vendorName);
  const preconsentEvidence = [...new Set(input.preconsentViolations.flatMap((row) => row.evidenceUrls))];
  const hasPolicyBehaviorConflict =
    input.snapshot?.policy_behavior_conflict_detected === true || input.snapshot?.policyBehaviorConflictDetected === true;
  const mergedPolicyFlags = findMergedSignalValue(input.mergedSignals, "policyActionableFlags");
  const policyFlags = Array.isArray(mergedPolicyFlags)
    ? mergedPolicyFlags.filter((value): value is string => typeof value === "string")
    : [];
  const mergedPolicyDoNotSell = findMergedSignalValue(input.mergedSignals, "policyDoNotSell");
  const policyDoNotSell = typeof mergedPolicyDoNotSell === "string" ? mergedPolicyDoNotSell : "unknown";
  const policyPageUrl = privacyEnrichment ? getPolicyPageUrl(privacyEnrichment) : null;
  const policySummary = privacyEnrichment ? getPolicySummaryText(privacyEnrichment) : null;
  const consentGatingAnchor = deriveConsentGatingPolicyAnchorFromRows(input.policyEnrichments);

  if (preconsentVendors.length > 0) {
    const runtimeObservationType = derivePreconsentObservationType(input.preconsentViolations);
    const conflictType = consentGatingAnchor
      ? getAllowedConflictType(consentGatingAnchor.claimType, runtimeObservationType)
      : null;
    const hasConcreteRuntimeRequest = preconsentEvidence.some((url) => /^https?:\/\//i.test(url));
    const preconsentScriptHosts = uniqueStrings(input.preconsentViolations.map((row) => row.scriptHost));
    const conflictSupportsPromotion = Boolean(
      consentGatingAnchor?.sourceUrl &&
        consentGatingAnchor.snippet &&
        runtimeObservationType &&
        conflictType &&
        hasConcreteRuntimeRequest &&
        preconsentVendors.length > 0
    );
    const policyClaim =
      consentGatingAnchor?.normalizedClaim ??
      "The policy and consent surface imply tracking should begin only after a valid consent interaction.";
    const runtimeSummary = `Trackers fired on first render before consent interaction: ${preconsentVendors.join(", ")}.`;

    contradictions.push({
      title: "Consent-gated tracking claim conflicts with runtime behavior",
      status: "violation risk",
      severity: "high",
      claim: policyClaim,
      observedBehavior: runtimeSummary,
      evidence: preconsentEvidence.slice(0, 3),
      policyPageUrl: consentGatingAnchor?.sourceUrl ?? policyPageUrl,
      policyClaimType: consentGatingAnchor?.claimType ?? null,
      policyConfidence: consentGatingAnchor?.confidence ?? null,
      policyExtractionStatus: consentGatingAnchor?.extractionStatus ?? null,
      policySnippet: consentGatingAnchor?.snippet ?? null,
      policySummary,
      relatedVendors: preconsentVendors,
      runtimeConfidence: hasConcreteRuntimeRequest ? 0.82 : 0.5,
      runtimeObservationType,
      runtimePhase: "pre_consent",
      runtimeScriptHosts: preconsentScriptHosts,
      runtimeSummary,
      runtimeVendors: preconsentVendors,
      conflictReasoning:
        consentGatingAnchor && runtimeObservationType
          ? "The policy anchor describes consent-gated non-essential tracking, while runtime evidence shows tracker requests before consent."
          : runtimeSummary,
      conflictSupportsPromotion,
      conflictType,
      supportingSignals: uniqueStrings([
        "consent_gating_claim",
        ...preconsentScriptHosts.map((host) => `preconsent_script_host:${host}`)
      ])
    });
  }

  if ((policyDoNotSell === "present_link" || policyDoNotSell === "present_text") && advertisingVendors.length > 0) {
    contradictions.push({
      title: "Do-not-sell / sharing disclosure conflicts with observed adtech stack",
      status: "likely contradiction",
      severity: "medium",
      claim: "The policy makes an explicit do-not-sell or sharing disclosure, which raises the bar for consistency around third-party marketing data use.",
      observedBehavior: `Advertising or retargeting vendors were observed at runtime: ${advertisingVendors.join(", ")}.`,
      evidence: advertisingVendors.slice(0, 4),
      policyPageUrl,
      policySnippet: "The policy makes an explicit do-not-sell or sharing disclosure, which raises the bar for consistency around third-party marketing data use.",
      policySummary,
      relatedVendors: advertisingVendors,
      runtimeSummary: `Advertising or retargeting vendors were observed at runtime: ${advertisingVendors.join(", ")}.`,
      runtimeVendors: advertisingVendors,
      supportingSignals: [policyDoNotSell]
    });
  }

  if (hasPolicyBehaviorConflict || policyFlags.includes("policy_behavior_conflict_candidate")) {
    contradictions.push({
      title: "Policy/behavior conflict detected",
      status: "contradiction",
      severity: "high",
      claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
      observedBehavior:
        advertisingVendors.length > 0
          ? `Observed adtech vendors include ${advertisingVendors.join(", ")}${sessionReplayVendors.length > 0 ? `; session replay tooling includes ${sessionReplayVendors.join(", ")}.` : "."}`
          : trackerVendors.length > 0
            ? `Observed tracker vendors include ${trackerVendors.slice(0, 6).join(", ")}.`
            : "The scan flagged a policy/behavior conflict based on runtime evidence and policy semantics.",
      evidence: [
        ...(preconsentEvidence.slice(0, 2) ?? []),
        ...advertisingVendors.slice(0, 2),
        ...sessionReplayVendors.slice(0, 1)
      ].slice(0, 4),
      policyPageUrl,
      policySnippet: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
      policySummary,
      relatedVendors: uniqueStrings([...advertisingVendors, ...sessionReplayVendors, ...preconsentVendors]).slice(0, 6),
      runtimeSummary:
        advertisingVendors.length > 0
          ? `Observed adtech vendors include ${advertisingVendors.join(", ")}${sessionReplayVendors.length > 0 ? `; session replay tooling includes ${sessionReplayVendors.join(", ")}.` : "."}`
          : trackerVendors.length > 0
            ? `Observed tracker vendors include ${trackerVendors.slice(0, 6).join(", ")}.`
            : "The scan flagged a policy/behavior conflict based on runtime evidence and policy semantics.",
      runtimeVendors: uniqueStrings([...advertisingVendors, ...sessionReplayVendors, ...preconsentVendors]).slice(0, 6),
      supportingSignals: uniqueStrings([
        hasPolicyBehaviorConflict ? "policy_behavior_conflict_detected" : null,
        policyFlags.includes("policy_behavior_conflict_candidate") ? "policy_behavior_conflict_candidate" : null
      ])
    });
  }

  return contradictions.filter(
    (row, index, rows) =>
      rows.findIndex((candidate) => candidate.title === row.title && candidate.observedBehavior === row.observedBehavior) === index
  );
}

function derivePreconsentViolationRows(input: {
  persistedViolations: Array<{
    collectionEndpointType: string;
    confidence: number;
    detectionSource: string;
    evidenceUrls: string[];
    firstPartyOrThirdParty: string;
    matchedSignatureId: string | null;
    scriptHost: string | null;
    vendorCategory: string;
    vendorName: string;
  }>;
  runtimeArtifacts: Record<string, unknown> | null;
  trackerVendors: Array<{
    beforeConsent: boolean | null;
    collectionEndpointType: string;
    confidence: number;
    detectionSource: string;
    matchedSignatureId: string | null;
    scriptHost: string | null;
    vendorCategory: string;
    vendorDisplayCategory?: string | null;
    vendorName: string;
  }>;
}) {
  if (input.persistedViolations.length > 0) {
    return input.persistedViolations;
  }

  const baselineTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_vendor_names");
  const baselineEvidenceUrls = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
  const baselineScriptHosts = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_script_hosts");
  const highRiskContext = deriveHighRiskTrackingContext({
    runtimeArtifacts: input.runtimeArtifacts,
    evidenceUrls: baselineEvidenceUrls
  });
  const synthesizedHighRiskVendors = highRiskContext.highRiskVendors.filter(
    (vendor) => !baselineTrackerVendors.some((name) => name.toLowerCase() === vendor.name.toLowerCase())
  );
  const vendorNames = uniqueStrings([
    ...baselineTrackerVendors,
    ...synthesizedHighRiskVendors.map((vendor) => vendor.name)
  ]);

  return vendorNames.map((vendorName) => {
    const tracker = input.trackerVendors.find((candidate) => candidate.vendorName === vendorName);
    const highRiskVendor = synthesizedHighRiskVendors.find((candidate) => candidate.name === vendorName);
    const vendorEvidenceUrls = baselineEvidenceUrls.filter((url) => {
      const lowerUrl = url.toLowerCase();
      const lowerVendor = vendorName.toLowerCase();

      if (lowerVendor.includes("linkedin")) {
        return lowerUrl.includes("linkedin") || lowerUrl.includes("licdn");
      }
      if (lowerVendor.includes("google")) {
        return lowerUrl.includes("google") || lowerUrl.includes("doubleclick") || lowerUrl.includes("googletagmanager");
      }
      if (lowerVendor.includes("marketo")) {
        return lowerUrl.includes("marketo") || lowerUrl.includes("munchkin");
      }
      if (lowerVendor.includes("reddit")) {
        return lowerUrl.includes("reddit");
      }
      if (lowerVendor.includes("clarity")) {
        return lowerUrl.includes("clarity");
      }

      if (highRiskVendor) {
        return highRiskVendor.evidence.some((evidence) => lowerUrl.includes(evidence.toLowerCase())) ||
          lowerUrl.includes(lowerVendor.replace(/\s+|\/.*/g, ""));
      }

      return lowerUrl.includes(lowerVendor.replace(/\s+/g, ""));
    });

    return {
      collectionEndpointType: tracker?.collectionEndpointType ?? "unknown",
      confidence: tracker?.confidence ?? (highRiskVendor ? 0.86 : 0),
      detectionSource: tracker?.detectionSource ?? "runtime_audit",
      evidenceUrls: vendorEvidenceUrls.length > 0 ? vendorEvidenceUrls : highRiskVendor?.evidence.filter((value) => /^https?:\/\//i.test(value)) ?? [],
      firstPartyOrThirdParty: "unknown",
      matchedSignatureId: tracker?.matchedSignatureId ?? null,
      scriptHost: tracker?.scriptHost ?? baselineScriptHosts.find((host) => host && host.toLowerCase().includes(vendorName.toLowerCase().replace(/\s+/g, ""))) ?? highRiskVendor?.evidence.find((value) => !/^https?:\/\//i.test(value)) ?? null,
      vendorCategory: tracker?.vendorCategory ?? highRiskVendor?.category ?? "unknown",
      vendorName
    };
  });
}

function deriveAccessibilityIssueRows(snapshot: Record<string, unknown>) {
  const rows = [
    {
      key: "contrast",
      count: getSnapshotNumber(snapshot, "wcag_contrast_failures_count"),
      description: "Contrast failures can make text and controls hard to perceive for low-vision users.",
      label: "Contrast failures"
    },
    {
      key: "alt",
      count: getSnapshotNumber(snapshot, "wcag_missing_alt_count"),
      description: "Missing alt text reduces screen-reader access to informative images.",
      label: "Missing alt text"
    },
    {
      key: "navigation",
      count: getSnapshotNumber(snapshot, "wcag_keyboard_navigation_issue_count") + getSnapshotNumber(snapshot, "wcag_focus_indicator_issue_count"),
      description: "Keyboard/focus issues make navigation harder without a mouse.",
      label: "Navigation issues"
    },
    {
      key: "aria",
      count: getSnapshotNumber(snapshot, "wcag_aria_error_count"),
      description: "ARIA issues can break semantics or assistive-technology interpretation.",
      label: "ARIA problems"
    },
    {
      key: "labels",
      count: getSnapshotNumber(snapshot, "wcag_form_label_error_count"),
      description: "Form label issues make inputs less understandable and harder to complete.",
      label: "Form label issues"
    }
  ].filter((row) => row.count > 0);

  return rows.sort((left, right) => right.count - left.count);
}

function getAccessibilitySeverity(count: number) {
  if (count >= 20) {
    return "high";
  }
  if (count >= 5) {
    return "medium";
  }
  return "low";
}

function formatWcagCriteria(criteria: string[]) {
  return criteria.join(", ");
}

type AccessibilityRuleEvidenceRow = {
  criteria: string[];
  description: string | null;
  family: string;
  help: string | null;
  helpUrl: string | null;
  impact: string | null;
  instanceCount: number;
  nodeCount: number;
  pageUrl: string | null;
  remediation: string;
  representativeSelectors: string[];
  ruleCode: string;
  ruleGroup: string;
  severity: string;
  weightedPriority: number;
};

function getAccessibilityRuleMetadata(ruleCode: string, ruleGroup: string) {
  const metadataByRuleCode: Record<
    string,
    {
      criteria: string[];
      family: string;
      impact: string;
      remediation: string;
    }
  > = {
    "color-contrast": {
      criteria: ["WCAG 1.4.3", "WCAG 1.4.11"],
      family: "Contrast",
      impact: "Low-vision users may struggle to read text or distinguish controls.",
      remediation: "Adjust foreground, background, and focus-state contrast on primary UI elements."
    },
    "image-alt": {
      criteria: ["WCAG 1.1.1"],
      family: "Alt text",
      impact: "Screen-reader users may miss meaningful image content.",
      remediation: "Add descriptive alt text for informative images and empty alt text for decorative images."
    },
    "label": {
      criteria: ["WCAG 1.3.1", "WCAG 3.3.2"],
      family: "Form labels",
      impact: "Inputs become harder to understand and complete with assistive technology.",
      remediation: "Associate visible labels or robust accessible names with every user-input control."
    },
    "aria-valid-attr-value": {
      criteria: ["WCAG 4.1.2"],
      family: "ARIA",
      impact: "Broken ARIA values can confuse assistive technologies or invalidate semantics.",
      remediation: "Correct invalid ARIA attributes and values to restore reliable semantics."
    },
    "aria-required-attr": {
      criteria: ["WCAG 4.1.2"],
      family: "ARIA",
      impact: "Missing required ARIA attributes can break expected component behavior for assistive technology.",
      remediation: "Add the required ARIA attributes for each custom widget pattern."
    },
    "button-name": {
      criteria: ["WCAG 4.1.2", "WCAG 2.4.4"],
      family: "Navigation",
      impact: "Unnamed controls create ambiguity for screen-reader and keyboard users.",
      remediation: "Ensure every actionable control has a clear accessible name."
    },
    "link-name": {
      criteria: ["WCAG 2.4.4", "WCAG 4.1.2"],
      family: "Navigation",
      impact: "Links without names make navigation and page comprehension harder.",
      remediation: "Provide descriptive visible or accessible names for each link target."
    },
    "heading-order": {
      criteria: ["WCAG 1.3.1", "WCAG 2.4.6"],
      family: "Structure",
      impact: "Broken heading hierarchy makes content harder to scan and navigate.",
      remediation: "Restore logical heading order and hierarchy across primary content sections."
    },
    "landmark-one-main": {
      criteria: ["WCAG 1.3.1"],
      family: "Navigation",
      impact: "Missing landmarks can make page regions less navigable for assistive technology.",
      remediation: "Add consistent landmark structure, especially a single main region."
    }
  };

  const directMatch = metadataByRuleCode[ruleCode];
  if (directMatch) {
    return directMatch;
  }

  const metadataByRuleGroup: Record<
    string,
    {
      criteria: string[];
      family: string;
      impact: string;
      remediation: string;
    }
  > = {
    alt: {
      criteria: ["WCAG 1.1.1"],
      family: "Alt text",
      impact: "Non-text content is less accessible to screen-reader users.",
      remediation: "Add or repair alternative text coverage on meaningful image content."
    },
    contrast: {
      criteria: ["WCAG 1.4.3", "WCAG 1.4.11"],
      family: "Contrast",
      impact: "Insufficient contrast reduces readability and control discoverability.",
      remediation: "Raise text, icon, and control contrast across affected UI states."
    },
    aria: {
      criteria: ["WCAG 4.1.2"],
      family: "ARIA",
      impact: "ARIA implementation issues can break semantics and announcements.",
      remediation: "Repair custom component semantics and invalid ARIA usage."
    },
    label: {
      criteria: ["WCAG 1.3.1", "WCAG 3.3.2"],
      family: "Form labels",
      impact: "Users may not understand what a form control expects.",
      remediation: "Add explicit labels and stable accessible names for each form input."
    },
    keyboard: {
      criteria: ["WCAG 2.1.1", "WCAG 2.4.7"],
      family: "Keyboard",
      impact: "Keyboard users can lose navigation flow or focus visibility.",
      remediation: "Fix keyboard navigation traps, missing focus styles, and tab order issues."
    },
    focus: {
      criteria: ["WCAG 2.4.7"],
      family: "Keyboard",
      impact: "Users may lose sight of where focus is on the page.",
      remediation: "Restore strong visible focus indicators on interactive elements."
    },
    landmark: {
      criteria: ["WCAG 1.3.1"],
      family: "Navigation",
      impact: "Missing landmarks reduce efficient page navigation for assistive technology.",
      remediation: "Add and validate landmark roles for major page regions."
    },
    heading: {
      criteria: ["WCAG 1.3.1", "WCAG 2.4.6"],
      family: "Structure",
      impact: "Heading structure problems make pages harder to navigate and understand.",
      remediation: "Repair heading levels and page outline consistency."
    },
    link: {
      criteria: ["WCAG 2.4.4"],
      family: "Navigation",
      impact: "Weak or missing link names make navigation ambiguous.",
      remediation: "Use descriptive link text and accessible names."
    }
  };

  return (
    metadataByRuleGroup[ruleGroup] ?? {
      criteria: ["WCAG review needed"],
      family: "Other",
      impact: "Automated accessibility issues were detected in this rule family.",
      remediation: "Review the affected components and validate the issue against the relevant WCAG success criteria."
    }
  );
}

function deriveAccessibilityRuleEvidenceRows(input: {
  examples: Array<{
    description: string;
    help: string;
    helpUrl: string;
    impact: string | null;
    nodeCount: number;
    pageUrl: string;
    representativeSelectors: string[];
    ruleCode: string;
    ruleGroup: string;
    severity: string;
  }>;
  ruleCounts: Array<{
    instanceCount: number;
    ruleCode: string;
    ruleGroup: string;
    severity: string;
  }>;
}): AccessibilityRuleEvidenceRow[] {
  if (input.examples.length > 0) {
    return input.examples.map((example) => {
      const metadata = getAccessibilityRuleMetadata(example.ruleCode, example.ruleGroup);
      const weightedPriority =
        (example.severity === "high" ? 30 : example.severity === "medium" ? 20 : 10) + Math.min(example.nodeCount, 25);

      return {
        ...example,
        ...metadata,
        instanceCount: example.nodeCount,
        weightedPriority
      };
    });
  }

  return input.ruleCounts.map((rule) => {
    const metadata = getAccessibilityRuleMetadata(rule.ruleCode, rule.ruleGroup);
    const weightedPriority =
      (rule.severity === "high" ? 30 : rule.severity === "medium" ? 20 : 10) + Math.min(rule.instanceCount, 25);

    return {
      ...rule,
      ...metadata,
      description: null,
      help: null,
      helpUrl: null,
      impact: null,
      nodeCount: rule.instanceCount,
      pageUrl: null,
      representativeSelectors: [],
      severity: rule.severity,
      weightedPriority
    };
  });
}

function hasTruthySignal(
  signals: Array<{ key: string; value: boolean | number | string | string[] }>,
  key: string
) {
  return signals.some((signal) => {
    const matches = signal.key === key || signal.key.endsWith(`.${key}`);
    return matches && signal.value === true;
  });
}

const HIDDEN_KEY_RISK_SIGNAL_SECTIONS = new Set([
  "Privacy & Tracking",
  "Fingerprinting",
  "Financial & Claims",
  "Accessibility",
  "Cookies & Storage",
  "Vendors & Requests"
]);

const OPERATIONAL_SNAPSHOT_SECTIONS = [
  {
    title: "Coverage",
    fields: [
      "total_signals",
      "accessibility_signal_count",
      "privacy_signal_count",
      "disclosure_signal_count",
      "certscore_overall",
      "privacy_score",
      "consent_score",
      "tracker_risk_score",
      "accessibility_score",
      "data_collection_risk_score",
      "consumer_protection_score",
      "children_privacy_risk_score",
      "legal_coverage_score",
      "regulatory_exposure_score",
      "compliance_maturity_tier"
    ]
  },
  {
    title: "Crawl And Site",
    fields: [
      "scan_timestamp",
      "scanner_schema_version",
      "detection_engine_version",
      "domain",
      "registered_domain",
      "crawl_source",
      "crawl_tier",
      "robots_allowed",
      "robots_fetch_status",
      "robots_fetch_http_status",
      "homepage_fetch_status",
      "homepage_fetch_http_status",
      "final_url",
      "redirect_count",
      "render_mode_used",
      "scan_confidence",
      "partial_scan",
      "timeout_flag",
      "blocked_flag",
      "captcha_flag",
      "country_inferred",
      "jurisdiction_guess",
      "traffic_tier_estimate"
    ]
  },
] as const;

const SNAPSHOT_SECTION_HELP: Record<string, string> = {
  Coverage: "A compact view of how many signals the scan surfaced and how the main scoring layers resolved.",
  "Crawl And Site": "Core crawl outcome, fetch behavior, and site-level context captured during the scan."
};

type ResultMetric = {
  label: string;
  value: string;
  tooltip: string;
};

type ResultDetail = {
  label: string;
  value: unknown;
};

type ScanRecordData = ScanDetailResponse;

type CanonicalTaxonomyReviewProps = {
  createAccountHref?: string | null;
  executiveSummary: {
    badges: Array<{
      label: string;
      tone?: "neutral" | "warning";
      tooltip?: string;
    }>;
    metrics: Array<{
      href?: string;
      label: string;
      tooltip?: string;
      value: string;
    }>;
    statusCallout: {
      details: string[];
      title: string;
      tone: "danger" | "success" | "warning";
    } | null;
  };
  previewMode?: "full" | "homepage";
  scanRecord: ScanRecordData;
  snapshot: Record<string, unknown>;
  unifiedFindingState: ScanReportUnifiedFindingState;
};

function ScanSectionFallback(input: { message: string; title: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <p className="font-semibold">{input.title}</p>
      <p className="mt-1 text-amber-900">{input.message}</p>
    </div>
  );
}

function renderCanonicalTaxonomyReviewSafely(input: CanonicalTaxonomyReviewProps) {
  try {
    return <CanonicalTaxonomyReview {...input} />;
  } catch (error) {
    console.error("Failed to render canonical scan review", error);
    return (
      <ScanSectionFallback
        title="Review sections unavailable"
        message="The live scan completed, but the structured review sections could not be rendered for this scan. Advanced diagnostics are still available below."
      />
    );
  }
}

function ReviewFindingLinks(input: { finding: UnifiedFindingDisplayPacket }) {
  const findingReferenceHref = getFindingReferenceHrefForReportFindingId(input.finding.unifiedFindingId);
  const fallbackNote = getPublicReportFindingFallbackNote(input.finding.unifiedFindingId);
  const sourceHref = input.finding.sourceUrl && !isRuntimeRequestEvidenceUrl(input.finding.sourceUrl)
    ? stripReportUrlAnnotation(input.finding.sourceUrl)
    : null;
  const shouldShowReferenceLink =
    input.finding.referenceUrl &&
    input.finding.referenceUrl !== input.finding.presentation.suggestedBestPractice?.url;

  if (!sourceHref && !shouldShowReferenceLink && !findingReferenceHref && !fallbackNote) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {findingReferenceHref ? (
        <Link
          href={findingReferenceHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-800"
        >
          <span>↗</span>
          <span>Learn how CertScore.ai interprets this finding</span>
        </Link>
      ) : null}
      {!findingReferenceHref && fallbackNote ? (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
          {fallbackNote}
        </span>
      ) : null}
      {sourceHref ? (
        <Link
          href={sourceHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700"
        >
          <span>?</span>
          <span>{input.finding.sourceLabel ?? "Source"}</span>
        </Link>
      ) : null}
      {shouldShowReferenceLink ? (
        <Link
          href={input.finding.referenceUrl!}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700"
        >
          <span>↗</span>
          <span>{input.finding.referenceLabel ?? "Reference"}</span>
        </Link>
      ) : null}
    </div>
  );
}

function formatValidationSupport(finding: UnifiedFindingDisplayPacket) {
  if (!finding.linkedValidationFinding) {
    return null;
  }

  const parts = [
    finding.linkedValidationFinding.verdict ? `Validation ${finding.linkedValidationFinding.verdict.replaceAll("_", " ")}` : null,
    finding.linkedValidationFinding.agreementScore !== null ? `agreement ${finding.linkedValidationFinding.agreementScore}` : null,
    finding.linkedValidationFinding.systemConfidenceBand
      ? `system confidence ${finding.linkedValidationFinding.systemConfidenceBand.replaceAll("_", " ")}`
      : null
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatFindingPageLabel(pageUrl: string) {
  const normalizedPageUrl = stripReportUrlAnnotation(pageUrl);
  try {
    const parsed = new URL(normalizedPageUrl);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.trim();
    const looksLikeTrackingRequest =
      isRuntimeRequestEvidenceUrl(normalizedPageUrl) ||
      parsed.search.length > 80 ||
      pathname.includes("/collect") ||
      pathname.includes("/g/collect") ||
      host.includes("google-analytics.com") ||
      host.includes("googletagmanager.com");

    if (looksLikeTrackingRequest) {
      return null;
    }

    const path = `${parsed.pathname}${parsed.search}`.trim();
    if (!path || path === "/") {
      return parsed.hostname;
    }
    return path;
  } catch {
    return null;
  }
}

function getFindingPageAttributionSummary(finding: UnifiedFindingDisplayPacket) {
  const reportFacingPageUrl = getReportFacingScannedPageUrl(finding);
  if (reportFacingPageUrl) {
    const pageLabel = formatFindingPageLabel(reportFacingPageUrl);
    if (pageLabel && finding.affectedPageCount > 1) {
      return `Seen on ${finding.affectedPageCount} pages including ${pageLabel}.`;
    }
    if (pageLabel) {
      return `Seen on ${pageLabel}.`;
    }
  }

  if (finding.affectedPageCount > 0) {
    return `Seen on ${finding.affectedPageCount} page${finding.affectedPageCount === 1 ? "" : "s"}.`;
  }

  return null;
}

export function filterContradictoryPositiveSurfaceFindings(findings: UnifiedFindingDisplayPacket[]) {
  const contradictoryPositiveFindingIdByNegative = new Map<string, string>([
    ["privacy_contact_channel_missing", "privacy_contact_path_present"],
    ["accessibility_support_path_missing", "accessibility_support_path_present"],
    ["privacy_policy_missing_surface", "privacy_policy_present"],
    ["terms_missing_surface", "terms_of_service_present"],
    ["cookie_policy_missing_surface", "cookie_policy_present"]
  ]);
  const presentFindingIds = new Set(findings.map((finding) => finding.unifiedFindingId));
  const normalizedPositiveTopicKeys = new Set(
    findings.flatMap((finding) => {
      const topicKey = getPositiveSurfaceTopicKey(finding);
      return topicKey ? [topicKey] : [];
    })
  );

  return findings.filter((finding) => {
    const contradictoryPositiveFindingId = contradictoryPositiveFindingIdByNegative.get(finding.unifiedFindingId);
    if (contradictoryPositiveFindingId && presentFindingIds.has(contradictoryPositiveFindingId)) {
      return false;
    }

    const contradictoryPositiveTopicKey = getContradictoryPositiveTopicKey(finding);
    return !contradictoryPositiveTopicKey || !normalizedPositiveTopicKeys.has(contradictoryPositiveTopicKey);
  });
}

function normalizeFindingTopicText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function getPositiveSurfaceTopicKey(finding: Pick<UnifiedFindingDisplayPacket, "title" | "unifiedFindingId">) {
  switch (finding.unifiedFindingId) {
    case "privacy_contact_path_present":
      return "privacy_contact_path";
    case "accessibility_support_path_present":
      return "accessibility_support_path";
    case "privacy_policy_present":
      return "privacy_policy";
    case "terms_of_service_present":
      return "terms_of_service";
    case "cookie_policy_present":
      return "cookie_policy";
    default:
      break;
  }

  const normalizedTitle = normalizeFindingTopicText(finding.title);
  if (normalizedTitle === "privacy contact path present") {
    return "privacy_contact_path";
  }
  if (normalizedTitle === "accessibility support path present") {
    return "accessibility_support_path";
  }
  if (normalizedTitle === "privacy policy present") {
    return "privacy_policy";
  }
  if (normalizedTitle === "terms of service present") {
    return "terms_of_service";
  }
  if (normalizedTitle === "cookie policy present") {
    return "cookie_policy";
  }

  return null;
}

function getContradictoryPositiveTopicKey(finding: Pick<UnifiedFindingDisplayPacket, "title" | "unifiedFindingId">) {
  switch (finding.unifiedFindingId) {
    case "privacy_contact_channel_missing":
      return "privacy_contact_path";
    case "accessibility_support_path_missing":
      return "accessibility_support_path";
    case "privacy_policy_missing_surface":
      return "privacy_policy";
    case "terms_missing_surface":
      return "terms_of_service";
    case "cookie_policy_missing_surface":
      return "cookie_policy";
    default:
      break;
  }

  const normalizedTitle = normalizeFindingTopicText(finding.title);
  if (normalizedTitle === "privacy contact path missing") {
    return "privacy_contact_path";
  }
  if (normalizedTitle === "accessibility support path missing") {
    return "accessibility_support_path";
  }
  if (normalizedTitle === "privacy policy missing") {
    return "privacy_policy";
  }
  if (normalizedTitle === "terms missing") {
    return "terms_of_service";
  }
  if (normalizedTitle === "cookie policy missing") {
    return "cookie_policy";
  }

  return null;
}

function isPositiveSurfaceFinding(finding: UnifiedFindingDisplayPacket) {
  return new Set([
    "accessibility_support_path_present",
    "affiliate_disclosure_present",
    "arbitration_clause_present",
    "behavioral_analytics_disclosure_present",
    "children_privacy_disclosure_present",
    "contact_support_path_present",
    "cookie_policy_present",
    "gpc_disclosure_present",
    "privacy_contact_path_present",
    "privacy_policy_present",
    "privacy_rights_path_present",
    "targeted_advertising_choices_present",
    "targeted_advertising_disclosure_present",
    "terms_of_service_present",
    "third_party_advertising_disclosure_present",
    "tracking_technologies_disclosure_present"
  ]).has(finding.unifiedFindingId);
}

function getFindingToneClasses(finding: UnifiedFindingDisplayPacket) {
  if (isPositiveSurfaceFinding(finding)) {
    return "border-emerald-200 bg-emerald-50";
  }

  switch (finding.severity) {
    case "high":
      return "border-rose-200 bg-rose-50";
    case "medium":
      return "border-amber-200 bg-amber-50";
    default:
      return "border-sky-200 bg-sky-50";
  }
}

function getFindingBadgeClasses(finding: UnifiedFindingDisplayPacket, criticality: string = finding.severity) {
  if (isPositiveSurfaceFinding(finding)) {
    return "bg-emerald-100 text-emerald-900";
  }

  switch (criticality) {
    case "critical":
      return "bg-rose-100 text-rose-900";
    case "high":
      return "bg-rose-100 text-rose-900";
    case "medium":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-sky-100 text-sky-900";
  }
}

function getScanFindingSeverityWeight(severity: UnifiedFindingDisplayPacket["severity"]) {
  switch (severity) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function getConfidenceBadgeClasses(band: UnifiedFindingDisplayPacket["confidenceBand"]) {
  switch (band) {
    case "high":
      return "bg-emerald-100 text-emerald-900";
    case "moderate":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getPresentationStatusBadgeClasses(status: UnifiedFindingDisplayPacket["presentationDecision"]["status"]) {
  switch (status) {
    case "surface":
      return "bg-emerald-100 text-emerald-900";
    case "audit_only":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

function getVerificationBadgeClasses(state: UnifiedFindingDisplayPacket["presentationDecision"]["verificationState"]) {
  switch (state) {
    case "verified":
      return "bg-emerald-100 text-emerald-900";
    case "runtime":
      return "bg-sky-100 text-sky-900";
    case "discovered":
      return "bg-amber-100 text-amber-900";
    case "blocked":
      return "bg-rose-100 text-rose-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getCollapsedFindingSummary(finding: UnifiedFindingDisplayPacket) {
  const source = (finding.observedValue ?? "").trim();
  if (!source) {
    return null;
  }

  const sanitized = sanitizePublicReportEvidenceText(source);
  const normalized = sanitized.endsWith(".") ? sanitized.slice(0, -1) : sanitized;
  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117).trimEnd()}...`;
}

function ReviewFindingCard(input: { finding: UnifiedFindingDisplayPacket }) {
  const validationSupport = formatValidationSupport(input.finding);
  const pageAttribution = getFindingPageAttributionSummary(input.finding);
  const evidenceSummary = summarizeEvidence(input.finding);
  const confidenceRationale = input.finding.presentationDecision.confidenceRationale;
  const collapsedSummary = getCollapsedFindingSummary(input.finding);
  const display = getPublicReportFindingDisplay({
    confidence: input.finding.confidenceBand,
    findingId: input.finding.unifiedFindingId,
    label: input.finding.presentation.findingName,
    observedSummary: input.finding.summary,
    remediation: input.finding.presentation.suggestedFix,
    severity: input.finding.severity,
    title: input.finding.title
  });
  const observedSummary = display.observedSummary
    ?? (input.finding.observedValue ? sanitizePublicReportEvidenceText(input.finding.observedValue) : null);
  const findingJsonPayload = JSON.stringify(compactEvidenceJsonForDisplay(buildReviewFindingSummaryJson(input.finding)), null, 2);
  const positiveSurfaceFinding = isPositiveSurfaceFinding(input.finding);

  return (
    <details
      id={getReviewFindingAnchor(input.finding)}
      className={`group/finding scroll-mt-24 rounded-lg border px-3 py-3 ${getFindingToneClasses(input.finding)}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <ScanReportDisclosureIcon className="group-open/finding:rotate-90" />
        <p className="shrink-0 whitespace-nowrap text-sm font-semibold text-slate-950">
          {display.title}
        </p>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getFindingBadgeClasses(input.finding, display.criticality)}`}>
          {positiveSurfaceFinding ? "Positive surface" : display.criticality}
        </span>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getPresentationStatusBadgeClasses(input.finding.presentationDecision.status)}`}>
          {input.finding.presentationDecision.status === "surface"
            ? "Surface"
            : input.finding.presentationDecision.status === "audit_only"
              ? "Audit only"
              : "Suppressed"}
        </span>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingLaneBadgeClasses(input.finding.surfacingDecision.reportLane)}`}>
          {getSurfacingLaneLabel(input.finding.surfacingDecision.reportLane)}
        </span>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingDecisionStateBadgeClasses(input.finding.surfacingDecision.decisionState)}`}>
          {getSurfacingDecisionStateLabel(input.finding.surfacingDecision.decisionState)}
        </span>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getVerificationBadgeClasses(input.finding.presentationDecision.verificationState)}`}>
          {input.finding.presentationDecision.verificationLabel}
        </span>
        {collapsedSummary ? (
          <p className="min-w-0 truncate text-xs font-mono text-slate-500">
            <span aria-hidden="true" className="mr-2 text-slate-300">
              •
            </span>
            {collapsedSummary}
          </p>
        ) : null}
      </summary>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.1fr_1.5fr_1.8fr]">
        <div className="min-w-0 space-y-2">
          <div>
            <p className="mt-1 text-sm text-slate-700">
              {observedSummary
                ? observedSummary
                : positiveSurfaceFinding
                  ? "Positive surface detected"
                  : `${display.criticality} reference criticality`}
            </p>
            {pageAttribution ? <p className="mt-1 text-xs text-slate-500">{pageAttribution}</p> : null}
          </div>
          {input.finding.presentation.confidenceScore ? (
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Confidence {input.finding.presentation.confidenceScore}</p>
          ) : null}
          {validationSupport ? <p className="text-xs text-slate-500">{validationSupport}</p> : null}
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Why It Matters</p>
          <p className="text-sm text-slate-700">{input.finding.presentation.whyThisMatters}</p>
        </div>
        <div className="min-w-0 space-y-2">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Review and remediation starting points</p>
            <p className="text-sm text-slate-700">{display.remediation}</p>
          </div>
          {input.finding.presentation.suggestedBestPractice ? (
            <Link
              href={input.finding.presentation.suggestedBestPractice.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700"
            >
              <span>↗</span>
              <span>{input.finding.presentation.suggestedBestPractice.label}</span>
            </Link>
          ) : null}
          <ReviewFindingLinks finding={input.finding} />
        </div>
      </div>
      <details className="group/evidence mt-3 rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
          <ScanReportDisclosureIcon className="group-open/evidence:rotate-90" />
          <span>Evidence</span>
        </summary>
        <div className="mt-2 space-y-2 text-xs text-slate-500">
          <p>{evidenceSummary}</p>
          <p>{confidenceRationale}</p>
          {display.referenceId === "third_party_cookie_pre_consent" ? (
            <p>
              Related requests provide vendor or endpoint context and may not be the artifact that supports the pre-consent timing finding.
            </p>
          ) : null}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Surfacing Decision</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingLaneBadgeClasses(input.finding.surfacingDecision.reportLane)}`}>
                {getSurfacingLaneLabel(input.finding.surfacingDecision.reportLane)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingDecisionStateBadgeClasses(input.finding.surfacingDecision.decisionState)}`}>
                {getSurfacingDecisionStateLabel(input.finding.surfacingDecision.decisionState)}
              </span>
              {input.finding.surfacingDecision.supportTargetId ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                  supports {input.finding.surfacingDecision.supportTargetId}
                </span>
              ) : null}
              {input.finding.surfacingDecision.supports.length > 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                  anchors {input.finding.surfacingDecision.supports.length}
                </span>
              ) : null}
            </div>
            <p>{input.finding.surfacingDecision.decisionReasons[0] ?? "No surfacing rationale retained."}</p>
            <p className="font-mono text-[11px] text-slate-500">
              {input.finding.surfacingDecision.appliedRules.join(", ")}
            </p>
          </div>
          {input.finding.presentationDecision.downgradeReasons.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Why It Was Limited</p>
              <ul className="space-y-1 text-xs text-slate-600">
                {input.finding.presentationDecision.downgradeReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <details className="group/json rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
              <ScanReportDisclosureIcon className="group-open/json:rotate-90" />
              <span>Technical JSON</span>
            </summary>
            <EvidenceJsonBlock
              payload={findingJsonPayload}
              className="relative mt-2 max-w-full overflow-hidden rounded-lg bg-slate-950"
              preClassName="max-w-full overflow-x-auto whitespace-pre-wrap break-words p-3 pr-12 text-[11px] leading-5 text-slate-100"
            />
          </details>
        </div>
      </details>
    </details>
  );
}

function summarizeEvidence(packet: UnifiedFindingDisplayPacket) {
  const reportFacingPageUrl = getReportFacingScannedPageUrl(packet);
  const primaryPageLabel = reportFacingPageUrl ? formatFindingPageLabel(reportFacingPageUrl) : null;
  const parts = [
    primaryPageLabel
      ? packet.affectedPageCount > 1
        ? `${packet.affectedPageCount} pages including ${primaryPageLabel}`
        : `page ${primaryPageLabel}`
      : packet.affectedPageCount > 0
        ? `${packet.affectedPageCount} page${packet.affectedPageCount === 1 ? "" : "s"}`
        : null,
    packet.confidenceInputs.signalCount > 0 ? `${packet.confidenceInputs.signalCount} signal${packet.confidenceInputs.signalCount === 1 ? "" : "s"}` : null,
    packet.confidenceInputs.validationCount > 0
      ? `${packet.confidenceInputs.validationCount} validation row${packet.confidenceInputs.validationCount === 1 ? "" : "s"}`
      : null,
    packet.confidenceInputs.issueCount > 0 ? `${packet.confidenceInputs.issueCount} synthesized issue${packet.confidenceInputs.issueCount === 1 ? "" : "s"}` : null
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" · ") : "Evidence packet assembled for this finding.";
}

export function deriveAgencyAdvisoryThemes(findings: UnifiedFindingDisplayPacket[]) {
  const themes = new Set<string>();

  for (const finding of findings) {
    switch (finding.details?.family) {
      case "consent_tracking":
        themes.add("consent and tracking controls");
        break;
      case "contradiction":
        themes.add("public claims versus observed behavior");
        break;
      case "rights_gap":
      case "policy_extraction":
      case "coverage_gap":
        themes.add("policy and disclosure coverage");
        break;
      case "accessibility":
        themes.add("accessibility and task completion");
        break;
      case "commercial":
        themes.add("commercial transparency and pressure tactics");
        break;
      case "sensitive_data":
        themes.add("sensitive-data handling");
        break;
      case "financial_promotion":
        themes.add("financial promotions and disclosure risk");
        break;
      case "context":
        themes.add("high-risk market context");
        break;
      default:
        break;
    }
  }

  return [...themes];
}

export function deriveExecutiveSummaryThemeNarrative(themes: string[]) {
  if (themes.length === 0) {
    return "The surfaced findings do not yet point to one dominant risk pattern.";
  }

  if (themes.length === 1) {
    return `The strongest pattern in this scan involves ${themes[0]}.`;
  }

  if (themes.length === 2) {
    return `The strongest patterns in this scan involve ${themes[0]} and ${themes[1]}.`;
  }

  return `The strongest patterns in this scan involve ${themes[0]}, ${themes[1]}, and ${themes[2]}.`;
}

function deriveThemeCounts(findings: UnifiedFindingDisplayPacket[]) {
  const counts = new Map<string, { count: number; highCount: number; mediumCount: number; lowCount: number }>();

  for (const finding of findings) {
    let theme: string | null = null;

    switch (finding.details?.family) {
      case "consent_tracking":
        theme = "Consent & tracking";
        break;
      case "contradiction":
        theme = "Claims vs behavior";
        break;
      case "rights_gap":
      case "policy_extraction":
      case "coverage_gap":
        theme = "Policy & disclosure";
        break;
      case "accessibility":
        theme = "Accessibility";
        break;
      case "commercial":
        theme = "Commercial practices";
        break;
      case "sensitive_data":
        theme = "Sensitive-data handling";
        break;
      case "financial_promotion":
        theme = "Financial promotions";
        break;
      case "context":
        theme = "High-risk context";
        break;
      default:
        theme = null;
        break;
    }

    if (theme) {
      const current = counts.get(theme) ?? { count: 0, highCount: 0, mediumCount: 0, lowCount: 0 };
      counts.set(theme, {
        count: current.count + 1,
        highCount: current.highCount + (finding.severity === "high" ? 1 : 0),
        mediumCount: current.mediumCount + (finding.severity === "medium" ? 1 : 0),
        lowCount: current.lowCount + (finding.severity === "low" ? 1 : 0)
      });
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([label, value]) => ({ ...value, label }));
}

function formatVendorGroupLabel(key: string) {
  switch (key) {
    case "analytics":
      return "Analytics";
    case "advertising":
      return "Advertising";
    case "social":
      return "Social";
    case "session_replay":
      return "Session replay";
    case "tag_manager":
      return "Tag manager";
    case "cmp":
      return "Consent management";
    case "accessibility_widget":
      return "Accessibility widget";
    case "payment":
      return "Payment";
    case "chat_support":
      return "Chat support";
    case "marketing":
      return "Marketing";
    case "fingerprinting":
      return "Fingerprinting";
    case "hosting":
      return "Hosting";
    default:
      return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function deriveVendorContext(input: {
  scanRecord: ScanRecordData;
  snapshot: Record<string, unknown>;
}) {
  const vendorGroups = new Map<string, Set<string>>();

  const pushVendor = (groupKey: string, vendorName: string | null | undefined) => {
    if (!vendorName || vendorName.trim().length === 0) {
      return;
    }

    const normalizedName = vendorName.trim();
    const current = vendorGroups.get(groupKey) ?? new Set<string>();
    current.add(normalizedName);
    vendorGroups.set(groupKey, current);
  };

  for (const tracker of input.scanRecord.trackerVendors) {
    pushVendor(tracker.vendorCategory || "other", tracker.vendorName);
  }

  pushVendor("cmp", typeof input.snapshot.cmp_vendor_name === "string" ? input.snapshot.cmp_vendor_name : null);

  return [...vendorGroups.entries()]
    .map(([key, items]) => ({
      key,
      label: formatVendorGroupLabel(key),
      vendors: [...items].sort((left, right) => left.localeCompare(right))
    }))
    .filter((group) => group.vendors.length > 0)
    .sort((left, right) => left.label.localeCompare(right.label));
}

function deriveSectionScore(findings: UnifiedFindingDisplayPacket[]) {
  if (findings.length === 0) {
    return 5;
  }

  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;
  const lowCount = findings.filter((finding) => finding.severity === "low").length;
  const penalty = Math.min(5, highCount * 1.15 + mediumCount * 0.55 + lowCount * 0.2);
  const score = Math.max(0, 5 - penalty);

  return Math.round(score * 10) / 10;
}

function formatSectionScore(value: number) {
  return `${value.toFixed(1)}/5`;
}

type UnverifiedHomepageReview = {
  blockerLabel?: string | null;
  coverageLabel: string;
  guidance: string[];
  message: string;
  outcomeTitle: string;
  verifiedPolicyInsights: Array<{
    flags: string[];
    pageLabel: string;
    pageUrl: string | null;
    summary: string | null;
    topics: string[];
  }>;
  verifiedSurfaces: string[];
  recommendationTitle: string;
  reason: string;
  title: string;
  whatThisMeans: string[];
};

type ExecutiveAccessLimitationNotice = {
  finding: CertScoreFinding;
  review: UnverifiedHomepageReview;
  summary: string;
};

export function buildPreviewExecutiveAccessLimitationNotice(input: {
  resultState: {
    code?: string;
    coverageLevel?: string;
    message: string;
    title: string;
  };
  review: UnverifiedHomepageReview | null;
}): ExecutiveAccessLimitationNotice {
  const coverageLabel =
    input.review?.coverageLabel ??
    (input.resultState.coverageLevel === "limited_partial" ? "Partial public verification available" : "No public verification available");
  const review: UnverifiedHomepageReview =
    input.review ??
    {
      coverageLabel,
      guidance: [
        "Retry from a normal browsing session or allow scanner access to the public homepage before relying on privacy findings.",
        "Treat this result as an access limitation, not a substantive privacy or consent review."
      ],
      message: input.resultState.message,
      outcomeTitle: input.resultState.title,
      recommendationTitle: "Protected-Site Workflow Recommended",
      reason: "Reason: preview scores were withheld because the live pass did not verify a trustworthy public site surface.",
      title: input.resultState.title,
      verifiedPolicyInsights: [],
      verifiedSurfaces: [],
      whatThisMeans: [
        "This scan does not support reliable privacy or consent conclusions.",
        "Apparent runtime signals from this limited pass should be treated as non-actionable until a normal public page can be verified."
      ]
    };

  return {
    summary: "Preview scores were withheld because the live pass did not verify a trustworthy public site surface.",
    review,
    finding: {
      id: "access_limited_no_reliable_findings",
      label: "Public site access was limited",
      section: "Runtime & Diagnostics",
      defaultSurfacePriority: 110,
      whyItMatters:
        "When the scanner cannot verify a usable public page, any apparent runtime privacy signals are too thin to treat as trustworthy findings.",
      remediation:
        "Retry from a normal browsing environment or allow scanner access to the public homepage and core legal pages before relying on privacy findings.",
      confidence: "strong",
      directVsInferred: "direct",
      evidencePreview: [review.message, review.reason],
      evidenceRefs: [],
      severity: "medium",
      shortSummary: input.resultState.message
    }
  };
}

type ScanEventSummaryRecord = {
  eventType: string;
  message: string;
  metadataJson: unknown;
};

function getRecordString(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getNestedRecord(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function deriveProtectedSiteRecommendation(snapshot: Record<string, unknown>, scanEvents: ScanEventSummaryRecord[]) {
  const limitationEvent = [...scanEvents].reverse().find((event) => event.eventType === "access.limitations_detected");
  const limitationMetadata = limitationEvent?.metadataJson ?? null;
  const challengeHeaders = getNestedRecord(limitationMetadata, "challengeHeaders");
  const challengeServer = getRecordString(challengeHeaders, "server");
  const challengeMitigation = getRecordString(challengeHeaders, "cfMitigated");
  const botChallengeDetected = getRecordBoolean(limitationMetadata, "botChallengeDetected");
  const homepageFetchStatus =
    typeof snapshot.homepage_fetch_status === "string" ? snapshot.homepage_fetch_status.toLowerCase() : null;
  const homepageFetchHttpStatus = getRecordNumber(snapshot, "homepage_fetch_http_status");

  const likelyProtectedSite =
    botChallengeDetected === true ||
    (typeof challengeServer === "string" && /cloudflare/i.test(challengeServer)) ||
    (typeof challengeMitigation === "string" && /challenge/i.test(challengeMitigation)) ||
    ((homepageFetchStatus === "forbidden" || homepageFetchStatus === "blocked") && homepageFetchHttpStatus === 403);

  if (!likelyProtectedSite) {
    return {
      recommendationTitle: "Recommended next step",
      guidance: [
        "Confirm the site is reachable outside the scanner and rerun only after the underlying access issue is resolved.",
        "Use the diagnostics below to separate robots restrictions, transport failure, and homepage availability issues before drawing conclusions."
      ]
    };
  }

  return {
    recommendationTitle: "Protected-Site Workflow Recommended",
    guidance: [
      "Treat this as a protected-domain result: the site appears to allow robots access but is challenging or blocking automated browsing.",
      "Use a manual or supervised browser review for evidence collection instead of relying on repeated automated reruns from the same scanner path.",
      "If this domain matters operationally, request allowlisting or a supported review path from the site owner before treating automation as authoritative."
    ]
  };
}

function deriveVerifiedPublicSurfaces(snapshot: Record<string, unknown>) {
  const surfaces: string[] = [];

  if (snapshot.privacy_policy_present === true) {
    surfaces.push("Privacy policy");
  }

  if (snapshot.terms_of_service_present === true) {
    surfaces.push("Terms of service");
  }

  if (snapshot.cookie_policy_present === true) {
    surfaces.push("Cookie policy");
  }

  if (snapshot.contact_page_present === true) {
    surfaces.push("Contact page");
  }

  return surfaces;
}

function isEvidenceRichZeroPagePreviewSnapshot(snapshot: Record<string, unknown>) {
  const verifiedSurfaces = deriveVerifiedPublicSurfaces(snapshot);
  const homepageFetchStatus = getRecordString(snapshot, "homepage_fetch_status");
  const homepageFetchHttpStatus = getRecordNumber(snapshot, "homepage_fetch_http_status");
  const totalSignals = getRecordNumber(snapshot, "total_signals");
  const homepageFetchHttpStatusSuccessful =
    homepageFetchHttpStatus === null || (homepageFetchHttpStatus >= 200 && homepageFetchHttpStatus < 400);

  return (
    getRecordNumber(snapshot, "pages_scanned") === 0 &&
    homepageFetchStatus === "ok" &&
    homepageFetchHttpStatusSuccessful &&
    snapshot.blocked_flag !== true &&
    snapshot.captcha_flag !== true &&
    snapshot.auth_wall_detected !== true &&
    snapshot.auth_wall_suspected !== true &&
    snapshot.challenge_suspected !== true &&
    (
      verifiedSurfaces.length > 0 ||
      (typeof totalSignals === "number" && totalSignals > 0) ||
      snapshot.tracking_before_consent_detected === true ||
      snapshot.preconsent_tracking_detected === true ||
      snapshot.third_party_cookie_set_before_consent === true
    )
  );
}

function humanizePolicyTopic(topic: string) {
  return topic
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizePolicyFlag(flag: string) {
  return flag
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isReportPolicySurfaceRow(row: Record<string, unknown>) {
  const pageType = String(getPolicyPageType(row) ?? "");
  if (pageType !== "privacy_policy" && pageType !== "terms_of_service" && pageType !== "cookie_policy") {
    return false;
  }
  return !(pageType === "cookie_policy" && isGenericBrowserCookieHelpUrl(getPolicyPageUrl(row)));
}

function isExecutivePolicySurfaceRow(row: Record<string, unknown>) {
  if (!isReportPolicySurfaceRow(row)) {
    return false;
  }

  const pageUrl = getPolicyPageUrl(row);
  if (!pageUrl) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const pageType = String(getPolicyPageType(row) ?? "");
  if (pageType === "privacy_policy") {
    const normalized = `${parsed.hostname} ${parsed.pathname} ${parsed.search}`.toLowerCase();
    if (/\bchatgpt\.com\b/i.test(parsed.hostname)) {
      return false;
    }
    if (/(^|\/)(?:gdpr|ftc|accessibility|guides?|compare|benchmarks?|findings?|methodology|what-is-certscore|api-pulse)(?:\/|$)/i.test(parsed.pathname)) {
      return false;
    }
    return /privacy|data-protection|data_protection|rights?|request|dsar|subject-access|do-not-sell|opt-out|preferences?|cookie/i.test(normalized);
  }

  return true;
}

function deriveVerifiedPolicyInsights(policyEnrichments: Array<Record<string, unknown>>) {
  return policyEnrichments
    .filter(isReportPolicySurfaceRow)
    .map((row) => {
      const pageType = String(getPolicyPageType(row) ?? "");
      const pageUrl = getPolicyPageUrl(row);
      const summary = getPolicySummaryText(row);
      const policyMentions = getPolicyMentions(row);
      const policyFlags = getPolicyActionableFlags(row);
      const topics = Array.isArray(policyMentions)
        ? policyMentions
            .map((item) =>
              item && typeof item === "object" && typeof (item as Record<string, unknown>).topic === "string"
                ? humanizePolicyTopic(String((item as Record<string, unknown>).topic))
                : null
            )
            .filter((value): value is string => Boolean(value))
            .slice(0, 4)
        : [];
      const flags = Array.isArray(policyFlags)
        ? policyFlags
            .filter((value): value is string => typeof value === "string" && value !== "blocked_homepage_direct_policy_page")
            .map((value) => humanizePolicyFlag(value))
            .slice(0, 3)
        : [];

      return {
        flags,
        pageLabel:
          pageType === "privacy_policy"
            ? "Privacy policy"
            : pageType === "terms_of_service"
              ? "Terms of service"
              : "Cookie policy",
        pageUrl,
        summary,
        topics
      };
    })
    .filter((item) => item.summary || item.topics.length > 0 || item.flags.length > 0);
}

function getSnapshotPolicySurfaceLabel(pageType: "privacy_policy" | "terms_of_service" | "cookie_policy") {
  switch (pageType) {
    case "privacy_policy":
      return "Privacy policy";
    case "terms_of_service":
      return "Terms of service";
    case "cookie_policy":
      return "Cookie policy";
  }
}

function titleCasePolicyPathSegment(value: string) {
  const normalized = value
    .replace(/\.(?:html?|php|aspx?)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^modern slavery act$/i.test(normalized) || /^modern slavery statement$/i.test(normalized)) {
    return "Modern Slavery Statement";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function deriveSpecificPolicySurfaceLabel(surface: ExecutivePolicySurface) {
  if (!surface.pageUrl) {
    return surface.pageLabel;
  }

  try {
    const parsed = new URL(surface.pageUrl);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const candidate = [...pathSegments].reverse()
      .map(titleCasePolicyPathSegment)
      .find((segment) => /privacy|cookie|terms|conditions|notice|rights|overview|modern slavery/i.test(segment));

    return candidate && candidate.length > 3 ? candidate : surface.pageLabel;
  } catch {
    return surface.pageLabel;
  }
}

function disambiguatePolicySurfaceLabels(surfaces: ExecutivePolicySurface[]) {
  const labelCounts = new Map<string, number>();
  for (const surface of surfaces) {
    labelCounts.set(surface.pageLabel, (labelCounts.get(surface.pageLabel) ?? 0) + 1);
  }

  const surfacesWithSpecificLabels = surfaces.map((surface) => {
    if ((labelCounts.get(surface.pageLabel) ?? 0) <= 1) {
      return surface;
    }

    const pageLabel = deriveSpecificPolicySurfaceLabel(surface);
    return pageLabel === surface.pageLabel ? surface : { ...surface, pageLabel };
  });

  const specificLabelCounts = new Map<string, number>();
  for (const surface of surfacesWithSpecificLabels) {
    specificLabelCounts.set(surface.pageLabel, (specificLabelCounts.get(surface.pageLabel) ?? 0) + 1);
  }

  const seenSpecificLabels = new Map<string, number>();
  return surfacesWithSpecificLabels.map((surface) => {
    if ((specificLabelCounts.get(surface.pageLabel) ?? 0) <= 1) {
      return surface;
    }

    const nextIndex = (seenSpecificLabels.get(surface.pageLabel) ?? 0) + 1;
    seenSpecificLabels.set(surface.pageLabel, nextIndex);
    return {
      ...surface,
      pageLabel: `${surface.pageLabel} ${nextIndex}`
    };
  });
}

function getRuntimeKeyPageDiscoverySummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getRecord(runtimeArtifacts?.key_page_discovery_summary) ?? getRecord(runtimeArtifacts?.keyPageDiscoverySummary);
}

function getVerifiedKeyPageSurface(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
  pageType: "privacy_policy" | "terms_of_service" | "cookie_policy"
) {
  const summary = getRuntimeKeyPageDiscoverySummary(runtimeArtifacts);
  const pageSummaries = [
    ...getRecordObjectArray(summary, "pageSummaries"),
    ...getRecordObjectArray(summary, "page_summaries")
  ];
  return pageSummaries.find((row) => {
    const rowPageType = getRecordString(row, "pageType") ?? getRecordString(row, "page_type");
    if (rowPageType !== pageType) {
      return false;
    }
    const surfaceState = getRecordString(row, "surfaceState") ?? getRecordString(row, "surface_state");
    const surfaceDetected = getRecordBoolean(row, "surfaceDetected") ?? getRecordBoolean(row, "surface_detected");
    return surfaceDetected === true || surfaceState === "linked_and_verified";
  }) ?? null;
}

function deriveSnapshotPolicySurfaceFallbacks(
  snapshot: Record<string, unknown> | null | undefined,
  existingSurfaces: ExecutivePolicySurface[],
  runtimeArtifacts?: Record<string, unknown> | null
): ExecutivePolicySurface[] {
  if (!snapshot) {
    return [];
  }

  const existingLabels = new Set(existingSurfaces.map((surface) => surface.pageLabel.toLowerCase()));
  const fallbackInputs: Array<{
    pageType: "privacy_policy" | "terms_of_service" | "cookie_policy";
    present: boolean;
  }> = [
    { pageType: "privacy_policy", present: snapshot.privacy_policy_present === true },
    { pageType: "terms_of_service", present: snapshot.terms_of_service_present === true },
    { pageType: "cookie_policy", present: snapshot.cookie_policy_present === true }
  ];

  return fallbackInputs
    .filter((input) => input.present)
    .map((input) => {
      const pageLabel = getSnapshotPolicySurfaceLabel(input.pageType);
      const verifiedSurface = getVerifiedKeyPageSurface(runtimeArtifacts, input.pageType);
      const pageUrl =
        verifiedSurface
          ? getRecordString(verifiedSurface, "successfulUrl") ??
            getRecordString(verifiedSurface, "successful_url") ??
            getRecordString(verifiedSurface, "bestCandidateUrl") ??
            getRecordString(verifiedSurface, "best_candidate_url")
          : null;
      return {
        details: pageUrl
          ? ["Surface presence and URL were retained by the scanner; extracted policy details were not retained for this scan."]
          : ["Surface presence was retained by the scanner, but no extracted policy details were retained for this scan."],
        pageLabel,
        pageUrl
      };
    })
    .filter((surface) => !existingLabels.has(surface.pageLabel.toLowerCase()));
}

function deriveDiscoveredPrivacyPolicySurfaceFallbacks(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
  existingSurfaces: ExecutivePolicySurface[]
): ExecutivePolicySurface[] {
  const summary = getPolicyDisclosureSummary(runtimeArtifacts);
  if (!summary || existingSurfaces.some((surface) => /privacy/i.test(surface.pageLabel))) {
    return [];
  }
  const discovered = getRecordBoolean(summary, "privacyPolicyDiscovered") ??
    getRecordBoolean(summary, "privacy_policy_discovered");
  if (discovered !== true) {
    return [];
  }
  const urls = uniqueStrings([
    ...getRecordStringArray(summary, "discoveredPrivacyPolicyUrls"),
    ...getRecordStringArray(summary, "discovered_privacy_policy_urls")
  ]).slice(0, 3);
  const state = getRecordString(summary, "privacyPolicyEvaluationState") ??
    getRecordString(summary, "privacy_policy_evaluation_state");
  const detail = state === "discovered_fetch_failed"
    ? "Privacy-policy link observed; document retrieval failed, so its contents were not evaluated."
    : state === "discovered_skipped_budget"
      ? "Privacy-policy link observed; document retrieval did not finish within the scan budget, so its contents were not evaluated."
      : "Privacy-policy link observed; document contents were not evaluated from retained evidence.";
  return urls.map((pageUrl) => ({
    details: [detail],
    pageLabel: "Privacy policy link",
    pageUrl
  }));
}

const EXECUTIVE_RETENTION_HEADING_PATTERN =
  /\b(?:how long (?:we )?(?:keep|retain)|retention(?: period)?|data retention|storage period|retaining your information)\b/i;
const EXECUTIVE_RETENTION_LIFECYCLE_PATTERN =
  /\b(?:how long (?:we )?(?:keep|retain)|retention periods?|storage period|stored for|kept for|kept until|retained for|retained until|retain(?:ed|ing)? .{0,120}(?:as long as necessary|no longer than necessary|required by law|legal obligations?|legal disputes?|for \d+|for (?:one|two|three|four|five|six|seven|eight|nine|ten) (?:days?|weeks?|months?|years?)|until)|until you unsubscribe|deleted|removed|erased|anonymiz(?:ed|e|ation)|no longer than necessary|cctv recordings? (?:are )?kept)\b/i;
const EXECUTIVE_SECURITY_ONLY_POLICY_PATTERN =
  /\b(?:how we keep your personal information safe|protect your personal information|security|safeguards?|encryption|confidential|unauthori[sz]ed access|loss|destruction)\b/i;

function normalizePolicySurfaceUrlForCompare(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase() || null;
  }
}

function isSecurityOnlyPolicySnippet(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return EXECUTIVE_SECURITY_ONLY_POLICY_PATTERN.test(value) &&
    !EXECUTIVE_RETENTION_HEADING_PATTERN.test(value) &&
    !EXECUTIVE_RETENTION_LIFECYCLE_PATTERN.test(value);
}

function getPolicyDisclosureSummary(runtimeArtifacts?: Record<string, unknown> | null) {
  return getNestedRecord(runtimeArtifacts, "policyDisclosureSummary") ??
    getNestedRecord(runtimeArtifacts, "policy_disclosure_summary");
}

function formatRetainedPolicySectionSummary(section: Record<string, unknown>) {
  const heading = getRecordString(section, "heading");
  const textExcerpt = getRecordString(section, "textExcerpt") ?? getRecordString(section, "text_excerpt");
  if (!heading) {
    return textExcerpt;
  }
  if (!textExcerpt) {
    return heading;
  }
  return textExcerpt.toLowerCase().startsWith(heading.toLowerCase())
    ? textExcerpt
    : `${heading}. ${textExcerpt}`;
}

function selectExecutiveRetainedPolicySectionSummary(input: {
  pageType: string;
  pageUrl: string | null;
  runtimeArtifacts?: Record<string, unknown> | null;
  summary: string | null;
}) {
  if (!isSecurityOnlyPolicySnippet(input.summary)) {
    return input.summary;
  }

  const policyDisclosureSummary = getPolicyDisclosureSummary(input.runtimeArtifacts);
  const retainedSections = [
    ...getRecordObjectArray(policyDisclosureSummary, "retainedPolicySections"),
    ...getRecordObjectArray(policyDisclosureSummary, "retained_policy_sections")
  ];
  const normalizedPageUrl = normalizePolicySurfaceUrlForCompare(input.pageUrl);
  const matchingSections = retainedSections.filter((section) => {
    const sourceUrl =
      getRecordString(section, "sourceUrl") ??
      getRecordString(section, "source_url") ??
      getRecordString(section, "url");
    const normalizedSourceUrl = normalizePolicySurfaceUrlForCompare(sourceUrl);
    return !normalizedPageUrl || !normalizedSourceUrl || normalizedPageUrl === normalizedSourceUrl;
  });
  const retentionSections = matchingSections.filter((section) => {
    const text = `${getRecordString(section, "heading") ?? ""} ${getRecordString(section, "textExcerpt") ?? getRecordString(section, "text_excerpt") ?? ""}`;
    return (
      EXECUTIVE_RETENTION_HEADING_PATTERN.test(text) ||
      EXECUTIVE_RETENTION_LIFECYCLE_PATTERN.test(text)
    ) && !isSecurityOnlyPolicySnippet(text);
  });
  if (retentionSections.length === 0) {
    return input.summary;
  }

  const cookieSpecific = retentionSections.find((section) =>
    /cookie/i.test(`${getRecordString(section, "heading") ?? ""} ${getRecordString(section, "textExcerpt") ?? getRecordString(section, "text_excerpt") ?? ""}`)
  );
  const generalRetention = retentionSections.find((section) =>
    !/cookie/i.test(`${getRecordString(section, "heading") ?? ""} ${getRecordString(section, "textExcerpt") ?? getRecordString(section, "text_excerpt") ?? ""}`)
  );
  const selectedSection = input.pageType === "cookie_policy"
    ? cookieSpecific ?? retentionSections[0]
    : generalRetention ?? retentionSections[0];
  if (!selectedSection) {
    return input.summary;
  }

  return formatRetainedPolicySectionSummary(selectedSection) ?? input.summary;
}

export function deriveExecutivePolicySurfaces(
  policyEnrichments: Array<Record<string, unknown>>,
  snapshot?: Record<string, unknown> | null,
  runtimeArtifacts?: Record<string, unknown> | null
): ExecutivePolicySurface[] {
  const enrichedSurfaces = policyEnrichments
    .filter(isExecutivePolicySurfaceRow)
    .map((row) => {
      const pageType = String(getPolicyPageType(row) ?? "");
      const pageUrl = getPolicyPageUrl(row);
      const summary = selectExecutiveRetainedPolicySectionSummary({
        pageType,
        pageUrl,
        runtimeArtifacts,
        summary: getPolicySummaryText(row)
      });
      const policyMentions = getPolicyMentions(row);
      const policyFlags = getPolicyActionableFlags(row);
      const topics = Array.isArray(policyMentions)
        ? policyMentions
            .map((item) =>
              item && typeof item === "object" && typeof (item as Record<string, unknown>).topic === "string"
                ? humanizePolicyTopic(String((item as Record<string, unknown>).topic))
                : null
            )
            .filter((value): value is string => Boolean(value))
            .slice(0, 4)
        : [];
      const flags = Array.isArray(policyFlags)
        ? policyFlags
            .filter((value): value is string => typeof value === "string" && value !== "blocked_homepage_direct_policy_page")
            .map((value) => humanizePolicyFlag(value))
            .slice(0, 3)
        : [];
      const details = [
        summary,
        topics.length > 0 ? `Topics: ${topics.join(", ")}` : null,
        flags.length > 0 ? `Flags: ${flags.join(", ")}` : null
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

      return {
        details,
        pageLabel:
          pageType === "privacy_policy"
            ? "Privacy policy"
            : pageType === "terms_of_service"
              ? "Terms of service"
              : "Cookie policy",
        pageUrl
      };
    })
    .filter((surface) => surface.pageUrl || surface.details.length > 0);
  const combinedSurfaces = [
    ...enrichedSurfaces,
    ...deriveSnapshotPolicySurfaceFallbacks(snapshot, enrichedSurfaces, runtimeArtifacts),
    ...deriveDiscoveredPrivacyPolicySurfaceFallbacks(runtimeArtifacts, enrichedSurfaces)
  ];
  const siteDomain = snapshot
    ? getRecordString(snapshot, "registered_domain") ?? getRecordString(snapshot, "domain")
    : null;
  return disambiguatePolicySurfaceLabels(prioritizePublicPolicySurfaces(
    combinedSurfaces.map((surface) => ({ ...surface, type: surface.pageLabel, url: surface.pageUrl })),
    { siteDomain }
  ).map(({ type: _type, url: _url, ...surface }) => surface));
}

function pushUniqueInterruption(
  interruptions: ExecutiveScanInterruption[],
  seen: Set<string>,
  label: string,
  details: Array<string | null | undefined>
) {
  const normalizedDetails = details.filter((detail): detail is string => typeof detail === "string" && detail.trim().length > 0);
  const key = `${label}:${normalizedDetails.join("|")}`;

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  interruptions.push({ label, details: normalizedDetails });
}

function hasMaterialHomepageAccessLimitation(snapshot: Record<string, unknown>) {
  const homepageFetchHttpStatus = getRecordNumber(snapshot, "homepage_fetch_http_status");
  const homepageFetchStatus = getRecordString(snapshot, "homepage_fetch_status");
  const normalizedBodyHash = getRecordString(snapshot, "normalized_body_hash");
  const pagesScanned = getRecordNumber(snapshot, "pages_scanned") ?? 0;
  const verifiedPublicSurfacesCount = getRecordNumber(snapshot, "verified_public_surfaces_count") ?? 0;
  const scanOutcome = getRecordString(snapshot, "scan_outcome");
  const accessPostureClass = getRecordString(snapshot, "access_posture_class");

  return (
    homepageFetchStatus === "forbidden" ||
    homepageFetchStatus === "blocked" ||
    homepageFetchStatus === "error" ||
    homepageFetchStatus === "timeout" ||
    scanOutcome === "transport_failure" ||
    scanOutcome === "timeout_navigation" ||
    scanOutcome === "domain_inactive_or_unstable" ||
    (typeof homepageFetchHttpStatus === "number" && homepageFetchHttpStatus >= 400) ||
    (snapshot.blocked_flag === true && pagesScanned <= 0) ||
    ((snapshot.captcha_flag === true || snapshot.auth_wall_detected === true) &&
      pagesScanned <= 0 &&
      verifiedPublicSurfacesCount <= 0 &&
      !normalizedBodyHash) ||
    accessPostureClass === "early_loss"
  );
}

function deriveExecutiveScanInterruptions(
  snapshot: Record<string, unknown> | null | undefined,
  scanEvents: ScanEventSummaryRecord[] = []
): ExecutiveScanInterruption[] {
  const interruptions: ExecutiveScanInterruption[] = [];
  const seen = new Set<string>();

  if (snapshot) {
    const homepageFetchHttpStatus = getRecordNumber(snapshot, "homepage_fetch_http_status");
    const homepageFetchStatus = getRecordString(snapshot, "homepage_fetch_status");
    const blockVendorGuess = getRecordString(snapshot, "block_vendor_guess");
    const blockPageClassification = getRecordString(snapshot, "block_page_classification");
    const serverHeader = getRecordString(snapshot, "server_header");
    const finalEffectiveUrl = getRecordString(snapshot, "final_effective_url") ?? getRecordString(snapshot, "final_url");
    const stopReasonDetail = getRecordString(snapshot, "stop_reason_detail");
    const stopReasonLabel = getRecordString(snapshot, "stop_reason_label");
    const materialHomepageAccessLimitation = hasMaterialHomepageAccessLimitation(snapshot);
    const stopReason = deriveScanStopReason({
      accessPostureClass: getRecordString(snapshot, "access_posture_class"),
      authWallDetected: snapshot.auth_wall_detected === true,
      blockedFlag: snapshot.blocked_flag === true,
      captchaFlag: snapshot.captcha_flag === true,
      homepageFetchHttpStatus,
      homepageFetchStatus,
      normalizedBodyMissing: !(typeof snapshot.normalized_body_hash === "string" && snapshot.normalized_body_hash.trim().length > 0),
      pagesScanned: getRecordNumber(snapshot, "pages_scanned"),
      robotsAllowed: snapshot.robots_allowed === true ? true : snapshot.robots_allowed === false ? false : null,
      robotsFetchHttpStatus: getRecordNumber(snapshot, "robots_fetch_http_status"),
      robotsFetchStatus: getRecordString(snapshot, "robots_fetch_status"),
      blockPageClassification: blockPageClassification as never,
      blockVendorGuess: blockVendorGuess as never,
      challengeSuspected: snapshot.challenge_suspected === true,
      authWallSuspected: snapshot.auth_wall_suspected === true,
      rateLimitSuspected: snapshot.rate_limit_suspected === true,
      geoBlockSuspected: snapshot.geo_block_suspected === true,
      fingerprintBlockSuspected: snapshot.fingerprint_block_suspected === true
    });

    if (typeof homepageFetchHttpStatus === "number" && homepageFetchHttpStatus >= 400) {
      pushUniqueInterruption(interruptions, seen, `HTTP ${homepageFetchHttpStatus}`, [
        homepageFetchStatus ? `Homepage status: ${homepageFetchStatus}` : null,
        finalEffectiveUrl ? `Final URL: ${finalEffectiveUrl}` : null,
        blockVendorGuess ? `Block vendor: ${blockVendorGuess}` : null,
        blockPageClassification ? `Block page: ${blockPageClassification}` : null,
        serverHeader ? `Server: ${serverHeader}` : null
      ]);
    }

    if (materialHomepageAccessLimitation && (snapshot.captcha_flag === true || snapshot.challenge_suspected === true)) {
      pushUniqueInterruption(interruptions, seen, "Captcha/security challenge", [
        stopReason?.reason,
        blockVendorGuess ? `Block vendor: ${blockVendorGuess}` : null,
        blockPageClassification ? `Block page: ${blockPageClassification}` : null
      ]);
    }

    if (snapshot.rate_limit_suspected === true || homepageFetchHttpStatus === 429) {
      pushUniqueInterruption(interruptions, seen, "Rate limit suspected", [
        homepageFetchHttpStatus === 429 ? "Homepage returned HTTP 429." : null,
        stopReason?.reason
      ]);
    }

    if (materialHomepageAccessLimitation && (snapshot.auth_wall_detected === true || snapshot.auth_wall_suspected === true)) {
      pushUniqueInterruption(interruptions, seen, "Authentication wall", [stopReason?.reason, stopReasonDetail]);
    }

    if (materialHomepageAccessLimitation && snapshot.blocked_flag === true && homepageFetchHttpStatus !== 429) {
      pushUniqueInterruption(interruptions, seen, stopReason?.outcomeTitle ?? "Blocked by site protection", [
        stopReason?.reason,
        stopReasonLabel,
        stopReasonDetail
      ]);
    }

    if (
      !materialHomepageAccessLimitation &&
      (snapshot.challenge_suspected === true ||
        snapshot.auth_wall_suspected === true ||
        snapshot.auth_wall_detected === true ||
        blockPageClassification === "login_wall_probable")
    ) {
      pushUniqueInterruption(interruptions, seen, "Protected route encountered", [
        "Some protected routes were encountered outside the public homepage.",
        "Homepage findings are based on observable public-page evidence.",
        finalEffectiveUrl ? `Homepage URL: ${finalEffectiveUrl}` : null
      ]);
    }
  }

  for (const event of scanEvents) {
    if (event.eventType !== "access.limitations_detected") {
      continue;
    }

    const metadata = event.metadataJson;
    const challengeHeaders = getNestedRecord(metadata, "challengeHeaders");
    pushUniqueInterruption(interruptions, seen, "Access limitation event", [
      event.message,
      getRecordBoolean(metadata, "botChallengeDetected") === true ? "Bot challenge detected." : null,
      getRecordString(challengeHeaders, "server") ? `Server: ${getRecordString(challengeHeaders, "server")}` : null,
      getRecordString(challengeHeaders, "cfMitigated") ? `Mitigation: ${getRecordString(challengeHeaders, "cfMitigated")}` : null
    ]);
  }

  return interruptions.slice(0, 6);
}

function deriveLoggedNoResultsReason(scanEvents: ScanEventSummaryRecord[]) {
  const shortCircuitEvent = [...scanEvents].reverse().find((event) => event.eventType === "runtime.build_phase_diagnostic" && (
    getRecordString(event.metadataJson, "phase") === "scan_short_circuit" ||
    getRecordString(event.metadataJson, "stepKey") === "scan_short_circuit"
  ));

  if (shortCircuitEvent) {
    const metadata = shortCircuitEvent.metadataJson;
    const reason = getRecordString(metadata, "reason");
    const homepageFetchHttpStatus =
      metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof (metadata as Record<string, unknown>).homepageFetchHttpStatus === "number"
        ? Number((metadata as Record<string, unknown>).homepageFetchHttpStatus)
        : null;

    if (reason === "robots_disallowed") {
      return "Reason: robots.txt disallowed scanner access to the homepage.";
    }
    if (reason === "homepage_blocked") {
      return homepageFetchHttpStatus
        ? `Reason: homepage request was blocked with HTTP ${homepageFetchHttpStatus}.`
        : "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.";
    }
    if (reason === "homepage_timeout") {
      return "Reason: homepage navigation timed out before the scanner could verify a usable page surface.";
    }
    if (reason === "homepage_not_found") {
      return homepageFetchHttpStatus
        ? `Reason: homepage returned HTTP ${homepageFetchHttpStatus} Not Found.`
        : "Reason: homepage returned a not-found response.";
    }
    if (reason === "homepage_unreachable") {
      return "Reason: homepage could not be reached reliably because of a connection, DNS, TLS, or other transport failure.";
    }
  }

  const browserDiagnostic = [...scanEvents].reverse().find((event) => event.eventType === "runtime.browser_pass_diagnostic");
  const browserError =
    getRecordString(browserDiagnostic?.metadataJson, "error") ??
    getRecordString(browserDiagnostic?.metadataJson, "navigationError") ??
    browserDiagnostic?.message ??
    null;

  if (browserError) {
    if (/err_name_not_resolved|dns|name not resolved/i.test(browserError)) {
      return "Reason: homepage could not be reached because the domain failed DNS resolution.";
    }
    if (/ssl|tls|certificate|protocol/i.test(browserError)) {
      return "Reason: homepage could not be reached because the connection failed during TLS or SSL setup.";
    }
    if (/timeout|timed out/i.test(browserError)) {
      return "Reason: homepage navigation timed out before the scanner could verify a usable page surface.";
    }
    if (/403|forbidden|access denied|blocked/i.test(browserError)) {
      return "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.";
    }
  }

  return null;
}

function deriveUnverifiedHomepageReason(snapshot: Record<string, unknown>, scanEvents: ScanEventSummaryRecord[] = []) {
  const canonicalStopReasonDetail =
    typeof snapshot.stop_reason_detail === "string" && snapshot.stop_reason_detail.trim().length > 0
      ? snapshot.stop_reason_detail.trim()
      : null;
  if (canonicalStopReasonDetail) {
    return `Reason: ${canonicalStopReasonDetail}`;
  }

  const loggedReason = deriveLoggedNoResultsReason(scanEvents);
  if (loggedReason) {
    return loggedReason;
  }

  return (
    deriveScanStopReason({
      accessPostureClass: typeof snapshot.access_posture_class === "string" ? snapshot.access_posture_class : null,
      authWallDetected: snapshot.auth_wall_detected === true,
      blockedFlag: snapshot.blocked_flag === true,
      captchaFlag: snapshot.captcha_flag === true,
      homepageFetchHttpStatus:
        typeof snapshot.homepage_fetch_http_status === "number" ? snapshot.homepage_fetch_http_status : null,
      homepageFetchStatus: typeof snapshot.homepage_fetch_status === "string" ? snapshot.homepage_fetch_status : null,
      normalizedBodyMissing:
        !(typeof snapshot.normalized_body_hash === "string" && snapshot.normalized_body_hash.trim().length > 0),
      pagesScanned: typeof snapshot.pages_scanned === "number" ? snapshot.pages_scanned : null,
      robotsAllowed: snapshot.robots_allowed === true ? true : snapshot.robots_allowed === false ? false : null,
      robotsFetchHttpStatus: typeof snapshot.robots_fetch_http_status === "number" ? snapshot.robots_fetch_http_status : null,
      robotsFetchStatus: typeof snapshot.robots_fetch_status === "string" ? snapshot.robots_fetch_status : null
    })?.reason ?? "Reason: the scanner could not verify a usable homepage surface."
  );
}

export function deriveUnverifiedHomepageReview(
  snapshot: Record<string, unknown>,
  scanEvents: ScanEventSummaryRecord[] = [],
  policyEnrichments: Array<Record<string, unknown>> = []
): UnverifiedHomepageReview | null {
  if (isEvidenceRichZeroPagePreviewSnapshot(snapshot)) {
    return null;
  }

  const reason = deriveUnverifiedHomepageReason(snapshot, scanEvents);
  const recommendation = deriveProtectedSiteRecommendation(snapshot, scanEvents);
  const verifiedSurfaces = deriveVerifiedPublicSurfaces(snapshot);
  const verifiedPolicyInsights = deriveVerifiedPolicyInsights(policyEnrichments);
  const stopReason = deriveScanStopReason({
    accessPostureClass: typeof snapshot.access_posture_class === "string" ? snapshot.access_posture_class : null,
    authWallDetected: snapshot.auth_wall_detected === true,
    blockedFlag: snapshot.blocked_flag === true,
    captchaFlag: snapshot.captcha_flag === true,
    homepageFetchHttpStatus: typeof snapshot.homepage_fetch_http_status === "number" ? snapshot.homepage_fetch_http_status : null,
    homepageFetchStatus: typeof snapshot.homepage_fetch_status === "string" ? snapshot.homepage_fetch_status : null,
    normalizedBodyMissing:
      !(typeof snapshot.normalized_body_hash === "string" && snapshot.normalized_body_hash.trim().length > 0),
    pagesScanned: typeof snapshot.pages_scanned === "number" ? snapshot.pages_scanned : null,
    robotsAllowed: snapshot.robots_allowed === true ? true : snapshot.robots_allowed === false ? false : null,
    robotsFetchHttpStatus: typeof snapshot.robots_fetch_http_status === "number" ? snapshot.robots_fetch_http_status : null,
    robotsFetchStatus: typeof snapshot.robots_fetch_status === "string" ? snapshot.robots_fetch_status : null
  });

  if (!stopReason) {
    return null;
  }

  return {
    coverageLabel: verifiedSurfaces.length > 0 ? "Partial public verification available" : "No public verification available",
    guidance: recommendation.guidance,
    reason,
    outcomeTitle: stopReason.outcomeTitle,
    verifiedPolicyInsights,
    verifiedSurfaces,
    recommendationTitle: recommendation.recommendationTitle,
    title: stopReason.reviewTitle,
    message:
      verifiedSurfaces.length > 0
        ? `${stopReason.reviewMessage} Verified public surfaces detected: ${verifiedSurfaces.join(", ")}.`
        : stopReason.reviewMessage,
    whatThisMeans: stopReason.whatThisMeans
  };
}

export function deriveExecutiveSummaryScanCondition(snapshot: Record<string, unknown>) {
  const review = deriveUnverifiedHomepageReview(snapshot);
  if (!review) {
    return null;
  }

  return `${review.message} ${review.reason}`;
}

function deriveBrowserBlockReason(scanEvents: ScanEventSummaryRecord[]) {
  for (const event of scanEvents) {
    if (event.eventType !== "runtime.build_phase_diagnostic") {
      continue;
    }

    const metadata = getRecord(event.metadataJson);
    if (!metadata) {
      continue;
    }

    const phase = getRecordString(metadata, "phase");
    const reason = getRecordString(metadata, "reason");
    const reasonDetail = getRecordString(metadata, "reasonDetail");
    const finalDocumentStatus = getRecordNumber(metadata, "finalDocumentStatus");

    if ((phase === "hybrid_auto_decision" || phase === "hybrid_auto_browser_bypass") && reason === "http_block_status") {
      return reasonDetail ?? (typeof finalDocumentStatus === "number" ? `The live browser pass reached a protected page with HTTP ${finalDocumentStatus}.` : null);
    }

    if (typeof finalDocumentStatus === "number" && finalDocumentStatus >= 400) {
      return reasonDetail ?? `The live browser pass reached a protected page with HTTP ${finalDocumentStatus}.`;
    }
  }

  return null;
}

export function deriveExecutiveAccessLimitationNotice(
  snapshot: Record<string, unknown>,
  scanEvents: ScanEventSummaryRecord[] = [],
  policyEnrichments: Array<Record<string, unknown>> = []
): ExecutiveAccessLimitationNotice | null {
  const review = deriveUnverifiedHomepageReview(snapshot, scanEvents, policyEnrichments);
  const verifiedSurfaceCount =
    typeof snapshot.verified_public_surfaces_count === "number"
      ? snapshot.verified_public_surfaces_count
      : review?.verifiedSurfaces.length ?? 0;
  const browserBlockReason = deriveBrowserBlockReason(scanEvents);
  const verifiedPolicyInsights = review?.verifiedPolicyInsights ?? [];
  const homepageFetchStatus = getRecordString(snapshot, "homepage_fetch_status");
  const homepageReachabilityFailed =
    homepageFetchStatus === "error" ||
    homepageFetchStatus === "timeout" ||
    homepageFetchStatus === "not_found" ||
    getRecordString(snapshot, "scan_outcome") === "transport_failure" ||
    getRecordString(snapshot, "scan_outcome") === "timeout_navigation" ||
    getRecordString(snapshot, "scan_outcome") === "domain_inactive_or_unstable";
  const accessLimitationObserved =
    snapshot.blocked_flag === true ||
    snapshot.auth_wall_detected === true ||
    snapshot.captcha_flag === true ||
    homepageReachabilityFailed ||
    typeof browserBlockReason === "string" ||
    homepageFetchStatus === "forbidden" ||
    homepageFetchStatus === "blocked" ||
    (typeof snapshot.homepage_fetch_http_status === "number" && snapshot.homepage_fetch_http_status >= 400);

  if (!accessLimitationObserved) {
    return null;
  }

  if (verifiedSurfaceCount > 0 || verifiedPolicyInsights.length > 0) {
    return null;
  }

  const effectiveReview: UnverifiedHomepageReview =
    review ??
    {
      coverageLabel: "No public verification available",
      guidance: [
        "Retry from a normal browsing session or allow scanner access to the public homepage before relying on privacy findings.",
        "Treat this result as an access limitation, not a substantive privacy or consent review."
      ],
      message: "The live browser pass hit a protected page before the scan could establish a trustworthy public browsing path.",
      outcomeTitle: "Access limited during live browser verification",
      verifiedPolicyInsights: [],
      verifiedSurfaces: [],
      recommendationTitle: "Protected-Site Workflow Recommended",
      reason: browserBlockReason ? `Reason: ${browserBlockReason}` : "Reason: the live browser pass did not yield a trustworthy public page.",
      title: "Access limited by site protections",
      whatThisMeans: [
        "This scan does not support reliable privacy or consent conclusions.",
        "Any apparent runtime signals from this blocked session should be treated as non-actionable until a normal public page can be verified."
      ]
    };

  return {
    summary:
      "No reliable privacy or consent findings were retained because the live scan could not verify a trustworthy public page.",
    review: effectiveReview,
    finding: {
      id: "access_limited_no_reliable_findings",
      label: "Public site access was limited",
      section: "Runtime & Diagnostics",
      defaultSurfacePriority: 110,
      whyItMatters:
        "When the scanner cannot verify a usable public page, any apparent runtime privacy signals are too thin to treat as trustworthy findings.",
      remediation:
        "Retry from a normal browsing environment or allow scanner access to the public homepage and core legal pages before relying on privacy findings.",
      confidence: "strong",
      directVsInferred: "direct",
      evidencePreview: [browserBlockReason ?? effectiveReview.message, effectiveReview.reason],
      evidenceRefs: [],
      severity: "medium",
      shortSummary:
        "No reliable privacy or consent findings were retained because the live browser pass did not produce a trustworthy public page."
    }
  };
}

function getRuntimeVisualAccessReview(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getRecord(runtimeArtifacts?.visual_access_review) ?? getRecord(runtimeArtifacts?.visualAccessReview);
}

function getRuntimeScanNoGoAssessment(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getRecord(runtimeArtifacts?.scan_no_go_assessment) ?? getRecord(runtimeArtifacts?.scanNoGoAssessment);
}

const VISUAL_ACCESS_NO_GO_CONFIDENCE_THRESHOLD = 0.9;

export function deriveVisualAccessLimitationNotice(
  runtimeArtifacts: Record<string, unknown> | null | undefined
): ExecutiveAccessLimitationNotice | null {
  const scanNoGoAssessment = getRuntimeScanNoGoAssessment(runtimeArtifacts);
  if (!scanNoGoAssessment) {
    return null;
  }
  const decision =
    getRecordString(scanNoGoAssessment, "decision") ?? getRecordString(scanNoGoAssessment, "scan_no_go_decision");
  const scanNoGoConfidence =
    getRecordNumber(scanNoGoAssessment, "scanNoGoConfidence") ??
    getRecordNumber(scanNoGoAssessment, "scan_no_go_confidence");
  if (decision !== "no_go" || scanNoGoConfidence === null || scanNoGoConfidence < VISUAL_ACCESS_NO_GO_CONFIDENCE_THRESHOLD) {
    return null;
  }
  const visualAccessReview = getRuntimeVisualAccessReview(runtimeArtifacts);
  if (!visualAccessReview) {
    return null;
  }

  const goNoGo = getRecordString(visualAccessReview, "goNoGo") ?? getRecordString(visualAccessReview, "go_no_go");
  const status = getRecordString(visualAccessReview, "status");
  const pageState = getRecordString(visualAccessReview, "pageState") ?? getRecordString(visualAccessReview, "page_state");
  const reasonCode = getRecordString(visualAccessReview, "reasonCode") ?? getRecordString(visualAccessReview, "reason_code");
  const isolatedVisualUploadFailure =
    reasonCode === "visual_evidence_upload_failed" &&
    ![
      ...getRecordStringArray(scanNoGoAssessment, "reasonCodes"),
      ...getRecordStringArray(scanNoGoAssessment, "reason_codes")
    ].some((code) => code !== "visual_evidence_upload_failed" && code !== "scan_no_go_corroborated");
  if (isolatedVisualUploadFailure) {
    return null;
  }
  // A GO/degraded_but_useful visual review is retained scan-quality context, not a no-go.
  if (goNoGo !== "NO_GO") {
    return null;
  }
  const evidenceRefs = ["scan_runtime_artifacts.scan_no_go_assessment", "scan_runtime_artifacts.visual_access_review"];
  const scanNoGoReasonCodes = [
    ...getRecordStringArray(scanNoGoAssessment, "reasonCodes"),
    ...getRecordStringArray(scanNoGoAssessment, "reason_codes")
  ];
  const primaryReasonCode = scanNoGoReasonCodes.find((code) => code !== "scan_no_go_corroborated") ?? reasonCode;
  const presentation = resolveScanNoGoPresentation(primaryReasonCode, pageState);
  const retainedExplanation =
    getRecordString(visualAccessReview, "shortExplanation") ??
    getRecordString(visualAccessReview, "short_explanation") ??
    (status === "missing_visual_artifact"
      ? "Initial-load visual evidence was not retained as an available screenshot artifact."
      : "Retained visual review did not verify a normal public page for this scan.");
  const keyVisualEvidence = [
    ...getRecordStringArray(visualAccessReview, "key_visual_evidence"),
    ...getRecordStringArray(visualAccessReview, "keyVisualEvidence")
  ];
  const boundedEvidenceExcerpt = sanitizePublicReportEvidenceText(keyVisualEvidence[0] ?? retainedExplanation)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 360);
  const limitationKindLabel = getScanNoGoLimitationKindLabel(presentation.limitationKind);
  const limitationMeaning = presentation.limitationKind === "scanner_access_limitation"
    ? "This result reflects an access limitation encountered by the scanner, not a conclusion about the site's underlying privacy or consent behavior."
    : presentation.limitationKind === "scanner_capture_limitation"
      ? "This result reflects a scanner capture limitation, so the normal public page could not be verified."
      : "This result reflects the page state displayed by the target URL during the scan.";
  const evidenceMessage = boundedEvidenceExcerpt
    ? `Observed evidence: “${boundedEvidenceExcerpt}”`
    : presentation.explanation;

  return {
    summary: presentation.reportSummary,
    review: {
      blockerLabel: presentation.snapshotStopReasonLabel.replace(/^Homepage\s+/i, ""),
      coverageLabel: limitationKindLabel,
      guidance: [presentation.recommendedNextAction],
      message: evidenceMessage,
      outcomeTitle: presentation.customerTitle,
      verifiedPolicyInsights: [],
      verifiedSurfaces: [],
      recommendationTitle: presentation.retryLikelyToHelp ? "Recommended retry path" : "Recommended next action",
      reason: presentation.explanation,
      title: presentation.customerTitle,
      whatThisMeans: [
        limitationMeaning,
        "CertScore.ai withheld scores and substantive privacy or consent conclusions because the retained page was not representative."
      ]
    },
    finding: {
      id: "scan_quality_visual_no_go",
      label: presentation.customerTitle,
      section: "Runtime & Diagnostics",
      defaultSurfacePriority: 120,
      whyItMatters: presentation.explanation,
      remediation: presentation.recommendedNextAction,
      confidence: "strong",
      directVsInferred: "direct",
      evidencePreview: [
        evidenceMessage,
        limitationKindLabel,
        scanNoGoConfidence !== null ? `Scan no-go confidence: ${scanNoGoConfidence.toFixed(2)}.` : null
      ].filter((value): value is string => Boolean(value)),
      evidenceRefs,
      severity: "medium",
      shortSummary: presentation.reportSummary
    }
  };
}

export function selectExecutiveAccessLimitationNotice(input: {
  allExecutiveFindings: unknown[];
  notice: ExecutiveAccessLimitationNotice | null;
  topExecutiveFindings: unknown[];
}) {
  if (!input.notice) {
    return null;
  }
  if (input.notice.finding.id === "scan_quality_visual_no_go") {
    return input.notice;
  }
  if (input.allExecutiveFindings.length > 0 || input.topExecutiveFindings.length > 0) {
    return null;
  }
  return input.notice;
}

export function shouldShowRegulatoryChecklistSection(input: {
  executiveAccessLimitationNotice: Pick<ExecutiveAccessLimitationNotice, "finding"> | null;
}) {
  return !input.executiveAccessLimitationNotice;
}

function LimitedSurfaceReview(input: { review: UnverifiedHomepageReview }) {
  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5">
      <div className="space-y-1">
        <p className="text-base font-semibold text-amber-950">Executive summary</p>
        <p className="text-sm font-semibold text-amber-950">{input.review.title}</p>
      </div>
      <div className="rounded-xl border border-amber-200/80 bg-white/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">Scan Outcome</p>
        <p className="mt-1 text-sm font-medium text-amber-950">{input.review.outcomeTitle}</p>
      </div>
      <div className="rounded-xl border border-amber-200/80 bg-white/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">Coverage</p>
        <p className="mt-1 text-sm font-medium text-amber-950">{input.review.coverageLabel}</p>
      </div>
      <div className="rounded-xl border border-amber-200/80 bg-white/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">Exact Stop Reason</p>
        <p className="mt-1 text-sm font-medium text-amber-950">{input.review.reason}</p>
      </div>
      <p className="text-sm text-amber-900">{input.review.message}</p>
      {input.review.verifiedSurfaces.length > 0 ? (
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">Verified Public Surfaces</p>
          <ul className="mt-2 space-y-2 text-sm text-emerald-950">
            {input.review.verifiedSurfaces.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {input.review.verifiedPolicyInsights.length > 0 ? (
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Verified Policy Insights</p>
          <div className="mt-3 space-y-3">
            {input.review.verifiedPolicyInsights.map((item) => (
              <div key={`${item.pageLabel}:${item.pageUrl ?? item.summary ?? "policy"}`} className="space-y-1 text-sm text-sky-950">
                <p className="font-medium">
                  {item.pageUrl ? (
                    <Link href={item.pageUrl} className="underline underline-offset-2">
                      {item.pageLabel}
                    </Link>
                  ) : (
                    item.pageLabel
                  )}
                </p>
                {item.summary ? <p>{item.summary}</p> : null}
                {item.topics.length > 0 ? <p>Topics: {item.topics.join(", ")}</p> : null}
                {item.flags.length > 0 ? <p>Flags: {item.flags.join(", ")}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="rounded-xl border border-amber-200/80 bg-white/60 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">What this means</p>
        <ul className="mt-2 space-y-2 text-sm text-amber-950">
          {input.review.whatThisMeans.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-amber-200/80 bg-white/60 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">{input.review.recommendationTitle}</p>
        <ul className="mt-2 space-y-2 text-sm text-amber-950">
          {input.review.guidance.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatExecutionTierLabel(value: string | null | undefined) {
  switch (value) {
    case "tier0_passive":
      return "Tier 0";
    case "tier1_front_door":
      return "Tier 1";
    case "tier2_browser_surface":
      return "Tier 2";
    case "tier3_runtime_observation":
      return "Tier 3";
    case "tier4a_surface_inspection":
      return "Tier 4A";
    case "tier4b_bounded_interaction":
      return "Tier 4B";
    case "tier4c_comparative_interaction":
      return "Tier 4C";
    case "tier5_full_scan":
      return "Tier 5";
    default:
      return null;
  }
}

function formatRecoverableFindingClass(value: string) {
  switch (value) {
    case "access_surface":
      return "Access surface";
    case "privacy_surface":
      return "Privacy surface";
    case "cmp_presence":
      return "CMP presence";
    case "initial_tracking":
      return "Initial tracking";
    case "initial_storage":
      return "Initial storage";
    case "implicit_consent_state":
      return "Implicit consent state";
    case "privacy_choice_surface":
      return "Privacy choice surface";
    case "preferences_ui_exposure":
      return "Preferences UI exposure";
    case "consent_effectiveness":
      return "Consent effectiveness";
    case "policy_runtime_contradiction":
      return "Policy/runtime contradiction";
    default:
      return value;
  }
}

function AccessPostureSummaryCard(input: {
  summary: {
    accessPostureClass: string | null;
    blockVendorGuess?: string | null;
    blockPageClassification?: string | null;
    cmpVendorName?: string | null;
    finalEffectiveUrl?: string | null;
    homepageFetchHttpStatus?: number | null;
    homepageFetchStatus?: string | null;
    highestSuccessfulTier: string | null;
    interruptionLabel: string | null;
    interruptionReason: string | null;
    pagesScanned?: number | null;
    recoverableFindingClasses: string[];
    robotsAllowed?: boolean | null;
    robotsFetchHttpStatus?: number | null;
    serverHeader?: string | null;
    stopTier: string | null;
    stopOutcomeTitle?: string | null;
    stopReason?: string | null;
    stopReviewTitle?: string | null;
    totalSignals?: number | null;
    whatThisMeans?: string[];
    verifiedPublicSurfacesCount?: number | null;
  } | null | undefined;
}) {
  if (!input.summary?.interruptionLabel) {
    return null;
  }

  const formatHomepageEvidence = () => {
    if (typeof input.summary?.homepageFetchHttpStatus === "number") {
      return `HTTP ${input.summary.homepageFetchHttpStatus}`;
    }

    if (typeof input.summary?.homepageFetchStatus === "string" && input.summary.homepageFetchStatus.length > 0) {
      return input.summary.homepageFetchStatus;
    }

    return null;
  };

  const highestSuccessfulTier = formatExecutionTierLabel(input.summary.highestSuccessfulTier);
  const stopTier = formatExecutionTierLabel(input.summary.stopTier);
  const recoverableFindingClasses = input.summary.recoverableFindingClasses
    .filter((value) => typeof value === "string" && value.length > 0)
    .slice(0, 6)
    .map(formatRecoverableFindingClass);
  const robotsPosture =
    input.summary.robotsAllowed === true
      ? typeof input.summary.robotsFetchHttpStatus === "number"
        ? `Allowed (HTTP ${input.summary.robotsFetchHttpStatus})`
        : "Allowed"
      : input.summary.robotsAllowed === false
        ? typeof input.summary.robotsFetchHttpStatus === "number"
          ? `Restricted (HTTP ${input.summary.robotsFetchHttpStatus})`
          : "Restricted"
        : null;
  const evidenceTiles = [
    {
      label: "Homepage",
      value: formatHomepageEvidence()
    },
    {
      label: "Final URL",
      value: input.summary.finalEffectiveUrl
    },
    {
      label: "Server",
      value: input.summary.serverHeader
    },
    {
      label: "Block vendor",
      value: input.summary.blockVendorGuess
    },
    {
      label: "Block page",
      value: input.summary.blockPageClassification
    },
    {
      label: "Robots",
      value: robotsPosture
    },
    {
      label: "Verified surfaces",
      value:
        typeof input.summary.verifiedPublicSurfacesCount === "number" && input.summary.verifiedPublicSurfacesCount > 0
          ? String(input.summary.verifiedPublicSurfacesCount)
          : null
    },
    {
      label: "CMP",
      value: input.summary.cmpVendorName
    },
    {
      label: "Signals retained",
      value:
        typeof input.summary.totalSignals === "number" && input.summary.totalSignals > 0
          ? String(input.summary.totalSignals)
          : null
    },
    {
      label: "Pages scanned",
      value:
        typeof input.summary.pagesScanned === "number" && input.summary.pagesScanned > 0
          ? String(input.summary.pagesScanned)
          : null
    }
  ].filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  const deepestTierReached = highestSuccessfulTier ?? stopTier;
  const notYetVerified = (() => {
    switch (input.summary.stopTier) {
      case "tier1_front_door":
      case "tier0_passive":
        return [
          "No rendered browser surface was verified.",
          "No initial cookies, storage, or tracker activity were captured.",
          "No consent or privacy interaction flow was tested."
        ];
      case "tier2_browser_surface":
        return [
          "No initial runtime cookie or request capture was completed.",
          "No consent-state or tracker timing evidence was confirmed.",
          "No privacy-choice interaction flow was tested."
        ];
      case "tier3_runtime_observation":
        return [
          "No privacy-choice or preferences interaction flow was tested.",
          "No reject-path or consent-effectiveness verification was completed.",
          "No comparative accept vs reject interaction evidence was collected."
        ];
      case "tier4a_surface_inspection":
        return [
          "No bounded consent action was completed.",
          "No reject-path effectiveness was verified.",
          "No comparative interaction burden was measured."
        ];
      case "tier4b_bounded_interaction":
        return [
          "No comparative accept vs reject interaction evidence was collected.",
          "No full Tier 5 public-surface scan was completed."
        ];
      default:
        return [];
    }
  })();

  return (
    <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 px-6 py-5">
      <div className="space-y-1">
        <p className="text-base font-semibold text-sky-950">Access posture</p>
        <p className="text-sm text-sky-900">
          This scan retained some evidence before access limitations cut off deeper tiers.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Deepest tier reached</p>
          <p className="mt-1 text-sm font-medium text-sky-950">{deepestTierReached ?? "Not established"}</p>
        </div>
        <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Status</p>
          <p className="mt-1 text-sm font-medium text-sky-950">{input.summary.interruptionLabel}</p>
        </div>
        {highestSuccessfulTier && highestSuccessfulTier !== deepestTierReached ? (
          <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Highest successful tier</p>
            <p className="mt-1 text-sm font-medium text-sky-950">{highestSuccessfulTier}</p>
          </div>
        ) : null}
        {stopTier && stopTier !== deepestTierReached ? (
          <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Stop tier</p>
            <p className="mt-1 text-sm font-medium text-sky-950">{stopTier}</p>
          </div>
        ) : null}
      </div>
      {evidenceTiles.length > 0 ? (
        <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">What We Uncovered</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {evidenceTiles.map((item) => (
              <div key={item.label} className="rounded-xl border border-sky-200/80 bg-sky-50/60 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">{item.label}</p>
                <p className="mt-1 text-sm font-medium break-all text-sky-950">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {notYetVerified.length > 0 ? (
        <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">What We Could Not Yet Verify</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-900">
            {notYetVerified.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {input.summary.interruptionReason ? (
        <div className="rounded-xl border border-sky-200/80 bg-white/70 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Why The Scan Stopped Here</p>
          <p className="mt-1 text-sm text-sky-950">{input.summary.interruptionReason}</p>
        </div>
      ) : null}
      {recoverableFindingClasses.length > 0 ? (
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">Recoverable coverage</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recoverableFindingClasses.map((item) => (
              <span key={item} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-900">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AgencyAdvisorySummary(input: {
  sectionTiles: Array<{
    className?: string;
    href: string;
    label: string;
    showValueText?: boolean;
    tooltip?: string;
    value: string;
    valueClassName?: string;
  }>;
  findings: UnifiedFindingDisplayPacket[];
  badges: CanonicalTaxonomyReviewProps["executiveSummary"]["badges"];
  metrics: CanonicalTaxonomyReviewProps["executiveSummary"]["metrics"];
  vendorGroups: Array<{
    key: string;
    label: string;
    vendors: string[];
  }>;
  snapshot: Record<string, unknown>;
  statusCallout: CanonicalTaxonomyReviewProps["executiveSummary"]["statusCallout"];
}) {
  const mainNarrativeFindings = input.findings.filter((finding) => isMainNarrativeFinding(finding));
  const highPriorityCount = mainNarrativeFindings.filter((finding) => finding.severity === "high").length;
  const mediumPriorityCount = mainNarrativeFindings.filter((finding) => finding.severity === "medium").length;
  const lowPriorityCount = mainNarrativeFindings.filter((finding) => finding.severity === "low").length;
  const scanConditionSummary = deriveExecutiveSummaryScanCondition(input.snapshot);
  const themes = deriveAgencyAdvisoryThemes(mainNarrativeFindings).slice(0, 3);
  const topThemes = deriveThemeCounts(mainNarrativeFindings);
  const infrastructureItems = deriveInfrastructureContext(input.snapshot);
  const audienceItems = deriveAudienceSensitivityContext(input.snapshot);
  const summaryBullets = [
    scanConditionSummary,
    highPriorityCount > 0
      ? mediumPriorityCount > 0
        ? `This scan surfaced ${highPriorityCount} high and ${mediumPriorityCount} medium-priority finding${highPriorityCount + mediumPriorityCount === 1 ? "" : "s"} that should be reviewed.`
        : `This scan surfaced ${highPriorityCount} high-priority finding${highPriorityCount === 1 ? "" : "s"} that should be reviewed.`
      : mediumPriorityCount > 0
        ? `This scan surfaced ${mediumPriorityCount} medium-priority finding${mediumPriorityCount === 1 ? "" : "s"} that should be reviewed.`
        : "This scan did not surface any high- or medium-priority findings in the main report.",
    lowPriorityCount > 0
      ? `The report also includes ${lowPriorityCount} advisory finding${lowPriorityCount === 1 ? "" : "s"} shown in blue in the detailed findings below.`
      : null,
    deriveExecutiveSummaryThemeNarrative(themes),
    "Some of these patterns can increase regulatory, customer-trust, or platform-enforcement risk if they are not supported by accurate disclosures and user controls."
  ].filter((bullet): bullet is string => Boolean(bullet));

  const maxThemeCount = topThemes.reduce((max, theme) => Math.max(max, theme.count), 0);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-6 py-5">
      <div className="space-y-4">
        <p className="text-base font-semibold text-slate-900">Supporting analysis</p>

        {topThemes.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Finding mix</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <span>High</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span>Medium</span>
                </span>
                {lowPriorityCount > 0 ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                    <span>Advisory</span>
                  </span>
                ) : null}
              </div>
            </div>
            {lowPriorityCount > 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Counts below include {lowPriorityCount} advisory finding{lowPriorityCount === 1 ? "" : "s"} shown in blue.
              </p>
            ) : null}
            <div className="mt-3 space-y-3">
              {topThemes.map((theme) => {
                const width = maxThemeCount > 0 ? (theme.count / maxThemeCount) * 75 : 0;
                const highWidth = theme.count > 0 ? (theme.highCount / theme.count) * 100 : 0;
                const mediumWidth = theme.count > 0 ? (theme.mediumCount / theme.count) * 100 : 0;
                const lowWidth = theme.count > 0 ? (theme.lowCount / theme.count) * 100 : 0;
                return (
                  <div key={theme.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
                      <span>{theme.label}</span>
                      <span className="text-xs text-slate-500">{theme.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="flex h-full" style={{ width: `${width}%` }}>
                        {theme.highCount > 0 ? (
                          <div className="h-full bg-rose-400" style={{ width: `${highWidth}%` }} />
                        ) : null}
                        {theme.mediumCount > 0 ? (
                          <div className="h-full bg-amber-400" style={{ width: `${mediumWidth}%` }} />
                        ) : null}
                        {theme.lowCount > 0 ? (
                          <div className="h-full bg-sky-400" style={{ width: `${lowWidth}%` }} />
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {input.sectionTiles.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Coverage navigation</p>
              <p className="text-xs text-slate-500">Jump into the lower taxonomy matrix if you need section-level review.</p>
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              {input.sectionTiles.map((metric) => (
                <SummaryMetricTile
                  key={metric.label}
                  className={metric.className}
                  href={metric.href}
                  label={metric.label}
                  showValueText={metric.showValueText}
                  tooltip={metric.tooltip}
                  value={metric.value}
                  valueClassName={metric.valueClassName}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
          <ul className="space-y-2 text-sm text-slate-700">
            {summaryBullets.map((bullet) => (
              <li key={bullet}>• {bullet}</li>
            ))}
          </ul>
        </div>

        {(infrastructureItems.length > 0 || audienceItems.length > 0 || input.vendorGroups.length > 0 || input.statusCallout) ? (
          <details className="group/context rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
                <ScanReportDisclosureIcon className="group-open/context:rotate-90" />
                <span>Operational context</span>
              </summary>

              <div className="mt-2 space-y-4">
                <p className="text-xs text-slate-500">
                  Supporting context from the scan: infrastructure, audience sensitivity, observed vendors, and scan-pass conditions that can affect how findings are interpreted.
                </p>

                <div className="grid gap-4 xl:grid-cols-2">
                  {input.vendorGroups.length > 0 ? (
                    <details className="group/context-card rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
                        <ScanReportDisclosureIcon className="group-open/context-card:rotate-90" />
                        <span>Vendors</span>
                      </summary>
                      <div className="mt-3 space-y-3">
                        {input.vendorGroups.map((group) => (
                          <div key={group.key} className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              {group.label}
                            </p>
                            <ul className="space-y-1 text-sm text-slate-700">
                              {group.vendors.map((vendor) => (
                                <li key={`${group.key}-${vendor}`}>• {vendor}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  <details className="group/context-card rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
                      <ScanReportDisclosureIcon className="group-open/context-card:rotate-90" />
                      <span>Infrastructure profile</span>
                    </summary>
                    {infrastructureItems.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        {infrastructureItems.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">No compact infrastructure context was retained for this scan.</p>
                    )}
                  </details>
                  <details className="group/context-card rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden [&::-webkit-details-marker]:hidden">
                      <ScanReportDisclosureIcon className="group-open/context-card:rotate-90" />
                      <span>Audience & sensitive context</span>
                    </summary>
                    {audienceItems.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        {audienceItems.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                  ) : (
                      <p className="mt-3 text-sm text-slate-600">No children’s-privacy or age-gate context was retained for this scan.</p>
                    )}
                  </details>
                </div>

                <ScanPassWarningCallout badges={input.badges} statusCallout={input.statusCallout} />
              </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function ScanPassWarningCallout(input: {
  badges: CanonicalTaxonomyReviewProps["executiveSummary"]["badges"];
  statusCallout: CanonicalTaxonomyReviewProps["executiveSummary"]["statusCallout"];
}) {
  if (!input.statusCallout) {
    return null;
  }

  const toneClasses =
    input.statusCallout.tone === "danger"
      ? "rounded-lg border border-rose-200/80 bg-rose-50/60 px-3 py-2 text-sm text-rose-950"
      : input.statusCallout.tone === "success"
        ? "rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-950"
        : "rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-sm text-amber-950";
  const detailClasses =
    input.statusCallout.tone === "danger"
      ? "mt-2 space-y-1 text-rose-900"
      : input.statusCallout.tone === "success"
        ? "mt-2 space-y-1 text-emerald-900"
        : "mt-2 space-y-1 text-amber-900";

  return (
    <details className={`${toneClasses} group/warning`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] marker:hidden [&::-webkit-details-marker]:hidden">
        <ScanReportDisclosureIcon className="group-open/warning:rotate-90 opacity-70" />
        <span>{input.statusCallout.title}</span>
      </summary>
      <ul className={detailClasses}>
        {input.statusCallout.details.map((detail) => (
          <li key={detail}>• {detail}</li>
        ))}
      </ul>
      {input.badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {input.badges.map((badge) => (
            <div
              key={badge.label}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${
                badge.tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
              }`}
            >
              <span>{badge.label}</span>
              {badge.tooltip ? <InfoTip align="start" text={badge.tooltip} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}

function deriveInfrastructureContext(snapshot: Record<string, unknown>) {
  const items = [
    typeof snapshot.hosting_or_cdn_provider === "string" && snapshot.hosting_or_cdn_provider.trim().length > 0
      ? `Hosting/CDN: ${snapshot.hosting_or_cdn_provider}`
      : null,
    typeof snapshot.cdn_provider === "string" && snapshot.cdn_provider.trim().length > 0
      ? `CDN: ${snapshot.cdn_provider}`
      : null,
    typeof snapshot.tls_version_min_supported === "string" && snapshot.tls_version_min_supported.trim().length > 0
      ? `TLS minimum: ${snapshot.tls_version_min_supported}`
      : null,
    typeof snapshot.certificate_authority === "string" && snapshot.certificate_authority.trim().length > 0
      ? `Certificate authority: ${snapshot.certificate_authority}`
      : null,
    typeof snapshot.domain_age_years === "number"
      ? `Domain age: ${snapshot.domain_age_years.toFixed(1)} year${snapshot.domain_age_years === 1 ? "" : "s"}`
      : null,
    snapshot.domain_privacy_protection_enabled === true
      ? "Domain privacy protection is enabled."
      : snapshot.domain_privacy_protection_enabled === false
        ? "Domain privacy protection is not enabled."
        : null,
    typeof snapshot.country_inferred === "string" && snapshot.country_inferred.trim().length > 0
      ? `Country inferred: ${snapshot.country_inferred}`
      : null,
    typeof snapshot.jurisdiction_guess === "string" && snapshot.jurisdiction_guess.trim().length > 0
      ? `Jurisdiction guess: ${snapshot.jurisdiction_guess}`
      : null
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return items.slice(0, 6);
}

function deriveAudienceSensitivityContext(snapshot: Record<string, unknown>) {
  const items = [
    snapshot.children_audience_likely === true
      ? "The site appears likely to target or attract children or younger audiences."
      : null,
    snapshot.kid_directed_content_detected === true
      ? "Kid-directed content cues were detected in the scanned pages."
      : null,
    snapshot.age_gate_present === true
      ? "An age gate was present in the scanned experience."
      : null,
    snapshot.parental_consent_reference_present === true
      ? "Parental-consent language was detected."
      : null,
    snapshot.mentions_coppa === true
      ? "COPPA-related policy language was detected."
      : null,
    snapshot.mentions_under_13 === true
      ? "Under-13 policy language was detected."
      : null,
    snapshot.mentions_under_16 === true
      ? "Under-16 policy language was detected."
      : null,
    typeof snapshot.children_privacy_risk_score === "number" && snapshot.children_privacy_risk_score > 0
      ? `Children’s privacy risk score: ${snapshot.children_privacy_risk_score}.`
      : null,
    snapshot.form_collects_birthdate === true || snapshot.date_of_birth_input_present === true
      ? "Birthdate or age-related collection cues were present."
      : null
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return items.slice(0, 6);
}

export function deriveFindingEvidenceQualitySummary(findings: UnifiedFindingDisplayPacket[]) {
  return {
    auditOnlyCount: findings.filter((finding) => finding.presentationDecision.status === "audit_only").length,
    blockedCount: findings.filter((finding) => finding.presentationDecision.verificationState === "blocked").length,
    discoveredCount: findings.filter((finding) => finding.presentationDecision.verificationState === "discovered").length,
    runtimeCount: findings.filter((finding) => finding.presentationDecision.verificationState === "runtime").length,
    triageCount: findings.filter((finding) => finding.presentationDecision.verificationState === "triage").length,
    verifiedCount: findings.filter((finding) => finding.presentationDecision.verificationState === "verified").length
  };
}

type FindingEvidenceDiagnosticRow = {
  decisionState: UnifiedFindingDisplayPacket["surfacingDecision"]["decisionState"];
  fetchQuality: string | null;
  findingName: string;
  negativeEvidenceFlags: string[];
  reportLane: UnifiedFindingDisplayPacket["surfacingDecision"]["reportLane"];
  status: UnifiedFindingDisplayPacket["presentationDecision"]["status"];
  verificationLabel: string;
};

export function deriveFindingEvidenceDiagnosticRows(findings: UnifiedFindingDisplayPacket[]): FindingEvidenceDiagnosticRow[] {
  return findings.map((finding) => ({
    decisionState: finding.surfacingDecision.decisionState,
    fetchQuality: finding.evidence?.fetchQuality ?? null,
    findingName: getPublicReportFindingDisplay({
      confidence: finding.confidenceBand,
      findingId: finding.unifiedFindingId,
      label: finding.presentation.findingName,
      remediation: finding.presentation.suggestedFix,
      severity: finding.severity,
      title: finding.title
    }).title,
    negativeEvidenceFlags: finding.concernContext?.negativeEvidenceFlags ?? [],
    reportLane: finding.surfacingDecision.reportLane,
    status: finding.presentationDecision.status,
    verificationLabel: finding.presentationDecision.verificationLabel
  }));
}

function isMainNarrativeFinding(finding: UnifiedFindingDisplayPacket) {
  return isMainNarrativeSurfacing(finding.surfacingDecision);
}

function isConfidenceCoverageFinding(finding: UnifiedFindingDisplayPacket) {
  return isConfidenceCoverageSurfacing(finding.surfacingDecision);
}

function isSupportingContextFinding(finding: UnifiedFindingDisplayPacket) {
  return isSupportingContextSurfacing(finding.surfacingDecision);
}

function FindingsOverview(input: { findings: UnifiedFindingDisplayPacket[] }) {
  const sortedFindings = [...filterContradictoryPositiveSurfaceFindings(input.findings)].sort((left, right) => {
    const severityDelta = getScanFindingSeverityWeight(right.severity) - getScanFindingSeverityWeight(left.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const confidenceWeight = { high: 3, moderate: 2, low: 1 } as const;
    const confidenceDelta = confidenceWeight[right.confidenceBand] - confidenceWeight[left.confidenceBand];
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    return left.presentation.findingName.localeCompare(right.presentation.findingName);
  });
  const positiveSurfaceFindings = sortedFindings.filter((finding) => isPositiveSurfaceFinding(finding));
  const reviewFindings = sortedFindings.filter((finding) => !isPositiveSurfaceFinding(finding));
  const mainFindings = reviewFindings.filter((finding) => isMainNarrativeFinding(finding));
  const confidenceCoverageFindings = reviewFindings.filter((finding) => isConfidenceCoverageFinding(finding));
  const supportingContextFindings = reviewFindings.filter((finding) => isSupportingContextFinding(finding));
  const highPriorityCount = mainFindings.filter((finding) => finding.severity === "high").length;
  const mediumPriorityCount = mainFindings.filter((finding) => finding.severity === "medium").length;
  const lowPriorityCount = mainFindings.filter((finding) => finding.severity === "low").length;
  const hasAnyFindings =
    mainFindings.length > 0 ||
    confidenceCoverageFindings.length > 0 ||
    supportingContextFindings.length > 0 ||
    positiveSurfaceFindings.length > 0;

  if (!hasAnyFindings) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-6 py-5">
      <details className="group/noteworthy" open={true}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <ScanReportDisclosureIcon className="group-open/noteworthy:rotate-90" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-slate-900">Detailed review findings</span>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-rose-800">
                  {highPriorityCount} high
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-amber-800">
                  {mediumPriorityCount} medium
                </span>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-sky-800">
                  {lowPriorityCount} advisory
                </span>
              </span>
              <p className="mt-1 text-sm text-slate-500">
                Expanded finding packets, evidence lanes, and review-oriented detail from the lower taxonomy layer.
                {lowPriorityCount > 0 ? ` This scan also surfaced ${lowPriorityCount} advisory finding${lowPriorityCount === 1 ? "" : "s"} shown in blue.` : ""}
              </p>
            </span>
          </span>
        </summary>

        <div className="mt-4">
          {mainFindings.length > 0 ? (
            <div className="space-y-4">
              {mainFindings.map((finding) => (
                <ReviewFindingCard key={`priority-${finding.unifiedFindingId}`} finding={finding} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm text-slate-600">No main risk findings were promoted for this scan.</p>
            </div>
          )}

          {confidenceCoverageFindings.length > 0 ? (
            <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Confidence & Coverage</p>
                <p className="text-sm text-slate-500">
                  Important uncertainty, discovery, and extraction limitations surfaced by the scan.
                </p>
              </div>
              <div className="space-y-4">
                {confidenceCoverageFindings.map((finding) => (
                  <ReviewFindingCard key={`confidence-${finding.unifiedFindingId}`} finding={finding} />
                ))}
              </div>
            </div>
          ) : null}

          {positiveSurfaceFindings.length > 0 ? (
            <div className="mt-6 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Detected Disclosures & Support Surfaces</p>
                <p className="text-sm text-slate-600">
                  Positive first-party legal, privacy, accessibility, and support surfaces retained by the scan.
                </p>
              </div>
              <div className="space-y-4">
                {positiveSurfaceFindings.map((finding) => (
                  <ReviewFindingCard key={`positive-${finding.unifiedFindingId}`} finding={finding} />
                ))}
              </div>
            </div>
          ) : null}

          {supportingContextFindings.length > 0 ? (
            <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Supporting Context</p>
                <p className="text-sm text-slate-500">
                  Related findings retained as support for stronger lead findings in this report.
                </p>
              </div>
              <div className="space-y-4">
                {supportingContextFindings.map((finding) => (
                  <ReviewFindingCard key={`support-${finding.unifiedFindingId}`} finding={finding} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function FindingEvidenceDiagnostics(input: { findings: UnifiedFindingDisplayPacket[] }) {
  const rows = deriveFindingEvidenceDiagnosticRows(input.findings);

  if (rows.length === 0) {
    return (
      <CollapsibleSectionCard
        title={
          <span className="flex items-center gap-1.5">
            <span>Finding evidence diagnostics</span>
            <InfoTip text="Verification quality, fetch quality, and downgrade flags for surfaced findings." />
          </span>
        }
      >
        <p className="text-sm text-slate-600">No surfaced findings were available for evidence diagnostics on this scan.</p>
      </CollapsibleSectionCard>
    );
  }

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>Finding evidence diagnostics</span>
          <InfoTip text="Verification quality, fetch quality, and downgrade flags for surfaced findings." />
        </span>
      }
      contentClassName="space-y-4"
    >
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.findingName} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-slate-900">{row.findingName}</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                {row.status === "surface" ? "Surface" : row.status === "audit_only" ? "Audit only" : "Suppressed"}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingLaneBadgeClasses(row.reportLane)}`}>
                {getSurfacingLaneLabel(row.reportLane)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getSurfacingDecisionStateBadgeClasses(row.decisionState)}`}>
                {getSurfacingDecisionStateLabel(row.decisionState)}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                {row.verificationLabel}
              </span>
              {row.fetchQuality ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                  fetch: {row.fetchQuality}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {row.negativeEvidenceFlags.length > 0
                ? row.negativeEvidenceFlags.join(", ")
                : "No negative evidence flags retained."}
            </p>
          </div>
        ))}
      </div>
    </CollapsibleSectionCard>
  );
}

function formatReviewFindingSummaryTitle(title: string) {
  const normalized = title
    .replace(/^Possible /i, "")
    .replace(/^Observed /i, "")
    .replace(/\s+detected$/i, "")
    .replace(/\s+present$/i, "")
    .replace(/\s+incidents$/i, "")
    .replace(/\s+candidate$/i, "")
    .trim();

  switch (normalized) {
    case "Pre-consent tracking":
    case "Pre-consent tracking incidents":
      return "Pre-consent tracking";
    case "Session replay tool":
    case "Session replay":
    case "Undisclosed session replay":
      return "Session replay";
    case "Policy-to-behavior conflict":
      return "Policy conflict";
    case "Accessibility claim mismatch":
      return "Claim mismatch";
    case "Store-credit-only remedy":
      return "Store-credit-only remedy";
    case "Low-confidence policy extraction":
      return "Low-confidence extraction";
    default:
      return normalized;
  }
}

function summarizeSectionFindings(findings: UnifiedFindingDisplayPacket[]) {
  if (findings.length === 0) {
    return "No surfaced findings in this section.";
  }

  const labels = findings
    .slice(0, 3)
    .map((finding) =>
      formatReviewFindingSummaryTitle(
        getPublicReportFindingDisplay({
          confidence: finding.confidenceBand,
          findingId: finding.unifiedFindingId,
          label: finding.presentation.findingName,
          remediation: finding.presentation.suggestedFix,
          severity: finding.severity,
          title: finding.title
        }).title
      )
    );
  const remainder = findings.length - labels.length;

  return `${findings.length} surfaced finding${findings.length === 1 ? "" : "s"}${
    labels.length > 0 ? `: ${labels.join(", ")}${remainder > 0 ? `, +${remainder} more` : ""}` : ""
  }.`;
}

function summarizeSectionFindingCoverage(input: {
  findings: UnifiedFindingDisplayPacket[];
  visibleCategories: Array<{
    category: ReturnType<typeof getReportEvidenceCategoriesForSection>[number];
    items: CanonicalSignalItem[];
  }>;
}) {
  const { findings, visibleCategories } = input;
  const findingCount = findings.length;

  if (findingCount === 0) {
    const populatedCategories = visibleCategories.filter(({ items }) => items.length > 0);
    if (populatedCategories.length === 0) {
      return "No surfaced findings or retained signal context in this section.";
    }

    const labels = populatedCategories.slice(0, 2).map(({ category }) => category.label);
    const remainder = populatedCategories.length - labels.length;
    return `No surfaced findings, but signal context was retained in ${populatedCategories.length} categor${populatedCategories.length === 1 ? "y" : "ies"}${labels.length > 0 ? `: ${labels.join(", ")}${remainder > 0 ? `, +${remainder} more` : ""}` : ""}.`;
  }

  return summarizeSectionFindings(findings);
}

function truncateJsonSample(value: string, maxLength = 140) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function buildEntitySamples(
  entities: NonNullable<UnifiedFindingDisplayPacket["evidence"]>["entities"] | undefined,
  input?: { maxKeys?: number; maxValues?: number; maxLength?: number }
) {
  const maxKeys = input?.maxKeys ?? 4;
  const maxValues = input?.maxValues ?? 3;
  const maxLength = input?.maxLength ?? 140;

  return Object.fromEntries(
    Object.entries(entities ?? {} as Record<string, string[]>)
      .slice(0, maxKeys)
      .map(([key, values]) => [key, values.slice(0, maxValues).map((value) => truncateJsonSample(value, maxLength))])
  );
}

function parseEntityObjectSamples(values: string[] | undefined, limit = 3) {
  const rows: Array<Record<string, unknown>> = [];
  for (const value of values ?? []) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        rows.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Existing report entities are mixed strings and JSON snippets; non-JSON values stay in the compact entity sample.
    }
    if (rows.length >= limit) {
      break;
    }
  }
  return rows;
}

function getFirstEntityObject(
  entities: NonNullable<UnifiedFindingDisplayPacket["evidence"]>["entities"] | undefined,
  keys: string[]
) {
  for (const key of keys) {
    const [row] = parseEntityObjectSamples(entities?.[key], 1);
    if (row) {
      return row;
    }
  }
  return null;
}

function getFirstEntityString(
  entities: NonNullable<UnifiedFindingDisplayPacket["evidence"]>["entities"] | undefined,
  keys: string[]
) {
  for (const key of keys) {
    const value = entities?.[key]?.find((entry) => entry.trim().length > 0);
    if (value) {
      return value;
    }
  }
  return null;
}

function getFindingCandidateProjectionIds(findingId: string) {
  const directMap: Record<string, string[]> = {
    accept_more_prominent_than_reject: ["asymmetric_consent_ui", "consent_dark_patterns_detected"],
    forced_consent_wall: ["forced_consent_interaction"],
    fingerprinting_observed: ["fingerprinting_related_signals_observed", "probable_fingerprinting"],
    preconsent_tracking: ["pre_consent_tracking_detected"],
    reject_button_missing: ["reject_option_missing_or_hidden", "consent_dark_patterns_detected"],
    reject_did_not_reduce_tracking: ["reject_tracking_persists_after_reject"],
    rtb_cookie_sync_observed: ["rtb_cookie_sync_observed"],
    session_replay_observed: ["session_recording_services_detected"],
    keyboard_navigation_accessibility_issue: ["keyboard_navigation_accessibility_issue"],
    weak_cookie_security_attributes: []
  };
  return directMap[findingId] ?? [];
}

function buildTrackingEvidenceExport(finding: UnifiedFindingDisplayPacket) {
  const entities = finding.evidence?.entities;
  const consentTimeline = getFirstEntityObject(entities, ["consentTimeline", "consent_timeline"]);
  const requestRows = [
    ...parseEntityObjectSamples(entities?.requestPurposeClassificationConfidence, 5),
    ...parseEntityObjectSamples(entities?.request_purpose_classification_confidence, 5)
  ];
  const reportFacingPageUrl = getReportFacingScannedPageUrl(finding);
  const promotionGradeRows = buildPromotionGradePreconsentRequests({
    rows: requestRows,
    scannedPageUrl: reportFacingPageUrl,
    consentTimeline,
    maxItems: 5
  });
  const representativePreConsentRequests = promotionGradeRows.length > 0
    ? promotionGradeRows.map((row) => ({
        scannedPageUrl: row.scannedPageUrl ?? null,
        requestUrl: row.requestUrl,
        hostname: row.hostname,
        registrableDomain: row.registrableDomain,
        vendorName: row.vendorName,
        vendorCategory: row.vendorCategory,
        vendorAttributionBasis: row.vendorAttributionBasis,
        firstSeenMs: row.firstSeenMs,
        consentActionMs: row.consentActionMs,
        noConsentActionObserved: row.noConsentActionObserved,
        consentSurfaceObserved: row.consentSurfaceObserved,
        consentInteractionRecorded: row.consentInteractionRecorded,
        confidence: row.confidence,
        runtimePhase: row.runtimePhase
      }))
    : [
        ...(entities?.preconsent_tracker_evidence_urls ?? [])
      ].slice(0, 5).map((url, index) => ({
        category: finding.evidence?.entities?.runtimeVendorCategories?.[index] ?? null,
        classificationBasis: null,
        runtimePhase: null,
        url,
        vendor: [
          ...(entities?.preconsent_tracker_vendors ?? []),
          ...(entities?.runtimeVendors ?? [])
        ][index] ?? null
      }));

  return {
    consentTimeline,
    firstThirdPartyTrackingRequestMs:
      finding.evidence?.counts?.firstThirdPartyTrackingRequestMs ??
      finding.evidence?.counts?.first_third_party_tracking_request_ms ??
      consentTimeline?.firstThirdPartyRequestMs ??
      consentTimeline?.first_third_party_request_ms ??
      null,
    firstNonEssentialRequestMs:
      consentTimeline?.firstNonEssentialRequestMs ??
      consentTimeline?.first_non_essential_request_ms ??
      null,
    firstUserActionMs:
      consentTimeline?.firstUserActionMs ??
      consentTimeline?.first_user_action_ms ??
      null,
    representativePreConsentRequests
  };
}

function buildCookieOrStorageEvidenceExport(finding: UnifiedFindingDisplayPacket) {
  const entities = finding.evidence?.entities;
  const rows = [
    ...parseEntityObjectSamples(entities?.preconsent_cookie_evidence, 8),
    ...parseEntityObjectSamples(entities?.preconsentCookieEvidence, 8)
  ];

  return {
    preConsentCookieWriteCount:
      finding.evidence?.counts?.preconsent_cookie_before_consent_count ??
      finding.evidence?.counts?.trackingCookieWritesBeforeConsent ??
      finding.evidence?.counts?.beforeConsentCookieCount ??
      null,
    rows: rows.map((row) => ({
      category: row.category ?? row.cookieCategory ?? row.cookie_category ?? row.vendorCategory ?? row.vendor_category ?? null,
      consentPhase: row.consentPhase ?? row.consent_phase ?? row.timingStatus ?? row.timing_status ?? null,
      cookieName: row.cookieName ?? row.cookie_name ?? row.name ?? null,
      domain: row.domain ?? row.cookieDomain ?? row.cookie_domain ?? row.hostname ?? null,
      firstObservedMs: row.firstObservedMs ?? row.first_observed_ms ?? row.firstSeenMs ?? row.first_seen_ms ?? null,
      party: row.party ?? row.cookiePartyType ?? row.cookie_party_type ?? null,
      vendor: row.vendor ?? row.vendorName ?? row.vendor_name ?? null,
      writeSource: row.writeSource ?? row.write_source ?? row.source ?? row.evidenceSource ?? row.evidence_source ?? null
    }))
  };
}

function buildFingerprintingEvidenceExport(finding: UnifiedFindingDisplayPacket) {
  const entities = finding.evidence?.entities;
  const runtimeEvidence = parseEntityObjectSamples(
    entities?.fingerprintingRuntimeEvidence ?? entities?.fingerprinting_runtime_evidence,
    3
  );
  const firstRuntimeEvidence = runtimeEvidence[0] ?? null;
  return {
    mappedTopFinding: getFindingCandidateProjectionIds(finding.unifiedFindingId),
    fingerprintTier: finding.evidence?.counts?.fingerprintTier ?? null,
    vendor: firstRuntimeEvidence?.vendor ?? getFirstEntityString(entities, ["fingerprintingVendors", "fingerprintVendors"]),
    scriptUrl: firstRuntimeEvidence?.requestUrl ?? firstRuntimeEvidence?.scriptUrl ?? null,
    apiSignals: entities?.fingerprintingSignals ?? entities?.fingerprintAttributeCategories ?? [],
    readbackObserved: firstRuntimeEvidence?.readbackObserved ?? firstRuntimeEvidence?.readback_observed ?? null,
    outboundRequestAfterCollection: (entities?.fingerprintingSummaryReasons ?? []).some((reason) =>
      /outbound third-party requests after collection/i.test(reason)
    ),
    retainedRuntimeEvidence: runtimeEvidence
  };
}

function buildConsentUiEvidenceExport(finding: UnifiedFindingDisplayPacket) {
  const entities = finding.evidence?.entities;
  const runtimePath = getFirstEntityObject(entities, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const rejectPath = getFirstEntityObject(entities, ["rejectPathDepthAndAvailability", "reject_path_depth_and_availability"]);
  const diagnostics = getFirstEntityObject(entities, ["consentSurfaceDiagnostics", "consent_surface_diagnostics"]);
  return {
    labels: {
      accept: runtimePath?.acceptLabel ?? diagnostics?.acceptLabel ?? null,
      reject: runtimePath?.rejectLabel ?? diagnostics?.rejectLabel ?? null,
      manage: runtimePath?.manageChoicesLabel ?? diagnostics?.manageChoicesLabel ?? null
    },
    pathDepth: {
      accept: runtimePath?.acceptPathDepth ?? rejectPath?.acceptPathDepth ?? null,
      reject: runtimePath?.rejectPathDepth ?? rejectPath?.rejectPathDepth ?? null
    },
    hierarchy: runtimePath?.visualHierarchyScore ?? runtimePath?.visual_hierarchy_score ?? null,
    postRejectObservationStatus: rejectPath?.postRejectObservationStatus ?? rejectPath?.post_reject_observation_status ?? null,
    rejectPathStatus: rejectPath?.status ?? runtimePath?.rejectPathStatus ?? null,
    surfaceType: runtimePath?.surfaceType ?? diagnostics?.surfaceType ?? null
  };
}

function buildDisclosureEvidenceExport(finding: UnifiedFindingDisplayPacket) {
  return {
    confidenceBasis: finding.presentationDecision.confidenceRationale,
    contactChannelType: getFirstEntityString(finding.evidence?.entities, [
      "privacyContactChannelType",
      "contactChannelType",
      "privacy_contact_channel_type"
    ]),
    matchedSnippet: finding.evidence?.snippets?.[0] ?? null,
    pageUrl: getReportFacingScannedPageUrl(finding)
  };
}

function buildRejectPersistenceEligibilityExport(finding: UnifiedFindingDisplayPacket) {
  if (finding.unifiedFindingId !== "reject_did_not_reduce_tracking") {
    return null;
  }
  const promotionDecision = getFirstEntityObject(finding.evidence?.entities, ["promotionDecision", "promotion_decision"]);
  const suppressionChecks = getFirstEntityObject(finding.evidence?.entities, ["suppressionChecks", "suppression_checks"]);
  const postRejectRequests = [
    ...parseEntityObjectSamples(finding.evidence?.entities?.postRejectNonEssentialRequests, 8),
    ...parseEntityObjectSamples(finding.evidence?.entities?.post_reject_non_essential_requests, 8)
  ];
  const demotionReasons = uniqueStrings([
    promotionDecision?.promoted === false ? `promotionDecision:${promotionDecision.reason ?? "not_promoted"}` : null,
    suppressionChecks?.post_reject_window_available === false ? "missing:post_reject_observation_window" : null,
    suppressionChecks?.navigation_or_reload_ambiguous === true ? "ambiguous:navigation_or_reload" : null,
    suppressionChecks?.redirect_or_auth_wall_ambiguous === true ? "ambiguous:redirect_or_auth_wall" : null,
    suppressionChecks?.reject_click_confirmed === false ? "missing:confirmed_reject_interaction" : null,
    suppressionChecks?.non_essential_vendor_after_reject === false ? "missing:post_reject_nonessential_activity" : null,
    postRejectRequests.length === 0 ? "missing:post_reject_nonessential_requests" : null
  ].filter((value): value is string => typeof value === "string" && value.length > 0));

  return {
    eligibility: demotionReasons.length === 0 ? "eligible_for_projection_review" : "not_projected",
    demotionReasons,
    promotionDecision,
    suppressionChecks,
    postRejectNonEssentialRequests: postRejectRequests,
    requiredEvidence: {
      rejectInteractionSucceeded: true,
      sameFlowRejectAttribution: true,
      postRejectObservationWindow: true,
      postRejectNonEssentialActivity: true
    }
  };
}

function buildRejectPersistenceObservedValue(input: {
  finding: UnifiedFindingDisplayPacket;
  rejectPersistenceEligibility: ReturnType<typeof buildRejectPersistenceEligibilityExport>;
}) {
  if (
    input.finding.unifiedFindingId !== "reject_did_not_reduce_tracking" ||
    !/No classified non-essential request fired at least/i.test(input.finding.observedValue ?? "") ||
    !input.rejectPersistenceEligibility ||
    input.rejectPersistenceEligibility.postRejectNonEssentialRequests.length === 0
  ) {
    return input.finding.observedValue ?? null;
  }

  const vendors = uniqueStrings(
    input.rejectPersistenceEligibility.postRejectNonEssentialRequests.flatMap((row) =>
      typeof row.vendor === "string" ? [row.vendor] : []
    )
  );
  return vendors.length > 0
    ? `Non-essential tracking requests fired after the reject interaction for ${vendors.slice(0, 4).join(", ")}.`
    : "Non-essential tracking requests fired after the reject interaction.";
}

function buildSensitiveSurfaceEvidenceExport(finding: UnifiedFindingDisplayPacket) {
  if (
    finding.unifiedFindingId !== "possible_session_replay_on_sensitive_input_surface" &&
    finding.unifiedFindingId !== "sensitive_data_collection_with_third_party_tracking_present"
  ) {
    return null;
  }
  const entities = finding.evidence?.entities;
  const sensitivePayloadRows = [
    ...parseEntityObjectSamples(entities?.sensitivePayloadViolations, 8),
    ...parseEntityObjectSamples(entities?.sensitive_payload_violations, 8)
  ];
  const sessionReplayRows = [
    ...parseEntityObjectSamples(entities?.sensitiveSessionReplayCooccurrenceEvidence, 8),
    ...parseEntityObjectSamples(entities?.sensitive_session_replay_cooccurrence_evidence, 8)
  ];
  const thirdPartyRows = [
    ...parseEntityObjectSamples(entities?.sensitiveThirdPartyTrackingEvidence, 8),
    ...parseEntityObjectSamples(entities?.sensitive_third_party_tracking_evidence, 8)
  ];
  const payloadSameFlowLinked = sensitivePayloadRows.some((row) => {
    const linkage =
      row.sameFlowLinkage && typeof row.sameFlowLinkage === "object" && !Array.isArray(row.sameFlowLinkage)
        ? row.sameFlowLinkage as Record<string, unknown>
        : row.same_flow_linkage && typeof row.same_flow_linkage === "object" && !Array.isArray(row.same_flow_linkage)
          ? row.same_flow_linkage as Record<string, unknown>
          : null;
    return linkage?.samePageOrFlow === true || linkage?.same_page_or_flow === true;
  });
  const payloadExposureObserved = sensitivePayloadRows.some((row) => {
    const linkage =
      row.sameFlowLinkage && typeof row.sameFlowLinkage === "object" && !Array.isArray(row.sameFlowLinkage)
        ? row.sameFlowLinkage as Record<string, unknown>
        : row.same_flow_linkage && typeof row.same_flow_linkage === "object" && !Array.isArray(row.same_flow_linkage)
          ? row.same_flow_linkage as Record<string, unknown>
          : null;
    return linkage?.userValueObserved === true || linkage?.user_value_observed === true || row.payloadExposureObserved === true;
  });
  const thirdPartyDomains = uniqueStrings([
    ...(entities?.third_party_domains ?? []),
    ...(entities?.thirdPartyDomains ?? []),
    ...sensitivePayloadRows.flatMap((row) =>
      typeof row.vendorHost === "string" ? [row.vendorHost] : typeof row.vendor_host === "string" ? [row.vendor_host] : []
    )
  ]);
  const samePageOrFlowLinked =
    payloadSameFlowLinked ||
    sessionReplayRows.some((row) => row.samePage === true || row.same_page === true || row.sameFlow === true || row.same_flow === true) ||
    thirdPartyRows.some((row) => row.samePage === true || row.same_page === true || row.sameFlow === true || row.same_flow === true);

  return {
    evidenceBasisType: uniqueStrings([
      sensitivePayloadRows.length > 0 ? "form_field_metadata" : null,
      thirdPartyRows.length > 0 ? "tracker_vendor_context" : null,
      sessionReplayRows.length > 0 ? "session_replay_vendor_context" : null,
      samePageOrFlowLinked ? "same_page_runtime_link" : null
    ]),
    payloadExposureObserved,
    rawValuesRetained: false,
    samePageOrFlowLinked,
    samePageOrFlowLinkage: samePageOrFlowLinked,
    fieldTypes: uniqueStrings([
      ...(entities?.sensitive_data_types ?? []),
      ...(entities?.sensitiveDataTypes ?? []),
      ...sensitivePayloadRows.flatMap((row) => typeof row.detectedType === "string" ? [row.detectedType] : typeof row.detected_type === "string" ? [row.detected_type] : [])
    ]),
    maskingOrExclusionObserved:
      sessionReplayRows.some((row) => row.maskingObserved === true || row.masking_observed === true || row.exclusionObserved === true || row.exclusion_observed === true) ||
      thirdPartyRows.some((row) => row.maskingObserved === true || row.masking_observed === true || row.exclusionObserved === true || row.exclusion_observed === true),
    sensitivePayloadViolations: sensitivePayloadRows,
    sensitiveSessionReplayCooccurrenceEvidence: sessionReplayRows,
    sensitiveThirdPartyTrackingEvidence: thirdPartyRows,
    thirdPartyDomains
  };
}

function buildReviewPacketProjectionDiagnostics(finding: UnifiedFindingDisplayPacket) {
  const contract = getFindingEvidenceContractForUnifiedFinding(finding.unifiedFindingId);
  const decision = evaluateFindingEvidenceContractForPacket(finding);
  const candidateProjectionIds = finding.topFindingEligibility?.candidateTopFindingIds?.length
    ? finding.topFindingEligibility.candidateTopFindingIds
    : getFindingCandidateProjectionIds(finding.unifiedFindingId);
  const projected = finding.topFindingEligibility?.eligibility === "projected" ||
    finding.sourceRefs.some((sourceRef) => sourceRef.kind === "signal" && candidateProjectionIds.includes(sourceRef.key));
  const missingCorroborators = decision?.missingRequirements ?? [];
  const rawDemotionReasons = uniqueStrings([
    ...(finding.topFindingEligibility?.demotionReasons ?? []),
    ...(finding.topFindingEligibility ? [] : missingCorroborators.map((requirement) => `missing:${requirement}`)),
    ...(decision?.negativeEvidenceFlags ?? []),
    ...finding.presentationDecision.downgradeReasons,
    ...finding.surfacingDecision.decisionReasons
  ]);
  const eligibility: ReportFacingProjectionEligibility =
    finding.topFindingEligibility?.eligibility ??
    (candidateProjectionIds.length === 0
      ? "no_top_finding_mapping"
      : projected
        ? "projected"
        : decision?.promotionEligibility === "eligible" && decision.allowedNarrativeTier === "strong"
          ? "eligible_not_projected"
          : "not_projected");
  const demotionReasons = filterReportFacingDemotionReasons({ eligibility, reasons: rawDemotionReasons });
  const suppressionReason = eligibility === "projected" ? null : demotionReasons[0] ?? null;

  return {
    topFindingEligibility: {
      eligibility,
      candidateTopFindingIds: candidateProjectionIds,
      matchedCriteria: finding.topFindingEligibility?.matchedCriteria ?? decision?.satisfiedRequirements ?? [],
      missingCorroborators: finding.topFindingEligibility?.missingCorroborators ?? missingCorroborators,
      demotionReasons,
      suppressionReason
    },
    canonicalPipelineRefs: {
      runtimeEvidenceIds: uniqueStrings(finding.sourceRefs.map((sourceRef) =>
        sourceRef.kind === "signal"
          ? `${sourceRef.source}:${sourceRef.key}`
          : sourceRef.kind === "validation"
            ? `validation:${sourceRef.ruleKey}`
            : `issue:${sourceRef.title}`
      )),
      normalizedConcernIds: finding.concernContext?.originTypes ?? [],
      concernPolicyId: contract?.findingId ?? null,
      unifiedFindingId: finding.unifiedFindingId,
      executiveProjectionStatus: projected ? "projected" : "not_projected"
    },
    coverageLimitations: {
      negativeEvidenceFlags: finding.concernContext?.negativeEvidenceFlags ?? [],
      fetchQuality: finding.evidence?.fetchQuality ?? null,
      fallbackOnly: finding.confidenceInputs.isFallbackOnly,
      presentationDowngradeReasons: finding.presentationDecision.downgradeReasons
    }
  };
}

export function buildReviewFindingSummaryJson(finding: UnifiedFindingDisplayPacket) {
  const reportFacingPageUrl = getReportFacingScannedPageUrl(finding);
  const reportFacingPageUrls = getReportFacingScannedPageUrls(finding).slice(0, 3);
  const display = getPublicReportFindingDisplay({
    confidence: finding.confidenceBand,
    findingId: finding.unifiedFindingId,
    label: finding.presentation.findingName,
    remediation: finding.presentation.suggestedFix,
    severity: finding.severity,
    title: finding.title
  });

  const diagnostics = buildReviewPacketProjectionDiagnostics(finding);
  const rejectPersistenceEligibility = buildRejectPersistenceEligibilityExport(finding);
  const observedValue = buildRejectPersistenceObservedValue({ finding, rejectPersistenceEligibility });
  const projectionCopy = buildReportFacingProjectionCopy({
    demotionReasons: diagnostics.topFindingEligibility.demotionReasons,
    eligibility: diagnostics.topFindingEligibility.eligibility,
    findingId: finding.unifiedFindingId,
    summary: finding.summary
  });
  const reviewLane = getReportFacingReviewLane(finding.unifiedFindingId, diagnostics.topFindingEligibility.eligibility);

  return {
    evidenceScope: "detailed_review_summary",
    note: "Compact public report JSON for the expanded finding card. Fuller retained evidence is summarized in the primary evidence-backed findings area.",
    unifiedFindingId: finding.unifiedFindingId,
    title: display.title,
    criticality: display.criticality,
    scanPriority: finding.severity,
    confidenceBand: finding.confidenceBand,
    summary: projectionCopy.summary,
    observedValue,
    primaryPageUrl: reportFacingPageUrl,
    affectedPageCount: finding.affectedPageCount,
    presentation: {
      findingName: display.title,
      whyThisMatters: finding.presentation.whyThisMatters,
      suggestedFix: display.remediation
    },
    evidence: {
      counts: finding.evidence?.counts ?? {},
      flags: (finding.evidence?.flags ?? []).slice(0, 6),
      pageUrls: reportFacingPageUrls,
      snippets: (finding.evidence?.snippets ?? []).slice(0, 2).map((snippet) => truncateJsonSample(snippet, 220)),
      entities: buildEntitySamples(finding.evidence?.entities, { maxKeys: 4, maxValues: 3, maxLength: 140 }),
      consentUi: buildConsentUiEvidenceExport(finding),
      disclosureOrContact: buildDisclosureEvidenceExport(finding),
      fingerprinting: buildFingerprintingEvidenceExport(finding),
      cookieOrStorage: buildCookieOrStorageEvidenceExport(finding),
      rejectPersistenceEligibility,
      sensitiveSurface: buildSensitiveSurfaceEvidenceExport(finding),
      tracking: buildTrackingEvidenceExport(finding)
    },
    topFindingEligibility: diagnostics.topFindingEligibility,
    canonicalPipelineRefs: diagnostics.canonicalPipelineRefs,
    coverageLimitations: diagnostics.coverageLimitations,
    reviewContext: {
      sourceCounts: {
        issueCount: finding.confidenceInputs.issueCount,
        signalCount: finding.confidenceInputs.signalCount,
        sourceCount: finding.confidenceInputs.sourceCount,
        validationCount: finding.confidenceInputs.validationCount
      },
      confidenceRationale: finding.presentationDecision.confidenceRationale,
      surfacing: {
        decision: finding.surfacingDecision.decisionState,
        lane: finding.surfacingDecision.reportLane,
        reasons: finding.surfacingDecision.decisionReasons.slice(0, 2),
        appliedRules: finding.surfacingDecision.appliedRules.slice(0, 3)
      },
      projection: {
        reviewLane,
        summary: projectionCopy.projectionSummary,
        canonicalTopFinding: diagnostics.topFindingEligibility.eligibility === "projected"
      }
    }
  };
}

function getReviewFindingAnchor(finding: Pick<UnifiedFindingDisplayPacket, "unifiedFindingId">) {
  return `review-finding-${finding.unifiedFindingId}`;
}

function CategorySeverityCounts(input: { findings: UnifiedFindingDisplayPacket[] }) {
  const highCount = input.findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = input.findings.filter((finding) => finding.severity === "medium").length;
  const lowCount = input.findings.filter((finding) => finding.severity === "low").length;

  if (highCount === 0 && mediumCount === 0 && lowCount === 0) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-600">
        —
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {highCount > 0 ? (
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-rose-900">
          {highCount}
        </span>
      ) : null}
      {mediumCount > 0 ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-900">
          {mediumCount}
        </span>
      ) : null}
      {lowCount > 0 ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700">
          {lowCount}
        </span>
      ) : null}
    </div>
  );
}

function CategoryFindingSummaryCard(input: { finding: UnifiedFindingDisplayPacket }) {
  const positiveSurfaceFinding = isPositiveSurfaceFinding(input.finding);
  const display = getPublicReportFindingDisplay({
    confidence: input.finding.confidenceBand,
    findingId: input.finding.unifiedFindingId,
    label: input.finding.presentation.findingName,
    remediation: input.finding.presentation.suggestedFix,
    severity: input.finding.severity,
    title: input.finding.title
  });
  const summary = display.observedSummary ?? getCollapsedFindingSummary(input.finding) ?? input.finding.presentation.whyThisMatters;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-medium text-slate-900">{display.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{summary}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getFindingBadgeClasses(input.finding, display.criticality)}`}>
          {positiveSurfaceFinding ? "positive surface" : display.criticality}
        </span>
      </div>
      <a
        href={`#${getReviewFindingAnchor(input.finding)}`}
        className="mt-2 inline-flex text-[11px] font-semibold text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-800"
      >
        Open detailed finding
      </a>
    </div>
  );
}

function CoverageMatrix(input: {
  pillarSections: Array<{
    pillar: (typeof REPORT_PRIMARY_PILLARS)[number];
    sections: Array<{
      alignedReviewFindings: UnifiedFindingDisplayPacket[];
      ownerReviewFindings: UnifiedFindingDisplayPacket[];
      section: ReturnType<typeof getReportSectionsForPillar>[number];
      visibleCategories: Array<{
        category: ReturnType<typeof getReportEvidenceCategoriesForSection>[number];
        items: CanonicalSignalItem[];
      }>;
    }>;
  }>;
}) {
  return (
    <CollapsibleSectionCard
      title="Coverage matrix"
      subtitle="A compact map of where surfaced findings landed across the report taxonomy."
      defaultOpen={false}
      contentClassName="space-y-6"
    >
      {input.pillarSections.map(({ pillar, sections }) => {
        return (
          <div key={pillar.id} className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">{pillar.label}</p>

            <div className="space-y-3">
              {sections.map(({ alignedReviewFindings, ownerReviewFindings, section, visibleCategories }) => (
                <div
                  key={section.id}
                  id={`coverage-section-${section.id}`}
                  className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{section.label}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {summarizeSectionFindingCoverage({
                        findings: alignedReviewFindings,
                        visibleCategories
                      })}
                    </p>
                  </div>

                  {visibleCategories.length > 0 ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {visibleCategories.map(({ category }) => {
                        const categoryFindings = alignedReviewFindings.filter(
                          (finding) => getUnifiedFindingCategoryRelation(finding, category.id) !== null
                        );

                        if (categoryFindings.length === 0) {
                          return (
                            <div
                              key={category.id}
                              id={`coverage-category-${category.id}`}
                              className="scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-slate-700">{category.label}</p>
                                <CategorySeverityCounts findings={categoryFindings} />
                              </div>
                            </div>
                          );
                        }

                        return (
                          <details
                            key={category.id}
                            id={`coverage-category-${category.id}`}
                            className="group/category scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
                              <div className="flex min-w-0 items-center gap-2">
                                <ScanReportDisclosureIcon className="group-open/category:rotate-90" />
                                <p className="text-sm text-slate-700">{category.label}</p>
                              </div>
                              <CategorySeverityCounts findings={categoryFindings} />
                            </summary>
                            {categoryFindings.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {categoryFindings.map((finding) => (
                                  <CategoryFindingSummaryCard
                                    key={`${category.id}-${finding.unifiedFindingId}`}
                                    finding={finding}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </details>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </CollapsibleSectionCard>
  );
}

function HomepagePreviewGate(input: {
  href: string;
  mode: "partial" | "full";
}) {
  return (
    <div
      className={
        input.mode === "full"
          ? "pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-white/85 px-6 py-8 backdrop-blur-[2px]"
          : "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex min-h-[45%] items-end justify-center rounded-b-[inherit] bg-[linear-gradient(180deg,rgba(248,250,252,0)_0%,rgba(248,250,252,0.86)_28%,rgba(255,255,255,0.97)_100%)] px-6 py-8"
      }
    >
      <PendingButtonLink
        href={input.href}
        idleContent={getHomepagePreviewGateIdleLabel(input.href)}
        pendingContent="Opening..."
        className="pointer-events-auto border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
      />
    </div>
  );
}

export function getHomepagePreviewGateIdleLabel(href: string) {
  return href.includes("mode=create_account") ? "Create account to view" : "Sign in to view";
}

export function debugBuildScanReportUnifiedFindingState(scanRecord: ScanDetailResponse): ScanReportUnifiedFindingState {
  const snapshot = scanRecord.snapshot;
  if (!snapshot) {
    return {
      allReviewFindingCandidates: [] as CanonicalReviewFinding[],
      derivedContext: {
        accessibilityIssueRows: [],
        accessibilityRuleEvidenceRows: [],
        consentAuditFindings: [],
        policyBehaviorContradictions: [],
        preconsentViolationRows: [],
        prioritizedAccessibilityRuleRows: [],
        scanReportReviewIssues: [],
        taxonomySnapshotSections: []
      },
      globalUnifiedFindings: [] as UnifiedFindingDisplayPacket[],
      sectionDrafts: []
    };
  }

  try {
    return buildScanReportUnifiedFindingState(scanRecord, {
      deriveAccessibilityIssueRows,
      deriveAccessibilityRuleEvidenceRows,
      deriveConsentAuditFindings: (candidateSnapshot, runtimeArtifacts) =>
        dedupeHeadlineFindings(deriveConsentAuditFindings(candidateSnapshot, runtimeArtifacts)),
      derivePolicyBehaviorContradictions: (input) =>
        derivePolicyBehaviorContradictions(input as Parameters<typeof derivePolicyBehaviorContradictions>[0]),
      derivePreconsentViolationRows,
      filterContradictoryPositiveSurfaceFindings
    });
  } catch (error) {
    console.error("Failed to build scan report unified finding state", error);
    return {
      allReviewFindingCandidates: [] as CanonicalReviewFinding[],
      derivedContext: {
        accessibilityIssueRows: [],
        accessibilityRuleEvidenceRows: [],
        consentAuditFindings: [],
        policyBehaviorContradictions: [],
        preconsentViolationRows: [],
        prioritizedAccessibilityRuleRows: [],
        scanReportReviewIssues: [],
        taxonomySnapshotSections: []
      },
      globalUnifiedFindings: [] as UnifiedFindingDisplayPacket[],
      sectionDrafts: []
    };
  }
}

export function buildScanReportUnifiedFindings(scanRecord: ScanDetailResponse) {
  const snapshot = scanRecord.snapshot;
  if (!snapshot) {
    return [] as UnifiedFindingDisplayPacket[];
  }

  try {
    const state = debugBuildScanReportUnifiedFindingState(scanRecord);
    const ownerFindings = buildScanReportUnifiedFindingsFromState(state);

    return filterContradictoryPositiveSurfaceFindings(ownerFindings);
  } catch (error) {
    console.error("Failed to build scan report unified findings", error);
    return [] as UnifiedFindingDisplayPacket[];
  }
}

export function deriveExecutiveSummaryBadgeCounts(findings: UnifiedFindingDisplayPacket[]) {
  const surfacedFindings = findings.filter(
    (finding) => finding.presentationDecision.status === "surface" && isMainNarrativeFinding(finding)
  );

  return {
    contradictionCount: surfacedFindings.filter((finding) => finding.details?.family === "contradiction").length,
    preconsentConflictCount: surfacedFindings.filter((finding) => finding.unifiedFindingId === "preconsent_tracking").length
  };
}

function mergeUnifiedFindingPacketsById(findings: UnifiedFindingDisplayPacket[]) {
  return [...new Map(findings.map((finding) => [finding.unifiedFindingId, finding])).values()];
}

const HIDDEN_ANALYST_DETAIL_PILLAR_IDS = new Set(["consumer_protection_commercial_practices"]);

function CanonicalTaxonomyReview(input: CanonicalTaxonomyReviewProps) {
  const showHomepagePreviewGate = input.previewMode === "homepage" && Boolean(input.createAccountHref);
  const { globalUnifiedFindings, sectionDrafts } = input.unifiedFindingState;
  const pillarSections = sectionDrafts
    .filter(({ pillar }) => !pillar || !HIDDEN_ANALYST_DETAIL_PILLAR_IDS.has(pillar.id))
    .map(({ pillar, sections }) => {
    if (!pillar) {
      throw new Error("Canonical taxonomy pillar missing from unified finding state");
    }

    return {
      pillar,
      sections: sections.map(({ categories = [], section, sectionCategoryIds }) => {
        if (!section) {
          throw new Error("Canonical taxonomy section missing from unified finding state");
        }
        const reviewFindings = globalUnifiedFindings.filter((finding) =>
          finding.categoryAlignments.some((alignment) => sectionCategoryIds.has(alignment.evidenceCategoryId))
        );
        const sectionItems = categories.flatMap((category) => category.items);
        const alignedReviewFindings = reviewFindings;
        const ownerReviewFindings = selectOwnerUnifiedFindingsForSection(globalUnifiedFindings, sectionCategoryIds);
        const visibleCategories = categories.filter(({ category, items }) => {
          const ownerFindingsForCategory = reviewFindings.filter(
            (finding) => getUnifiedFindingCategoryRelation(finding, category.id) === "owner"
          );
          const mirrorFindingsForCategory = reviewFindings.filter(
            (finding) => getUnifiedFindingCategoryRelation(finding, category.id) === "mirror"
          );
          const overlayFindingsForCategory = reviewFindings.filter(
            (finding) => getUnifiedFindingCategoryRelation(finding, category.id) === "overlay"
          );

          return (
            ownerFindingsForCategory.length > 0 ||
            mirrorFindingsForCategory.length > 0 ||
            overlayFindingsForCategory.length > 0 ||
            items.length > 0
          );
        });

        return {
          alignedReviewFindings,
          ownerReviewFindings,
          reviewFindings,
          section,
          sectionItems,
          unifiedFindings: reviewFindings,
          visibleCategories
        };
      })
    };
  });
  const reviewFindings = filterContradictoryPositiveSurfaceFindings([
    ...new Map(
      pillarSections
        .flatMap(({ sections }) => sections.flatMap((section) => section.ownerReviewFindings))
        .map((finding) => [finding.unifiedFindingId, finding])
    ).values()
  ]);
  const suppressEmptyBlockedChrome =
    input.scanRecord.accessPostureSummary?.accessPostureClass === "early_loss" &&
    input.scanRecord.accessPostureSummary?.stopTier === "tier1_front_door" &&
    reviewFindings.length === 0;

  return (
    <div className="space-y-6">
      {!suppressEmptyBlockedChrome ? (
        <CollapsibleSectionCard
          title="Analyst detail"
          subtitle="Expanded taxonomy review, coverage matrix, and supporting evidence below the executive findings layer."
          defaultOpen={false}
          contentClassName="space-y-6"
        >
          <div className="relative overflow-hidden rounded-2xl">
            <FindingsOverview findings={reviewFindings} />
            {showHomepagePreviewGate && input.createAccountHref ? (
              <HomepagePreviewGate href={input.createAccountHref} mode="partial" />
            ) : null}
          </div>

          <div className="relative overflow-hidden rounded-2xl">
            <CoverageMatrix
              pillarSections={pillarSections.map(({ pillar, sections }) => ({
                pillar,
                sections: sections.map(({ alignedReviewFindings, ownerReviewFindings, section, visibleCategories }) => ({
                  alignedReviewFindings,
                  ownerReviewFindings,
                  section,
                  visibleCategories
                }))
              }))}
            />
            {showHomepagePreviewGate && input.createAccountHref ? (
              <HomepagePreviewGate href={input.createAccountHref} mode="partial" />
            ) : null}
          </div>
        </CollapsibleSectionCard>
      ) : null}
    </div>
  );
}

function getReviewIssueNextStep(issue: CanonicalReviewIssue) {
  if (issue.evidence && issue.evidence.length > 0) {
    return "Review the linked evidence in this section and confirm whether the issue reflects an actual policy or disclosure gap.";
  }

  return "Inspect the supporting signals in this section and confirm whether the issue reflects a real reviewer concern.";
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getResultStatusTone(status: string) {
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
    case "running":
    case "queued":
      return {
        badge: "border-sky-200 bg-sky-50 text-sky-800",
        panel: "from-sky-100 via-white to-cyan-100"
      };
    default:
      return {
        badge: "border-slate-200 bg-slate-50 text-slate-700",
        panel: "from-slate-100 via-white to-slate-50"
      };
  }
}

function getWorkflowStageTone(status: SignalEnrichmentWorkflowStageStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "blocked":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
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

function getLatestNanoDocRetrievalDiagnostics(scanEvents: ScanEventSummaryRecord[]) {
  const event = [...scanEvents].reverse().find((row) => row.eventType === "signals.nano_doc_retrieval_completed");
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
    nonOkCount: getRecordNumber(metadata, "nonOkCount"),
    rejectedCount: getRecordNumber(metadata, "rejectedCount")
  };
}

function SignalEnrichmentWorkflowCard(input: {
  finalHost: string | null;
  landedOnDifferentHost: boolean;
  requestedHost: string | null;
  scanRecord: ScanDetailResponse;
}) {
  const workflow = input.scanRecord.signalEnrichmentWorkflow;
  const retrievalDiagnostics = getLatestNanoDocRetrievalDiagnostics(input.scanRecord.events);
  const counts = {
    stagesCompleted: workflow.stages.filter((stage) => stage.status === "completed").length,
    totalStages: workflow.stages.length
  };

  return (
    <CollapsibleSectionCard
      title="Signal enrichment workflow"
      defaultOpen={false}
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          Scanner, nano, merge, and finding-derivation status for this scan.
        </p>
        {input.landedOnDifferentHost && input.requestedHost && input.finalHost ? (
          <div className="rounded-2xl border border-sky-200/80 bg-sky-50/75 px-4 py-3 text-sm text-sky-950">
            Findings reflect the landed domain <span className="font-semibold">{input.finalHost}</span>, not the requested domain{" "}
            <span className="font-semibold">{input.requestedHost}</span>.
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryMetricTile label="Preferred mode" value={workflow.preferredMode === "parallel_evidence_collection" ? "Parallel" : workflow.preferredMode} />
          <SummaryMetricTile label="Actual mode" value={workflow.actualMode === "parallelized" ? "Parallelized" : "Serial bridge"} />
          <SummaryMetricTile label="Merged signals" value={workflow.mergedSignalsReady ? "Ready" : "Pending"} />
          <SummaryMetricTile label="Findings" value={workflow.findingsReady ? "Ready" : "Pending"} />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryMetricTile label="Time to merged signals" value={formatDurationMs(workflow.timings.timeToMergedSignalsMs)} />
          <SummaryMetricTile label="Time to findings" value={formatDurationMs(workflow.timings.timeToFindingsMs)} />
          <SummaryMetricTile label="Nano retrieval" value={formatDurationMs(workflow.timings.nanoDocRetrievalDurationMs)} />
          <SummaryMetricTile label="Nano signal pass" value={formatDurationMs(workflow.timings.nanoDocSignalsDurationMs)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SummaryMetricTile label="Fresh extractions" value={String(workflow.extractionMetrics.freshExtractions)} />
          <SummaryMetricTile label="Reused extractions" value={String(workflow.extractionMetrics.reusedExtractions)} />
        </div>
        {workflow.extractionMetrics.skippedExtractions > 0 ? (
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <span className="font-medium">Skipped extractions</span>
              <span>{workflow.extractionMetrics.skippedExtractions}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(workflow.extractionMetrics.skippedByReason).map(([reason, count]) => (
                <span
                  key={reason}
                  className="inline-flex items-center rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900"
                >
                  {formatReasonLabel(reason)}: {count}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
            {counts.stagesCompleted} of {counts.totalStages} stages completed
          </div>
          {retrievalDiagnostics ? (
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="font-medium text-slate-900">Nano doc retrieval diagnostics</div>
              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <div>Candidates: {retrievalDiagnostics.candidateCount ?? "—"}</div>
                <div>Retained docs: {retrievalDiagnostics.documentSourceCount ?? "—"}</div>
                <div>Rejected docs: {retrievalDiagnostics.rejectedCount ?? "—"}</div>
                <div>Duplicates dropped: {retrievalDiagnostics.duplicateCount ?? "—"}</div>
              </div>
              <div className="mt-1 grid gap-2 md:grid-cols-4">
                <div>Interstitial drops: {retrievalDiagnostics.intermediaryCount ?? "—"}</div>
                <div>Insufficient docs: {retrievalDiagnostics.insufficientCount ?? "—"}</div>
                <div>Non-OK fetches: {retrievalDiagnostics.nonOkCount ?? "—"}</div>
                <div>Fetch/runtime errors: {retrievalDiagnostics.errorCount ?? "—"}</div>
              </div>
            </div>
          ) : null}
          <div className="divide-y divide-slate-200">
            {workflow.stages.map((stage) => (
              <div key={stage.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">{stage.label}</p>
                    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", getWorkflowStageTone(stage.status))}>
                      {formatWorkflowStageStatus(stage.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{stage.description}</p>
                  {stage.dependsOn.length > 0 ? (
                    <p className="mt-1 text-xs text-slate-500">Depends on: {stage.dependsOn.join(", ")}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-sm text-slate-600 md:text-right">
                  <div>Items: {typeof stage.itemCount === "number" ? stage.itemCount : "—"}</div>
                  <div>Duration: {formatDurationMs(stage.durationMs)}</div>
                  <div>Started: {stage.startedAt ? formatDateTime(stage.startedAt) : "—"}</div>
                  <div>Completed: {stage.completedAt ? formatDateTime(stage.completedAt) : "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CollapsibleSectionCard>
  );
}

function buildResultHeroHighlights(input: {
  findingPackets: UnifiedFindingDisplayPacket[];
  hybridRuntimeSummaryRows: Array<{ label: string; value: unknown }> | null;
  runtimeArtifacts: Record<string, unknown> | null;
}) {
  const highlights: string[] = [];
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const consentSummary = getRecord(hybrid?.consentSummary);
  const consentVisual = getRecord(hybrid?.consentVisual);
  const uiSummary = getRecord(hybrid?.uiSummary);
  const mediaSummary = getRecord(hybrid?.mediaSummary);
  const fingerprintSummary = getRecord(hybrid?.fingerprintSummary);
  const networkSummary = getRecord(hybrid?.networkSummary);

  if ((getFiniteNumber(networkSummary?.preConsentThirdPartyRequestCount) ?? 0) > 0) {
    highlights.push("Pre-consent tracking observed");
  }
  if (consentSummary?.cookieWallDetected === true || uiSummary?.forcedActionRequired === true) {
    highlights.push("Consent wall or forced interaction");
  }
  if (consentSummary?.rejectPresent === false || consentVisual?.rejectHidden === true) {
    highlights.push("Reject path weakened");
  }
  if ((getFiniteNumber(fingerprintSummary?.tier) ?? 0) >= 2) {
    highlights.push(`Fingerprinting tier ${fingerprintSummary?.tier}`);
  }
  if ((getFiniteNumber(uiSummary?.popupCount) ?? 0) > 0) {
    highlights.push("Popup behavior observed");
  }
  if (mediaSummary?.autoplayVideoObserved === true || mediaSummary?.autoplayAudioObserved === true) {
    highlights.push("Autoplay observed");
  }

  if (highlights.length === 0) {
    const topFindings = input.findingPackets
      .slice(0, 3)
      .map((finding) =>
        getPublicReportFindingDisplay({
          confidence: finding.confidenceBand,
          findingId: finding.unifiedFindingId,
          label: finding.presentation.findingName,
          remediation: finding.presentation.suggestedFix,
          severity: finding.severity,
          title: finding.title
        }).title
      )
      .filter((value, index, values) => values.indexOf(value) === index);
    highlights.push(...topFindings);
  }

  if (highlights.length === 0 && input.hybridRuntimeSummaryRows) {
    const nonEmptyLabels = input.hybridRuntimeSummaryRows
      .filter((row) => row.value !== null && row.value !== undefined && row.value !== false)
      .slice(0, 3)
      .map((row) => row.label);
    highlights.push(...nonEmptyLabels);
  }

  return highlights.slice(0, 4);
}

function ResultHeroPanel(input: {
  consentAuditCompleted: boolean;
  consentRejectInteractionSucceeded: boolean;
  consentRejectReducedTracking: unknown;
  findingPackets: UnifiedFindingDisplayPacket[];
  hybridRuntimeSummaryRows: Array<{ label: string; value: unknown }> | null;
  preConsentTrackingObserved: boolean;
  runtimeArtifacts: Record<string, unknown> | null;
  scanExecutionSummary: ReturnType<typeof deriveScanExecutionSummary>;
  scanRecord: ScanDetailResponse;
}) {
  const tone = getResultStatusTone(input.scanRecord.scan.status);
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const networkSummary = getRecord(hybrid?.networkSummary);
  const vendorSummary = getRecord(hybrid?.vendorSummary);
  const fingerprintSummary = getRecord(hybrid?.fingerprintSummary);
  const uiSummary = getRecord(hybrid?.uiSummary);
  const surfacedCount = input.findingPackets.length;
  const highlights = buildResultHeroHighlights({
    findingPackets: input.findingPackets,
    hybridRuntimeSummaryRows: input.hybridRuntimeSummaryRows,
    runtimeArtifacts: input.runtimeArtifacts
  });
  const scoreTiles = [
    {
      label: "Surfaced findings",
      value: surfacedCount > 0 ? surfacedCount : "None"
    },
    {
      label: "Third-party domains",
      value: getRecordStringArray(vendorSummary, "rawThirdPartyDomains")
        .filter((host) => !isCmpOrFunctionalVendorDomain(host)).length || "None"
    },
    {
      label: "Fingerprint tier",
      value: getFiniteNumber(fingerprintSummary?.tier) ?? "0"
    },
    {
      label: "Runtime friction",
      value:
        uiSummary?.forcedActionRequired === true
          ? "Forced"
          : uiSummary?.overlayDetected === true
            ? "Overlay"
            : "Clear"
    }
  ];

  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] md:p-7",
        tone.panel
      )}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.10),transparent_52%)]" />
      <div className="relative grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]", tone.badge)}>
              {input.scanRecord.scan.status}
            </span>
            {input.scanExecutionSummary ? (
              <span className="rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
                {input.scanExecutionSummary.title}
              </span>
            ) : null}
            {input.scanRecord.scan.scanFromValue !== "default" ? (
              <span className="rounded-full border border-teal-200 bg-teal-50/90 px-3 py-1 text-xs font-medium text-teal-800">
                Scan from: {input.scanRecord.scan.scanFromLabel}
              </span>
            ) : null}
            {input.preConsentTrackingObserved ? (
              <span className="rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1 text-xs font-medium text-amber-800">
                Pre-consent activity
              </span>
            ) : null}
          </div>

          <div className="space-y-2">
            <h2 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 md:text-[2.1rem]">
              {input.scanRecord.scan.domainHostname ?? "Scan results"}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-[15px]">
              {surfacedCount > 0
                ? `The primary scan surfaced ${surfacedCount} prioritized finding${surfacedCount === 1 ? "" : "s"} with hybrid runtime evidence driving consent, tracking, and intrusive-behavior coverage.`
                : "The hybrid scanner completed with a lighter runtime footprint and no prioritized findings surfaced at the top layer."}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.35rem] border border-white/70 bg-white/78 p-4 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Consent posture</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                {input.consentAuditCompleted
                  ? input.consentRejectInteractionSucceeded
                    ? input.consentRejectReducedTracking === true
                      ? "Reject reduced tracking"
                      : input.consentRejectReducedTracking === false
                        ? "Reject did not reduce tracking"
                        : "Reject path completed"
                    : "Audit incomplete"
                  : "Runtime-only coverage"}
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/70 bg-white/78 p-4 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Network posture</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                {(getFiniteNumber(networkSummary?.thirdPartyRequestCount) ?? 0) > 0
                  ? `${getFiniteNumber(networkSummary?.thirdPartyRequestCount) ?? 0} third-party requests`
                  : "No third-party traffic observed"}
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/70 bg-white/78 p-4 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Signals in focus</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                {highlights[0] ?? "No high-priority runtime flags"}
              </p>
            </div>
          </div>

          {highlights.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {highlights.map((highlight) => (
                <span
                  key={highlight}
                  className="rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 backdrop-blur"
                >
                  {highlight}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {scoreTiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-[1.4rem] border border-slate-200/80 bg-white/78 p-4 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur"
            >
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{tile.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{tile.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResultCategorySection(input: {
  title: string;
  metrics: ResultMetric[];
  details: ResultDetail[];
  defaultOpen?: boolean;
  collapsible?: boolean;
  intro?: string;
  includes?: string;
  collapseDetails?: boolean;
  detailsTitle?: string;
  staticSection?: boolean;
}) {
  const visibleDetails = input.details.filter((detail) => {
    if (detail.value === null || detail.value === undefined || detail.value === "") {
      return false;
    }

    if (Array.isArray(detail.value)) {
      return detail.value.length > 0;
    }

    return true;
  });

  const body = (
    <>
      <div className={METRIC_GRID_CLASS}>
        {input.metrics.map((metric) => (
          <SummaryMetricTile
            key={`${input.title}-${metric.label}`}
            label={metric.label}
            tooltip={metric.tooltip}
            value={metric.value}
          />
        ))}
      </div>

      {visibleDetails.length > 0 ? (
        input.collapseDetails ? (
          <CollapsibleSectionCard title={input.detailsTitle ?? "Detail signals"} defaultOpen={false}>
              <div className={METRIC_GRID_CLASS}>
                {visibleDetails.map((detail) => (
                <SummaryMetricTile
                  key={`${input.title}-${detail.label}`}
                  label={detail.label}
                  value={formatCompactValue(detail.value)}
                />
              ))}
            </div>
          </CollapsibleSectionCard>
        ) : (
          <div className={METRIC_GRID_CLASS}>
            {visibleDetails.map((detail) => (
              <SummaryMetricTile
                key={`${input.title}-${detail.label}`}
                label={detail.label}
                value={formatCompactValue(detail.value)}
              />
            ))}
          </div>
        )
      ) : null}
    </>
  );

  if (input.staticSection) {
    return (
      <StaticSubsection title={input.title} intro={input.intro} tooltip={input.intro}>
        {body}
      </StaticSubsection>
    );
  }

  if (input.collapsible === false) {
    return (
      <SectionSubsection
        title={input.title}
        intro={input.intro}
        tooltip={input.intro}
      >
        {body}
      </SectionSubsection>
    );
  }

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>{input.title}</span>
          {input.intro ? <InfoTip text={input.intro} /> : null}
        </span>
      }
      subtitle={input.intro}
      defaultOpen={input.defaultOpen}
      contentClassName="space-y-4"
    >
      {body}
    </CollapsibleSectionCard>
  );
}

export function deriveSharedScanDetailGdprEprivacyCoverageChecklist(input: {
  coverageLimited: boolean;
  events?: ScanDetailResponse["events"];
  policyEnrichmentCount: number;
  projectedFindings?: GdprEprivacyCoverageChecklistInput["projectedFindings"];
  runtimeArtifacts: ScanDetailResponse["runtimeArtifacts"];
  runtimeCookieRows?: RuntimeCookieEvidenceRow[];
  runtimeTrackerPriorityRows?: GdprEprivacyCoverageChecklistInput["runtimeTrackerPriorityRows"];
  scanCompleted: boolean;
  snapshot: ScanDetailResponse["snapshot"];
  unifiedFindings: UnifiedFindingDisplayPacket[];
}): GdprEprivacyCoverageChecklistItem[] {
  const runtimeArtifactNormalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts: input.runtimeArtifacts,
    validationFindings: []
  });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: input.coverageLimited,
    events: input.events,
    normalizedConcerns: runtimeArtifactNormalizedConcerns,
    policyEnrichmentCount: input.policyEnrichmentCount,
    runtimeArtifacts: input.runtimeArtifacts,
    scanCompleted: input.scanCompleted,
    snapshot: input.snapshot
  });

  return deriveGdprEprivacyCoverageChecklist({
    coverageLimited: input.coverageLimited,
    coverageOutcomes,
    projectedFindings: input.projectedFindings,
    runtimeCookieRows: input.runtimeCookieRows,
    runtimeTrackerPriorityRows: input.runtimeTrackerPriorityRows,
    scanCompleted: input.scanCompleted,
    unifiedFindings: input.unifiedFindings
  });
}

type SharedScanDetailViewProps = {
  analyticsScanSource?: "homepage" | "dashboard" | "unknown";
  autoRefresh?: ReactNode;
  createAccountHref?: string | null;
  createdAtInfoTip?: string | null;
  executiveAccessLimitationOverride?: ExecutiveAccessLimitationNotice | null;
  headerActions?: ReactNode;
  headerActionsPlacement?: "end" | "belowTitle";
  localV2DagInFlightProgress?: ReactNode;
  previewNotice?: ReactNode;
  previewPayload?: PreviewScanPayload | null;
  previewMode?: "full" | "homepage";
  scanRecord: ScanDetailResponse;
  canViewReviewLenses?: boolean;
  signalSnapshotVisibility?: {
    showFingerprinting: boolean;
    showReviewLenses: boolean;
    showScanInterruption: boolean;
  };
  showBrowserExtensionRecovery?: boolean;
  viewerAccessRole?: string | null;
};

type BetaRegulatoryLens = {
  acronym: string;
  findings: Array<{ label: string }>;
  ratingLabel: string;
  score: number | null;
  summary: string;
};

type BetaRegulatoryFindingSource = {
  id: string;
  label: string;
};

type BetaRegulatoryFindingSourceLike = {
  id?: string | null;
  label?: string | null;
  title?: string | null;
  unifiedFindingId?: string | null;
};

function buildBetaRegulatoryFindingSources(input: {
  executiveFindings?: BetaRegulatoryFindingSourceLike[];
  unifiedFindings?: BetaRegulatoryFindingSourceLike[];
}): BetaRegulatoryFindingSource[] {
  const sources = [
    ...(input.unifiedFindings ?? []),
    ...(input.executiveFindings ?? [])
  ];
  const byId = new Map<string, BetaRegulatoryFindingSource>();

  for (const source of sources) {
    const id = source.id?.trim() || source.unifiedFindingId?.trim();
    if (!id || byId.has(id)) {
      continue;
    }
    const label = source.label?.trim() || source.title?.trim() || id;
    byId.set(id, { id, label });
  }

  return [...byId.values()];
}

type BetaRowSeed = Omit<BetaRegulatoryChecklistRow, "evidenceRefs" | "status"> & {
  evidenceRefs?: string[];
  evidenceRefScope?: "lens" | "none";
  findingIds?: string[];
  matchedStatus?: BetaRegulatoryChecklistStatus;
  status?: BetaRegulatoryChecklistStatus;
};

type BetaAreaSeed = {
  id: string;
  lensAcronym?: string;
  maturityLabel?: BetaRegulatoryChecklistArea["maturityLabel"];
  navLabel: string;
  rows: BetaRowSeed[];
  subtitle: string;
  summary: string;
  title: string;
};

function normalizeBetaStatusFromLens(lens: BetaRegulatoryLens | null, fallback: BetaRegulatoryChecklistStatus = "not_testable") {
  return lens && lens.findings.length > 0 ? "review_signal" : fallback;
}

function buildBetaCounters(rows: BetaRegulatoryChecklistRow[]): BetaRegulatoryChecklistArea["counters"] {
  return {
    checked: rows.filter((row) => row.status === "checked").length,
    gaps: rows.filter((row) => row.status === "gap_observed").length,
    notApplicable: rows.filter((row) => row.status === "not_applicable").length,
    notObserved: rows.filter((row) => row.status === "not_observed").length,
    notTestable: rows.filter((row) => row.status === "not_testable").length,
    review: rows.filter((row) => row.status === "review_signal" || row.status === "litigation_risk_signal").length
  };
}

function buildBetaArea(
  seed: BetaAreaSeed,
  lenses: BetaRegulatoryLens[],
  findingSources: BetaRegulatoryFindingSource[] = []
): BetaRegulatoryChecklistArea {
  const lens = seed.lensAcronym ? lenses.find((item) => item.acronym === seed.lensAcronym) ?? null : null;
  const lensEvidenceRefs = lens?.findings.map((finding) => finding.label).slice(0, 6) ?? [];
  const rows = seed.rows.map((row, index): BetaRegulatoryChecklistRow => {
    const matchedFindingRefs = findingSources
      .filter((finding) => row.findingIds?.includes(finding.id))
      .map((finding) => finding.label)
      .slice(0, 6);
    const status =
      row.status ??
      (matchedFindingRefs.length > 0
        ? row.matchedStatus ?? "review_signal"
        : null) ??
      (index === 0 ? normalizeBetaStatusFromLens(lens) : "not_testable");
    return {
      ...row,
      evidenceRefs:
        matchedFindingRefs.length > 0
          ? matchedFindingRefs
          : row.evidenceRefScope === "lens" || (index === 0 && lensEvidenceRefs.length > 0)
            ? lensEvidenceRefs
            : row.evidenceRefs,
      status
    };
  });
  const score = typeof lens?.score === "number" ? lens.score : null;
  const status =
    rows.some((row) => row.status === "gap_observed")
      ? "needs_work"
      : rows.some((row) => row.status === "review_signal" || row.status === "litigation_risk_signal")
        ? "review_recommended"
        : score === null
          ? "limited_coverage"
          : score >= 80
            ? "strong"
            : "limited_coverage";

  return {
    counters: buildBetaCounters(rows),
    id: seed.id,
    maturityLabel: seed.maturityLabel,
    navLabel: seed.navLabel,
    rows,
    score,
    status,
    subtitle: seed.subtitle,
    summary: lens?.summary ? `${lens.summary} ${seed.summary}` : seed.summary,
    title: seed.title
  };
}

function betaRows(input: Array<[string, string, string, BetaRegulatoryChecklistRow["evidenceCapability"], BetaRegulatoryChecklistStatus?]>): BetaRowSeed[] {
  return input.map(([id, label, note, evidenceCapability, status]) => ({
    evidenceCapability,
    id,
    label,
    note,
    regulatoryMapping: [],
    status
  }));
}

function buildBetaRegulatoryChecklistAreas(
  lenses: BetaRegulatoryLens[],
  findingSources: BetaRegulatoryFindingSource[] = []
) {
  const seeds: BetaAreaSeed[] = [
    {
      id: "gdpr-eprivacy",
      lensAcronym: "GDPR / ePrivacy",
      navLabel: "GDPR / ePrivacy",
      title: "GDPR / ePrivacy",
      subtitle: "EU privacy, cookies, consent, tracking, and transparency review signals.",
      summary: "GDPR/ePrivacy beta review reuses retained public-web signals without duplicating raw signal paths.",
      rows: betaRows([
        ["notice_surface", "Cookie/tracking notice or consent surface", "Cookie or tracking notice evidence must be retained from the tested context.", "currently_supported", "not_observed"],
        ["storage_before_consent", "Cookies or storage before consent", "Before-consent storage is eligible when retained and normalized through the GDPR/ePrivacy concern pipeline.", "currently_supported"],
        ["tracking_before_consent", "Third-party tracking before consent", "Pre-consent third-party tracking requires retained request timing evidence.", "currently_supported"],
        ["reject_refuse", "Reject/refuse option availability", "Reject/refuse availability requires retained consent UI path evidence.", "currently_supported"],
        ["tracking_after_refusal", "Tracking after refusal", "Tracking after refusal requires a confirmed refusal action and retained after-state request evidence.", "near_term_supported"],
        ["post_choice", "Post-choice consent controls", "Post-choice controls require retained lifecycle or preference-management evidence.", "near_term_supported"],
        ["vendor_alignment", "Runtime vendors vs disclosures", "Runtime vendors must be compared with retained public disclosures.", "near_term_supported"],
        ["session_replay", "Session replay / behavioral analytics", "Behavioral analytics signals are eligible when retained and projected through unified findings.", "currently_supported"],
        ["sensitive_tracking", "Sensitive forms with third-party tracking", "Sensitive forms and third-party tracking must be retained together.", "near_term_supported"],
        ["cross_border", "Cross-border endpoint review", "Endpoint geography or transfer-review evidence requires retained endpoint jurisdiction signals.", "near_term_supported"],
        ["control_accessibility", "Consent/privacy control accessibility", "Basic automated accessibility signals on privacy controls are eligible when retained.", "currently_supported"]
      ])
    }
  ];

  return seeds.map((seed) => buildBetaArea(seed, lenses, findingSources));
}

type ScanReportAccessRole = "admin" | "advanced" | "user";

function normalizeScanReportAccessRole(role: string | null | undefined): ScanReportAccessRole {
  if (role === "admin" || role === "owner") {
    return "admin";
  }

  if (role === "advanced") {
    return "advanced";
  }

  return "user";
}

export async function SharedScanDetailView({
  analyticsScanSource = "unknown",
  autoRefresh = null,
  createAccountHref = null,
  createdAtInfoTip = null,
  executiveAccessLimitationOverride = null,
  headerActions = null,
  headerActionsPlacement = "end",
  localV2DagInFlightProgress = null,
  previewNotice = null,
  previewPayload: previewPayloadOverride = null,
  previewMode = "full",
  scanRecord,
  canViewReviewLenses,
  signalSnapshotVisibility,
  showBrowserExtensionRecovery = false,
  viewerAccessRole = "user"
}: SharedScanDetailViewProps) {
  const scanReportAccessRole = normalizeScanReportAccessRole(viewerAccessRole);
  const showAnalystDetail = scanReportAccessRole !== "user";
  const showAdvancedDiagnostics = scanReportAccessRole === "admin";
  const canViewSignalSnapshotReviewLenses =
    signalSnapshotVisibility?.showReviewLenses !== false && (canViewReviewLenses ?? scanReportAccessRole === "admin");
  const previewPayload = previewPayloadOverride ?? scanRecord.previewPayload ?? null;
  const snapshot = scanRecord.snapshot;
  const isBrowserExtensionScan = scanRecord.scan.scanType === "browser_extension";
  const isZeroCoveragePreviewCompletion =
    scanRecord.scan.scanType === "preview" &&
    scanRecord.scan.status === "completed" &&
    !snapshot &&
    scanRecord.scan.pagesScanned === 0;
  const unverifiedHomepageReview = snapshot
    ? deriveUnverifiedHomepageReview(snapshot, scanRecord.events, scanRecord.policyEnrichment)
    : null;
  const zeroCoveragePreviewNotice = isZeroCoveragePreviewCompletion
    ? buildPreviewExecutiveAccessLimitationNotice({
        resultState: {
          code: "scanner_heartbeat_degraded",
          coverageLevel: "limited_none",
          message:
            "This preview completed before the scanner captured any public pages, so CertScore.ai withheld substantive privacy and consent conclusions.",
          title: "Preview completed without verified site coverage"
        },
        review: null
      })
    : null;
  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const visualAccessLimitationNotice = deriveVisualAccessLimitationNotice(runtimeArtifacts);
  const requestedExecutiveAccessLimitationNotice =
    visualAccessLimitationNotice ??
    executiveAccessLimitationOverride ??
    (snapshot ? deriveExecutiveAccessLimitationNotice(snapshot, scanRecord.events, scanRecord.policyEnrichment) : null) ??
    zeroCoveragePreviewNotice;
  const suppressLimitedSurfaceReview =
    scanRecord.accessPostureSummary?.accessPostureClass === "early_loss" &&
    scanRecord.accessPostureSummary?.stopTier === "tier1_front_door";
  const hybridRuntimeSummaryRows = getHybridRuntimeSummaryRows(runtimeArtifacts);
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(runtimeArtifacts);
  const hybridVendorSummary = getRecord(hybridRuntimeEvidence?.vendorSummary);
  const hybridStorageSummary = getRecord(hybridRuntimeEvidence?.storageSummary);
  const hybridFingerprintSummary = getRecord(hybridRuntimeEvidence?.fingerprintSummary);
  const hybridNavigationSummary = getRecord(hybridRuntimeEvidence?.navigationSummary);
  const hybridUiSummary = getRecord(hybridRuntimeEvidence?.uiSummary);
  const hybridMediaSummary = getRecord(hybridRuntimeEvidence?.mediaSummary);
  const runtimeInitialCookieCount = getRecordNumber(runtimeArtifacts, "initial_cookie_count") ?? getRecordNumber(runtimeArtifacts, "initialCookieCount") ?? 0;
  const certScoreSummary = deriveCertScoreFindings(scanRecord);
  const fallbackEvidence = previewPayload?.supplementalEvidence ?? previewPayload?.fallbackEvidence ?? null;
  const fallbackEvidenceRelation =
    previewPayload?.evidence?.supplementalEvidenceRelation ??
    previewPayload?.evidence?.urlscanEvidenceRelation ??
    "same_host";
  const fallbackFinalHostname =
    previewPayload?.evidence?.supplementalFinalHostname ??
    previewPayload?.evidence?.urlscanFinalHostname ??
    null;
  const fallbackObservedRequestCount = getFiniteNumber(fallbackEvidence?.metrics?.requestCount) ?? 0;
  const fallbackObservedDomainCount = getFiniteNumber(fallbackEvidence?.metrics?.domainCount) ?? 0;
  const fallbackObservedIpCount = getFiniteNumber(fallbackEvidence?.metrics?.ipCount) ?? 0;
  const vendorSurfaceProjection = buildReportSurfaceVendorProjection({
    rawThirdPartyDomains: getRecordStringArray(hybridVendorSummary, "rawThirdPartyDomains"),
    resolvedVendorNames: certScoreSummary.resolvedVendorNames,
    topObservedEntities: certScoreSummary.topObservedEntities,
    unresolvedVendorHosts: certScoreSummary.unresolvedVendorHosts,
    vendorCategoryCounts: certScoreSummary.vendorCategoryCounts
  });
  const executiveResolvedVendorNames = vendorSurfaceProjection.execSummary.resolvedVendorNames;
  const inventoryResolvedVendorNames = vendorSurfaceProjection.evidenceInventory.resolvedVendorNames;
  const executiveThirdPartyDomains = vendorSurfaceProjection.execSummary.thirdPartyDomains;
  const inventoryThirdPartyDomains = vendorSurfaceProjection.evidenceInventory.thirdPartyDomains;
  const executiveThirdPartyRequestCount = certScoreSummary.thirdPartyRequestCount;
  const executiveTopObservedEntities = vendorSurfaceProjection.execSummary.topObservedEntities;
  const inventoryTopObservedEntities = vendorSurfaceProjection.evidenceInventory.topObservedEntities;
  const executiveVendorCategoryCounts = vendorSurfaceProjection.execSummary.vendorCategoryCounts;
  const executiveTrackerSummary = certScoreSummary.trackerSummary;
  const executiveUnresolvedVendorHosts = vendorSurfaceProjection.execSummary.unresolvedVendorHosts;
  const executiveFingerprintReasons = uniqueStrings([
    ...getRecordStringArray(hybridFingerprintSummary, "reasons")
  ]);
  const executiveFingerprintCategories = getRecordObjectArray(hybridFingerprintSummary, "attributeCategories").map((row) => ({
    count: typeof row.count === "number" ? row.count : 0,
    firstSeenMs: typeof row.firstSeenMs === "number" ? row.firstSeenMs : null,
    name: typeof row.name === "string" ? row.name : "unknown"
  }));
  const shouldShowFingerprintingPanel =
    executiveFingerprintCategories.length > 0 ||
    executiveFingerprintReasons.length > 0 ||
    certScoreSummary.fingerprintLabel !== "None detected";
  const runtimeCookieInventory = buildRuntimeCookieInventory({
    hybridRuntimeEvidence,
    runtimeArtifacts
  });
  const cookieInventoryRows = runtimeCookieInventory.rows;
  const eligiblePreConsentStorageRows = cookieInventoryRows.filter(isEligibleNonEssentialPreconsentStorageMetricRow);
  const beforeConsentStorageClassificationUnresolved = hasUnresolvedNonEssentialPreconsentStorageEvidence(cookieInventoryRows);
  const promotionGradePreConsentStorageCount = cookieInventoryRows.filter(isEligibleNonEssentialPreconsentStorageRow).length;
  const cookiesBeforeConsentCount = cookieInventoryRows.length > 0
    ? eligiblePreConsentStorageRows.length
    : Math.max(
        getRecordNumber(hybridStorageSummary, "cookiesBeforeConsentCount") ?? 0,
        certScoreSummary.cookieNamesBeforeConsent.length,
        runtimeInitialCookieCount
      );
  const beforeConsentStorageScope = cookieInventoryRows.length > 0
    ? "nonessential_only" as const
    : "all_observed" as const;
  const trackerInventoryRows = buildTrackerInventoryRows({
    domains: inventoryThirdPartyDomains,
    firstPartyDomain: scanRecord.scan.domainHostname ?? certScoreSummary.requestedHost,
    preConsentVendors: certScoreSummary.preConsentVendorNames,
    resolvedVendors: inventoryResolvedVendorNames,
    sessionReplayVendors: certScoreSummary.sessionReplayVendorNames,
    trackerVendors: scanRecord.trackerVendors,
    topObservedEntities: inventoryTopObservedEntities,
    unresolvedHosts: executiveUnresolvedVendorHosts
  }).filter(isTimedPreConsentInventoryRow);
  const trackerPriorityRows = buildTrackerInventoryGroupRows(trackerInventoryRows).map((row) => ({
    domains: row.domains,
    firstSeenMs: row.firstSeenMs,
    party: row.party,
    priority: row.priority,
    purpose: row.purpose,
    requestCount: row.requestCount,
    regulatoryRelevance: row.regulatoryRelevance,
    vendor: row.vendor
  }));
  const reviewSectionError: string | null = null;
  const scanReportUnifiedFindingState = debugBuildScanReportUnifiedFindingState(scanRecord);
  const { taxonomySnapshotSections } = scanReportUnifiedFindingState.derivedContext;

  const preConsentTrackingObserved =
    snapshot?.preconsent_tracking_detected === true ||
    snapshot?.tracking_before_consent_detected === true ||
    hasTruthySignal(scanRecord.signals, "tracking_before_consent_detected") ||
    hasTruthySignal(scanRecord.signals, "preconsent_tracking_detected") ||
    hasTruthySignal(scanRecord.signals, "third_party_cookie_set_before_consent");
  const consentAuditCompleted = getRecordBoolean(runtimeArtifacts, "consent_audit_completed");
  const consentRejectInteractionSucceeded = getRecordBoolean(runtimeArtifacts, "consent_reject_interaction_succeeded");
  const consentAcceptInteractionSucceeded = getRecordBoolean(runtimeArtifacts, "consent_accept_interaction_succeeded");
  const consentRejectReducedTracking = runtimeArtifacts?.consent_reject_reduced_tracking;
  const consentRejectReducedThirdPartyCookies = runtimeArtifacts?.consent_reject_reduced_third_party_cookies;
  const consentBaselineCookieCount = getRecordNumber(runtimeArtifacts, "consent_baseline_cookie_count");
  const consentPostRejectCookieCount = getRecordNumber(runtimeArtifacts, "consent_post_reject_cookie_count");
  const consentPreconsentViolationCount = getRecordNumber(runtimeArtifacts, "consent_preconsent_violation_count");
  const consentBaselineTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
  const consentBaselineTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_vendor_names");
  const consentPostRejectTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_post_reject_tracker_vendor_names");
  const consentPostRejectTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_post_reject_tracker_evidence_urls");
  const consentRejectPersistedTrackerVendors = getRecordStringArray(
    runtimeArtifacts,
    "consent_reject_persisted_tracker_vendor_names"
  );
  const consentRejectNewTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_reject_new_tracker_vendor_names");
  const consentAcceptNewTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_accept_new_tracker_vendor_names");
  const consentPostAcceptTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_post_accept_tracker_evidence_urls");
  const buildPhaseSummaries = getRecordObjectArray(runtimeArtifacts, "build_phase_summaries").map((row) => ({
    attempts: typeof row.attempts === "number" ? row.attempts : null,
    completedAt: typeof row.completedAt === "string" ? row.completedAt : null,
    durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
    error: typeof row.error === "string" ? row.error : null,
    outcome: typeof row.outcome === "string" ? row.outcome : "unknown",
    phase: typeof row.phase === "string" ? row.phase : "unknown",
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null
  }));
  const privacyLegalSectionScore = averageNumbers([
    getFiniteNumber(snapshot?.privacy_score),
    getFiniteNumber(snapshot?.legal_coverage_score)
  ]);
  const cookieConsentSectionScore = getFiniteNumber(snapshot?.consent_score);
  const trackerSectionScore = averageNumbers([
    invertRiskScore(snapshot?.tracker_risk_score),
    invertRiskScore(snapshot?.data_collection_risk_score)
  ]);
  const preconsentSectionScore = derivePreconsentSectionScore({
    consentAuditCompleted,
    consentRejectReducedTracking,
    preConsentTrackingObserved,
    preconsentViolationCount: consentPreconsentViolationCount
  });
  const accessibilityConsumerSectionScore = averageNumbers([
    getFiniteNumber(snapshot?.accessibility_score),
    getFiniteNumber(snapshot?.consumer_protection_score)
  ]);
  const showHomepagePreviewGate = previewMode === "homepage" && Boolean(createAccountHref);
  const baseFindingEvidenceDiagnostics =
    snapshot && !reviewSectionError
      ? filterContradictoryPositiveSurfaceFindings(buildScanReportUnifiedFindingsFromState(scanReportUnifiedFindingState))
      : [];
  const supplementalRuntimeFindingDiagnostics = buildSupplementalRuntimeUnifiedFindingPackets(previewPayload);
  const findingEvidenceDiagnostics = filterContradictoryPositiveSurfaceFindings(mergeUnifiedFindingPacketsById([
    ...baseFindingEvidenceDiagnostics,
    ...supplementalRuntimeFindingDiagnostics
  ]));
  const shouldPreferCanonicalReview =
    findingEvidenceDiagnostics.length > 0 ||
    scanRecord.policyEnrichment.length > 0 ||
    scanRecord.preconsentViolations.length > 0 ||
    scanRecord.trackerVendors.length > 0;
  const executiveSummaryBadgeCounts = deriveExecutiveSummaryBadgeCounts(findingEvidenceDiagnostics);
  const coverageMicrocards = scanRecord.coverageMicrocards ?? [];
  const executiveFindingsProjection = projectExecutiveFindingsFromUnifiedPackets(findingEvidenceDiagnostics);
  const allExecutiveFindings = executiveFindingsProjection.findings;
  const executiveAccessLimitationNotice = selectExecutiveAccessLimitationNotice({
    allExecutiveFindings,
    notice: requestedExecutiveAccessLimitationNotice,
    topExecutiveFindings: executiveFindingsProjection.topFindings
  });
  const scanExecutionSummary = deriveScanExecutionSummary({
    accessibilityRuleCountTotal: scanRecord.accessibilityRuleCounts.length,
    authWallDetected: snapshot?.auth_wall_detected === true,
    blockedFlag: snapshot?.blocked_flag === true,
    captchaFlag: snapshot?.captcha_flag === true,
    consentAuditCompleted,
    consentPreconsentViolationCount,
    errorMessage: scanRecord.scan.errorMessage,
    events: scanRecord.events,
    homepageFetchHttpStatus: typeof snapshot?.homepage_fetch_http_status === "number" ? snapshot.homepage_fetch_http_status : null,
    homepageFetchStatus: typeof snapshot?.homepage_fetch_status === "string" ? snapshot.homepage_fetch_status : null,
    keyPageDiscoverySummary:
      runtimeArtifacts && typeof runtimeArtifacts === "object" ? (runtimeArtifacts.key_page_discovery_summary ?? null) : null,
    pagesRequested: scanRecord.scan.pagesRequested,
    pagesScanned: scanRecord.scan.pagesScanned,
    preconsentTrackingDetected: snapshot?.preconsent_tracking_detected === true,
    renderModeUsed: typeof snapshot?.render_mode_used === "string" ? snapshot.render_mode_used : null,
    robotsAllowed: snapshot?.robots_allowed === true ? true : snapshot?.robots_allowed === false ? false : null,
    robotsFetchHttpStatus: typeof snapshot?.robots_fetch_http_status === "number" ? snapshot.robots_fetch_http_status : null,
    robotsFetchStatus: typeof snapshot?.robots_fetch_status === "string" ? snapshot.robots_fetch_status : null,
    status: scanRecord.scan.status,
    timeoutFlag: snapshot?.timeout_flag === true,
    trackingBeforeConsentDetected: snapshot?.tracking_before_consent_detected === true,
    trackerEvidenceUrlCount: consentBaselineTrackerEvidenceUrls.length,
    wcagErrorCountTotal: getRecordNumber(snapshot, "wcag_error_count_total")
  });
  const isScanInFlight = scanRecord.scan.status === "queued" || scanRecord.scan.status === "running";
  const isScanFailed = scanRecord.scan.status === "failed";
  const isIncompleteScanCoverage = hasIncompleteScanCoverage(scanRecord);
  const executiveAccessNoticeCardProps = executiveAccessLimitationNotice
    ? {
        blockerLabel: executiveAccessLimitationNotice.review.blockerLabel,
        coverageLabel: executiveAccessLimitationNotice.review.coverageLabel,
        guidance: executiveAccessLimitationNotice.review.guidance,
        headline: "Public site access was limited during this scan",
        message: executiveAccessLimitationNotice.finding.shortSummary,
        recommendationTitle: executiveAccessLimitationNotice.review.recommendationTitle,
        reason: executiveAccessLimitationNotice.review.reason,
        title: executiveAccessLimitationNotice.review.title,
        whatThisMeans: executiveAccessLimitationNotice.review.whatThisMeans
      }
    : null;
  const showRegulatoryChecklistSection = shouldShowRegulatoryChecklistSection({
    executiveAccessLimitationNotice
  });
  const isNoGoReport = executiveAccessLimitationNotice?.finding.id === "scan_quality_visual_no_go";
  const executivePolicySurfaces = deriveExecutivePolicySurfaces(scanRecord.policyEnrichment, scanRecord.snapshot, runtimeArtifacts);
  const executiveScanInterruptions = deriveExecutiveScanInterruptions(scanRecord.snapshot, scanRecord.events);
  const executiveRuntimeMetricsReliable = scanRecord.snapshot?.runtime_counts_retained !== false;
  const executiveCoverageLevel =
    scanRecord.snapshot && hasMaterialHomepageAccessLimitation(scanRecord.snapshot)
      ? typeof scanRecord.snapshot.coverage_level === "string"
        ? scanRecord.snapshot.coverage_level
        : null
      : null;
  const executiveAccessibilitySignals = {
    accessibilityClaimMismatchDetected: getRecordBoolean(snapshot, "accessibility_claim_mismatch_detected"),
    accessibilityLitigationRiskScore: getRecordNumber(snapshot, "accessibility_litigation_risk_score"),
    accessibilityStatementPresent: getRecordBoolean(snapshot, "accessibility_statement_present"),
    adaDemandLetterProbability: getRecordNumber(snapshot, "ada_demand_letter_probability"),
    ecommerceSiteLikely: getRecordBoolean(snapshot, "ecommerce_site_likely"),
    wcagErrorCountTotal: getRecordNumber(snapshot, "wcag_error_count_total"),
    wcagFormLabelErrorCount: getRecordNumber(snapshot, "wcag_form_label_error_count"),
    wcagKeyboardNavigationIssueCount: getRecordNumber(snapshot, "wcag_keyboard_navigation_issue_count"),
    wcagMissingAltCount: getRecordNumber(snapshot, "wcag_missing_alt_count"),
    wcagViolations: scanRecord.accessibilityRuleExamples.map((example) => ({
      description: example.description,
      help: example.help,
      helpUrl: example.helpUrl,
      impact: example.impact,
      nodeCount: example.nodeCount,
      pageUrl: example.pageUrl,
      representativeSelectors: example.representativeSelectors,
      ruleCode: example.ruleCode,
      ruleGroup: example.ruleGroup,
      severity: example.severity
    }))
  };
  const gdprEprivacyCoverageChecklist = deriveSharedScanDetailGdprEprivacyCoverageChecklist({
    coverageLimited: Boolean(executiveAccessLimitationNotice) || isIncompleteScanCoverage,
    events: scanRecord.events,
    policyEnrichmentCount: scanRecord.policyEnrichment.length,
    projectedFindings: allExecutiveFindings,
    runtimeArtifacts,
    runtimeCookieRows: cookieInventoryRows,
    runtimeTrackerPriorityRows: trackerPriorityRows,
    scanCompleted: scanRecord.scan.status === "completed",
    snapshot,
    unifiedFindings: findingEvidenceDiagnostics
  });
  const reportableGdprEprivacyCoverageChecklist = getReportableGdprEprivacyCoverageItems(gdprEprivacyCoverageChecklist);
  const gdprEprivacyCoverageScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: reportableGdprEprivacyCoverageChecklist
  });
  const consentSurfaceCoverageItem = gdprEprivacyCoverageChecklist.find((item) => item.id === "consent_surface_observed");
  const executiveCookieBannerPresent =
    scanRecord.snapshot?.cookie_banner_present === true ||
    consentSurfaceCoverageItem?.status === "Observed"
      ? true
      : typeof scanRecord.snapshot?.cookie_banner_present === "boolean"
        ? scanRecord.snapshot.cookie_banner_present
        : null;
  const browserCoverageSufficient =
    scanRecord.scan.scanType !== "browser_extension" ||
    (scanRecord.snapshot?.privacy_policy_present === true && scanRecord.snapshot?.https_enforced === true);
  const criticalCoverageComplete = getRecordOptionalBoolean(
    scanRecord.snapshot,
    "critical_coverage_complete",
  );
  const storedCustomerGdprEprivacyAssessment = scanRecord.customerGdprEprivacyScoreSelection?.assessment ?? null;
  const executiveDisplayedScore = browserCoverageSufficient && criticalCoverageComplete !== false
    ? storedCustomerGdprEprivacyAssessment
      ? storedCustomerGdprEprivacyAssessment.scoreValue
      : gdprEprivacyCoverageScore.score
    : null;
  const regulatoryGapTopFindings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      rows: reportableGdprEprivacyCoverageChecklist.map((item) => {
        const checklistDescriptor = deriveGdprEprivacyCoverageChecklistRowRationale(item);
        return {
          ...item,
          assessmentDirection: getAssessmentDirection(item),
          criticalEvidence: {
            ...item.criticalEvidence,
            statusBasis: checklistDescriptor
          },
          evidenceLabel: getEvidenceLabel(item),
          note: checklistDescriptor
        };
      }),
      title: "GDPR / ePrivacy"
    }
  });
  const regulatoryGapTopFindingIds = new Set(regulatoryGapTopFindings.map((finding) => finding.id));
  const allExecutiveFindingsWithRegulatoryGaps = executiveAccessLimitationNotice
    ? allExecutiveFindings
    : [
        ...regulatoryGapTopFindings,
        ...allExecutiveFindings.filter((finding) => !regulatoryGapTopFindingIds.has(finding.id))
      ];
  const topExecutiveFindings = executiveAccessLimitationNotice
    ? [executiveAccessLimitationNotice.finding]
    : regulatoryGapTopFindings;
  const scanCalibrationSummary = buildScanCalibrationSummary({
    accessLimitationNotice: executiveAccessNoticeCardProps,
    beforeConsentCookieCount: cookiesBeforeConsentCount,
    coverageLevel: executiveCoverageLevel,
    domain: scanRecord.scan.domainHostname,
    domainBenchmark: scanRecord.domainBenchmark,
    finalHost: certScoreSummary.finalHost,
    legalCoverageScore: getFiniteNumber(scanRecord.snapshot?.legal_coverage_score),
    pagesScanned: getFiniteNumber(scanRecord.snapshot?.pages_scanned) ?? scanRecord.scan.pagesScanned,
    policySurfaces: executivePolicySurfaces,
    policyEnrichmentCount: scanRecord.policyEnrichment.length,
    posture: executiveAccessLimitationNotice ? "Watch" : executiveFindingsProjection.posture,
    requestedHost: certScoreSummary.requestedHost,
    scanId: scanRecord.scan.id,
    scanInterruptions: executiveScanInterruptions,
    scanOutcome: typeof scanRecord.snapshot?.scan_outcome === "string" ? scanRecord.snapshot.scan_outcome : null,
    status: scanRecord.scan.status,
    thirdPartyDomains: executiveThirdPartyDomains,
    thirdPartyRequestCount: executiveThirdPartyRequestCount,
    topFindings: topExecutiveFindings,
    coverageStatusCards: executiveAccessLimitationNotice ? [executiveAccessLimitationNotice.finding] : [],
    vendorCount: executiveResolvedVendorNames.length + executiveUnresolvedVendorHosts.length,
    verifiedPublicSurfacesCount: getFiniteNumber(scanRecord.snapshot?.verified_public_surfaces_count)
  });
  const regulatoryLensCounts = {
    beforeConsentCookieCount: promotionGradePreConsentStorageCount,
    thirdPartyRequestCount: executiveThirdPartyRequestCount
  };
  const regulatoryLensOptions = {
    accessibilitySignals: executiveAccessibilitySignals,
    agencyMappings: scanRecord.agencyMappings,
    benchmarkIndustry: scanRecord.domainBenchmark?.industry ?? null,
    regulatoryRisk: scanRecord.regulatoryRisk
  };
  const executiveRegulatoryLenses = buildRegulatoryLensesFromUnifiedPackets(
    findingEvidenceDiagnostics,
    regulatoryLensCounts,
    regulatoryLensOptions
  );
  const regulatoryChecklistUnifiedFindings = filterContradictoryPositiveSurfaceFindings(mergeUnifiedFindingPacketsById([
    ...scanReportUnifiedFindingState.globalUnifiedFindings,
    ...findingEvidenceDiagnostics
  ]));
  const betaRegulatoryFindingSources = buildBetaRegulatoryFindingSources({
    executiveFindings: allExecutiveFindings,
    unifiedFindings: regulatoryChecklistUnifiedFindings
  });
  const betaRegulatoryChecklistAreas = buildBetaRegulatoryChecklistAreas(
    executiveRegulatoryLenses,
    betaRegulatoryFindingSources
  );
  const gdprEprivacyExecutiveLens =
    executiveRegulatoryLenses.find((lens) => lens.acronym === "GDPR / ePrivacy") ?? null;
  const scanDurationMs =
    getRuntimeArtifactNumber(scanRecord.runtimeArtifacts, "local_v2_dag_scan_core_duration_ms") ??
    scanRecord.scan.durationMs;
  const executiveTimelineEvents = buildExecutiveTimelineEvents(scanRecord.runtimeArtifacts);
  const scanTimeLabel = formatScanTimeLabel({
    completedAt: scanRecord.scan.completedAt,
    createdAt: scanRecord.scan.createdAt,
    durationMs: scanDurationMs,
    startedAt: scanRecord.scan.startedAt
  });
  const scanReadyTimeLabel = formatScanReadyTimeLabel({
    completedAt: scanRecord.scan.completedAt,
    createdAt: scanRecord.scan.createdAt,
    startedAt: scanRecord.scan.startedAt
  });
  const scanTimeDetailLabel =
    scanRecord.scan.scanType === "browser_extension" && scanTimeLabel
      ? `scan time: ${scanTimeLabel}`
      : scanReadyTimeLabel
        ? `scan time: ${scanReadyTimeLabel}`
        : scanTimeLabel
          ? `scan time: ${scanTimeLabel}`
          : null;

  return (
    <div className="min-w-0 overflow-x-hidden space-y-8">
      {scanRecord.scan.status === "completed" ? (
        <ScanCompletedEvent scanSource={analyticsScanSource} domain={scanRecord.scan.domainHostname ?? null} />
      ) : null}
      <script
        type="application/json"
        data-testid="scan-calibration-summary"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(scanCalibrationSummary).replace(/</g, "\\u003c")
        }}
      />
      <script
        type="application/json"
        data-testid="scan-surfacing-trace"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(compactEvidenceJsonForDisplay(executiveFindingsProjection.trace)).replace(/</g, "\\u003c")
        }}
      />
      <ScanPageHeader
        actions={headerActions}
        actionsPlacement={headerActionsPlacement}
        autoRefresh={autoRefresh}
        createdAtLabel={
          <>
            Created <ViewerTimestamp value={scanRecord.scan.createdAt} />
            {scanTimeDetailLabel ? (
              <>
                {" "}
                <span>({scanTimeDetailLabel})</span>
              </>
            ) : null}
            {createdAtInfoTip ? (
              <InfoTip
                align="end"
                className="ml-1 -translate-y-1 align-middle"
                placement="bottom"
                text={createdAtInfoTip}
              />
            ) : null}
          </>
        }
        statusLabel={isIncompleteScanCoverage ? "Limited" : undefined}
        statusTone={isIncompleteScanCoverage ? "info" : undefined}
        leadingBadges={showRegulatoryChecklistSection ? (
          <span className="inline-flex shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
            Beta
          </span>
        ) : null}
        scanFromLabel={scanRecord.scan.scanFromLabel}
        scanFromValue={scanRecord.scan.scanFromValue}
        status={scanRecord.scan.status}
        title={
          <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="break-words">Scan: {scanRecord.scan.domainHostname ?? "Unknown website"}</span>
            <InfoTip
              align="start"
              className="translate-y-0.5 align-middle"
              placement="bottom"
              text={`scan_id: ${scanRecord.scan.id}`}
            />
          </span>
        }
      />
      {isScanInFlight ? (
        localV2DagInFlightProgress ?? (
          <FullScanProgressCard
            buildPhaseSummaries={buildPhaseSummaries}
            createdAt={scanRecord.scan.createdAt}
            events={scanRecord.events}
            executionSummary={scanRecord.scan.executionSummary}
            scanId={scanRecord.scan.id}
            status={scanRecord.scan.status}
          />
        )
      ) : null}
      {previewNotice}
      {!isScanInFlight ? (
        <>
          {isScanFailed ? (
            <section className="rounded-[1.4rem] border border-rose-200 bg-rose-50/60 px-6 py-5">
              <div className="flex items-start gap-3">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-rose-900">Scan failed</p>
                  <p className="text-sm leading-6 text-rose-800">
                    {scanRecord.scan.errorMessage ?? "This scan could not be completed. No results are available."}
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <>
              <ExecutiveSummaryCard
                accessLimitationNotice={executiveAccessNoticeCardProps}
                allFindings={allExecutiveFindingsWithRegulatoryGaps}
                accessibilitySignals={executiveAccessibilitySignals}
            agencyMappings={scanRecord.agencyMappings}
            beforeConsentCookieCount={cookiesBeforeConsentCount}
            beforeConsentStorageMetricAvailable={!beforeConsentStorageClassificationUnresolved}
            beforeConsentStorageScope={beforeConsentStorageScope}
            coverageDiagnosticIndicators={scanCalibrationSummary.coverage.diagnosticIndicators}
            coverageMicrocards={coverageMicrocards}
            coverageLevel={executiveCoverageLevel}
            cmpVendorName={typeof scanRecord.snapshot?.cmp_vendor_name === "string" ? scanRecord.snapshot.cmp_vendor_name : null}
            cookieBannerPresent={executiveCookieBannerPresent}
            domainBenchmark={scanRecord.domainBenchmark}
            externalCoverageContextAvailable={Boolean(fallbackEvidence)}
            finalHost={certScoreSummary.finalHost}
            fingerprintReasons={executiveFingerprintReasons}
            fingerprintLabel={certScoreSummary.fingerprintLabel}
            fingerprintNarrative={certScoreSummary.fingerprintNarrative}
            landedOnDifferentHost={certScoreSummary.landedOnDifferentHost}
            lastScannedAt={certScoreSummary.lastScannedAt}
            posture={executiveAccessLimitationNotice ? "Watch" : executiveFindingsProjection.posture}
            preConsentVendorNames={certScoreSummary.preConsentVendorNames}
            requestedHost={certScoreSummary.requestedHost}
            regulatoryRisk={scanRecord.regulatoryRisk}
            resolvedVendorNames={executiveResolvedVendorNames}
            score={executiveDisplayedScore}
            scoreLabel={`${scanRecord.customerGdprEprivacyScoreSelection?.label ?? "GDPR/ePrivacy evidence"} score`}
            scanDurationMs={scanDurationMs}
            scanOutcome={typeof scanRecord.snapshot?.scan_outcome === "string" ? scanRecord.snapshot.scan_outcome : null}
            scanTimelineEvents={executiveTimelineEvents}
            sessionReplayVendorNames={certScoreSummary.sessionReplayVendorNames}
            status={scanRecord.scan.status}
            thirdPartyRequestCount={executiveThirdPartyRequestCount}
            thirdPartyDomains={executiveThirdPartyDomains}
            topFindings={topExecutiveFindings}
            topObservedEntities={executiveTopObservedEntities}
            trackerSummary={executiveTrackerSummary}
            unifiedFindings={findingEvidenceDiagnostics}
            unresolvedVendorHosts={executiveUnresolvedVendorHosts}
            vendorCategoryCounts={executiveVendorCategoryCounts}
            legalCoverageScore={getFiniteNumber(scanRecord.snapshot?.legal_coverage_score)}
            pagesScanned={getFiniteNumber(scanRecord.snapshot?.pages_scanned) ?? scanRecord.scan.pagesScanned}
            policyEnrichmentCount={scanRecord.policyEnrichment.length}
            policySurfaces={executivePolicySurfaces}
            runtimeMetricsReliable={executiveRuntimeMetricsReliable}
            scanInterruptions={executiveScanInterruptions}
            showFingerprintingSnapshot={signalSnapshotVisibility?.showFingerprinting ?? true}
            showReviewLenses={canViewSignalSnapshotReviewLenses}
            showScanInterruptionSnapshot={signalSnapshotVisibility?.showScanInterruption ?? true}
            showProtectedRouteInterruptions={showAdvancedDiagnostics}
            verifiedPublicSurfacesCount={getFiniteNumber(scanRecord.snapshot?.verified_public_surfaces_count)}
          />
          {showBrowserExtensionRecovery && executiveAccessLimitationNotice?.finding.id === "scan_quality_visual_no_go" ? (
            <NoGoBrowserExtensionRecovery
              isTargetSiteState={executiveAccessLimitationNotice.review.coverageLabel === "Observed target-site state"}
            />
          ) : null}
          {isNoGoReport ? null : (
            <RuntimeInventoryTable
              cookieRows={cookieInventoryRows}
              firstPartyDomain={scanRecord.scan.domainHostname ?? certScoreSummary.requestedHost}
              trackerRows={trackerInventoryRows}
            />
          )}
          {showRegulatoryChecklistSection ? (
            <RegulatoryChecklistSection
              headingLabel="GDPR / ePrivacy Evidence Checklist"
              headingTrailing={<GdprEprivacyCoverageSummaryPills items={reportableGdprEprivacyCoverageChecklist} />}
              showAdvancedEvidenceToggle
              tabs={[
                {
                  content: (
                    <GdprEprivacyCoverageChecklistCard
                      defaultOpen
                      gdprEprivacyLens={gdprEprivacyExecutiveLens}
                      items={gdprEprivacyCoverageChecklist}
                      showSummaryStrip={false}
                    />
                  ),
                  id: "gdpr-eprivacy",
                  label: "GDPR / ePrivacy",
                  shortLabel: "GDPR/ePrivacy"
                },
              ]}
            />
          ) : null}
          
        </>
          )}
        </>
      ) : null}
    </div>
  );
}
