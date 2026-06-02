import { cn } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { EvidenceJsonBlock } from "./evidence-json-block";
import type {
  GdprEprivacyCoverageChecklistItem,
  GdprEprivacyCoverageChecklistStatus
} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import {
  deriveGdprEprivacyEvidenceCard,
  deriveGdprEprivacyReviewSummary,
  getGdprEprivacyCustomerLabel,
  type GdprEprivacyEvidenceCard
} from "../../lib/scans/gdpr-eprivacy-review-summary";

type GdprEprivacyCoverageChecklistCardProps = {
  defaultOpen?: boolean;
  gdprEprivacyLens?: {
    ratingLabel: string;
    score: number | null;
    summary?: string;
    toneClass: string;
  } | null;
  items: GdprEprivacyCoverageChecklistItem[];
};

function getStatusBadgeClasses(status: GdprEprivacyCoverageChecklistStatus) {
  switch (status) {
    case "Gap observed":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "Review signal":
      return "border-indigo-200 bg-indigo-50 text-indigo-900";
    case "Insufficient evidence":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "Observed":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "Not testable":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "Out of scope":
      return "border-slate-200 bg-white text-slate-600";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

function getStatusDotClasses(status: GdprEprivacyCoverageChecklistStatus) {
  switch (status) {
    case "Gap observed":
      return "bg-amber-500";
    case "Review signal":
      return "bg-indigo-500";
    case "Insufficient evidence":
      return "bg-violet-500";
    case "Observed":
      return "bg-sky-500";
    case "Not testable":
      return "bg-slate-400";
    case "Out of scope":
      return "bg-slate-200";
    default:
      return "bg-emerald-500";
  }
}

function getStatusSegmentClasses(status: GdprEprivacyCoverageChecklistStatus) {
  switch (status) {
    case "Gap observed":
      return "bg-amber-500";
    case "Review signal":
      return "bg-indigo-500";
    case "Insufficient evidence":
      return "bg-violet-500";
    case "Observed":
      return "bg-sky-500";
    case "Not testable":
      return "bg-slate-400";
    case "Out of scope":
      return "bg-slate-200";
    default:
      return "bg-emerald-500";
  }
}

function getCoverageIconMeta(status: GdprEprivacyCoverageChecklistStatus) {
  switch (status) {
    case "Observed":
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: "check" as const,
        label: "Checked",
        tooltip: "Automated evidence was retained for this coverage area in the tested public-web context."
      };
    case "Not observed":
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: "check" as const,
        label: "Checked",
        tooltip: "The scan retained enough context for this row and did not observe an eligible issue. This is not a compliance determination."
      };
    case "Gap observed":
      return {
        className: "border-rose-200 bg-rose-50 text-rose-700",
        icon: "alert" as const,
        label: "Needs review",
        tooltip: "Canonical evidence projected a gap for this row. Review the retained evidence before drawing conclusions."
      };
    case "Review signal":
      return {
        className: "border-indigo-200 bg-indigo-50 text-indigo-700",
        icon: "flag" as const,
        label: "Needs review",
        tooltip: "Canonical evidence projected a review signal. This needs human review, not automatic pass/fail treatment."
      };
    case "Insufficient evidence":
      return {
        className: "border-violet-200 bg-violet-50 text-violet-700",
        icon: "question" as const,
        label: "Needs evidence",
        tooltip: "Some canonical evidence exists, but required source signals or report projection gates are incomplete."
      };
    case "Not testable":
      return {
        className: "border-slate-300 bg-slate-100 text-slate-600",
        icon: "slash" as const,
        label: "Not testable",
        tooltip: "The retained public-web scan context did not support testing this coverage area."
      };
    case "Out of scope":
      return {
        className: "border-slate-200 bg-white text-slate-500",
        icon: "dash" as const,
        label: "Out of scope",
        tooltip: "This coverage area is outside the automated public-web scan context."
      };
    default:
      return {
        className: "border-slate-200 bg-white text-slate-600",
        icon: "question" as const,
        label: "Review",
        tooltip: "Review the retained evidence for this coverage area."
      };
  }
}

function CoverageStatusGlyph({ status }: { status: GdprEprivacyCoverageChecklistStatus }) {
  const meta = getCoverageIconMeta(status);
  return (
    <span className="group/coverage-icon relative inline-flex">
      <span
        aria-label={meta.label}
        title={meta.tooltip}
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
          meta.className
        )}
      >
        <CoverageStatusIcon icon={meta.icon} />
      </span>
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-normal leading-4 text-slate-600 shadow-lg group-hover/coverage-icon:block">
        {meta.tooltip}
      </span>
    </span>
  );
}

function CoverageStatusIcon({ icon }: { icon: ReturnType<typeof getCoverageIconMeta>["icon"] }) {
  if (icon === "check") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M5 10.4 8.3 13.7 15 6.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (icon === "alert") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M10 4.2 17 16H3L10 4.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M10 8.2v3.8M10 14.8h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (icon === "flag") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M6 16V4.8M6 5.2h8.5l-1.4 3 1.4 3H6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "slash") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="m5.2 14.8 9.6-9.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "dash") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M5.5 10h9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="M7.7 7.4a2.5 2.5 0 1 1 3.8 2.2c-.9.5-1.5 1.1-1.5 2.1v.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M10 15h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function getEvidenceJson(item: GdprEprivacyCoverageChecklistItem) {
  return {
    coverageArea: item.label,
    status: item.status,
    ...item.criticalEvidence
  };
}

function stringifyEvidenceJson(item: GdprEprivacyCoverageChecklistItem) {
  return JSON.stringify(
    getEvidenceJson(item),
    (_key, value) => typeof value === "bigint" ? value.toString() : value,
    2
  );
}

function humanizeEvidenceToken(value: string) {
  return value
    .replace(/^Evidence flag:\s*/i, "Evidence: ")
    .replace(/^Evidence strength:\s*/i, "Confidence: ")
    .replace(/[_:]+/g, " ")
    .replace(/\bprivacy\b/gi, "privacy")
    .replace(/\s+/g, " ")
    .trim();
}

function getDisplayEvidenceRefs(item: GdprEprivacyCoverageChecklistItem) {
  return item.evidenceRefs.map(humanizeEvidenceToken).slice(0, 6);
}

function InlineList({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <span className="text-slate-400">Not retained in this packet</span>;
  }

  return <>{values.join(", ")}</>;
}

function EvidenceCard({ card }: { card: GdprEprivacyEvidenceCard }) {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">What CertScore observed</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">{card.whatCertScoreObserved}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Evidence type</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">{card.evidenceType.join("; ")}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Observed vendors</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            <InlineList values={card.observedVendors} />
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Observed domains</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            <InlineList values={card.observedDomains} />
          </p>
        </div>
      </div>
      {card.interactionPath || card.policyDisclosureComparison ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {card.interactionPath ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Interaction path</p>
              <p className="mt-1 text-xs leading-5 text-slate-700">{card.interactionPath}</p>
            </div>
          ) : null}
          {card.policyDisclosureComparison ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Policy/disclosure comparison</p>
              <p className="mt-1 text-xs leading-5 text-slate-700">{card.policyDisclosureComparison}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Why this matters</p>
        <p className="mt-1 text-xs leading-5 text-slate-700">{card.whyThisMatters}</p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Human verification</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
            {card.humanVerificationSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Limits</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">{card.limits}</p>
        </div>
      </div>
    </div>
  );
}

const STATUS_ORDER: GdprEprivacyCoverageChecklistStatus[] = [
  "Gap observed",
  "Review signal",
  "Observed",
  "Not observed",
  "Insufficient evidence",
  "Not testable",
  "Out of scope"
];

export function GdprEprivacyCoverageChecklistCard({
  defaultOpen = false,
  gdprEprivacyLens,
  items
}: GdprEprivacyCoverageChecklistCardProps) {
  const statusCounts = STATUS_ORDER.map((status) => ({
    count: items.filter((item) => item.status === status).length,
    status
  })).filter((entry) => entry.count > 0);
  const notTestableCount = items.filter((item) => item.status === "Not testable").length;
  const reviewCount = items.filter((item) =>
    item.status === "Gap observed" || item.status === "Review signal" || item.status === "Insufficient evidence"
  ).length;
  const gdprScore = typeof gdprEprivacyLens?.score === "number" ? gdprEprivacyLens.score : null;
  const gdprRatingLabel = gdprEprivacyLens?.ratingLabel ?? "Not scored";
  const reviewSummary = deriveGdprEprivacyReviewSummary(items);

  return (
    <CollapsibleSectionCard
      defaultOpen={defaultOpen}
      title="GDPR / ePrivacy coverage checklist"
      subtitle="Public-web signals CertScore checked during this scan. Lack of a finding does not necessarily mean compliance; some areas may be not observed, not testable, or out of scope."
      contentClassName="space-y-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(13rem,0.45fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">GDPR / ePrivacy</p>
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                gdprEprivacyLens?.toneClass ?? "border-slate-200 bg-slate-50 text-slate-600"
              )}
            >
              {gdprRatingLabel}
            </span>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-normal text-slate-950">{gdprScore ?? "—"}</span>
            <span className="pb-1 text-sm font-medium text-slate-500">score</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">{gdprEprivacyLens?.summary ?? "Aligned with the executive summary review lens."}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Review items</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{reviewCount}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Not testable</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{notTestableCount}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Rows checked</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{items.length}</p>
            </div>
          </div>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {statusCounts.map(({ count, status }) => (
              <div
                key={status}
                className={cn("h-full", getStatusSegmentClasses(status))}
                style={{ width: `${(count / items.length) * 100}%` }}
                title={`${status}: ${count}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {statusCounts.map(({ count, status }) => (
              <div key={status} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={cn("h-2 w-2 rounded-full", getStatusDotClasses(status))} />
                <span>{status}</span>
                <span className="font-medium text-slate-950">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">GDPR / ePrivacy review summary</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{reviewSummary.coverageText} {reviewSummary.priorityReviewText}</p>
          </div>
        </div>
        {reviewSummary.bullets.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {reviewSummary.bullets.map((bullet) => (
              <li key={bullet.id} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
                <p className="text-sm font-semibold text-slate-950">{bullet.headline}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{bullet.copy}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm leading-6 text-slate-600">
            No priority GDPR / ePrivacy story pattern was projected from the retained checklist evidence.
          </p>
        )}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">What to verify</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
              {reviewSummary.whatToVerify.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Suggested remediation</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
              {reviewSummary.suggestedRemediation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">{reviewSummary.limits}</p>
      </section>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
          <span>Coverage area</span>
          <span className="hidden md:block">Scan-context note</span>
        </div>
        <div className="divide-y divide-slate-200">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-1 gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex items-start gap-3">
                  <CoverageStatusGlyph status={item.status} />
                  <div className="min-w-0 space-y-2">
                    <p className="font-medium text-slate-950">{getGdprEprivacyCustomerLabel(item)}</p>
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                        getStatusBadgeClasses(item.status)
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 md:hidden">{item.explanation}</p>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="hidden text-sm leading-6 text-slate-600 md:block">{item.explanation}</p>
                {item.evidenceRefs.length > 0 ? (
                  <p className="text-xs leading-5 text-slate-500">
                    Evidence reference{item.evidenceRefs.length === 1 ? "" : "s"}: {getDisplayEvidenceRefs(item).join(", ")}
                  </p>
                ) : null}
                {item.limitation ? <p className="text-xs leading-5 text-slate-500">{item.limitation}</p> : null}
                <EvidenceCard card={deriveGdprEprivacyEvidenceCard(item)} />
                <details className="mt-2 rounded-md border border-slate-200 bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Advanced evidence JSON
                  </summary>
                  <EvidenceJsonBlock
                    payload={stringifyEvidenceJson(item)}
                    className="rounded-none border-t border-slate-800"
                    preClassName="max-h-72 px-3 py-3 pr-12 font-mono text-[11px] leading-5"
                  />
                </details>
              </div>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSectionCard>
  );
}
