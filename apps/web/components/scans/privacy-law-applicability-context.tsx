import React from "react";

export type PrivacyLawApplicabilityKind = "ccpa_cpra" | "gdpr_eprivacy" | "cipa";

const APPLICABILITY_ASSUMPTIONS_TOOLTIP =
  "Applicability can depend on business facts or visitor geography CertScore.ai has not verified.";

function getApplicabilityChipLabel(kind: PrivacyLawApplicabilityKind) {
  switch (kind) {
    case "ccpa_cpra":
      return "Applicability unverified";
    case "gdpr_eprivacy":
      return "Jurisdiction unverified";
    case "cipa":
      return "Conduct review";
  }
}

function getApplicabilityChipTooltip(kind: PrivacyLawApplicabilityKind) {
  switch (kind) {
    case "ccpa_cpra":
      return "Applicability unverified. CCPA/CPRA can depend on revenue, California volume, or selling/sharing activity.";
    case "gdpr_eprivacy":
      return "Jurisdiction unverified. GDPR/ePrivacy can depend on EU/EEA presence, targeting, or monitoring.";
    case "cipa":
      return "Conduct review. CertScore.ai reports observed CIPA-style signals, not legal applicability.";
  }
}

function ApplicabilityLawIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
      <path d="M12 3.75v15.5" />
      <path d="M8.5 19.25h7" />
      <path d="M6.5 21h11" />
      <path d="M5.25 7.25h13.5" />
      <path d="M7.25 7.25 4.75 13" />
      <path d="m7.25 7.25 2.5 5.75" />
      <path d="M3.75 13h7" />
      <path d="M16.75 7.25 14.25 13" />
      <path d="m16.75 7.25 2.5 5.75" />
      <path d="M13.25 13h7" />
    </svg>
  );
}

export function ApplicabilityAssumptionsNote() {
  return (
    <span className="group/applicability relative inline-flex shrink-0">
      <span
        role="img"
        tabIndex={0}
        aria-label="Privacy-law applicability context"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 outline-none transition-colors hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-1"
      >
        <ApplicabilityLawIcon />
      </span>
      <span className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium normal-case leading-5 tracking-normal text-slate-600 shadow-lg group-hover/applicability:block group-focus-within/applicability:block">
        {APPLICABILITY_ASSUMPTIONS_TOOLTIP}
      </span>
    </span>
  );
}

export function ApplicabilityChip(input: {
  kind: PrivacyLawApplicabilityKind;
}) {
  const label = getApplicabilityChipLabel(input.kind);

  return (
    <span className="group/applicability-chip relative inline-flex shrink-0 align-middle">
      <span
        role="img"
        tabIndex={0}
        aria-label={label}
        className="inline-flex h-[22px] w-6 items-center justify-center rounded-full text-slate-400 outline-none transition-colors hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-1"
      >
        <ApplicabilityLawIcon />
      </span>
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium normal-case leading-5 tracking-normal text-slate-600 shadow-lg group-hover/applicability-chip:block group-focus-within/applicability-chip:block">
        {getApplicabilityChipTooltip(input.kind)}
      </span>
    </span>
  );
}
