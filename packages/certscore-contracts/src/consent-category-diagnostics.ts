import type {ConsentConfirmationDiagnostics} from "./consent-confirmation-diagnostics";

export type ConsentCategoryDiagnosticState = "supported" | "no_optional_categories" | "unsupported" | "unknown";
export type ConsentCategoryDiagnosticResult = {
  state: ConsentCategoryDiagnosticState;
  conflictingObservations: boolean;
  reasonsTruncated: boolean | null;
};
export type ConsentCategoryDiagnostics = {
  policyVersion: "consent_category_diagnostics.v1";
  diagnosticOnly: true;
  source: "retained_reason_inventory";
  aggregate: ConsentCategoryDiagnosticResult;
  initial: ConsentCategoryDiagnosticResult | null;
  terminal: ConsentCategoryDiagnosticResult | null;
};

const supported = new Set(["category_applicability_verified", "category_exclusion_unneeded"]);
const unsupported = new Set(["category_hierarchy_unsupported", "category_iab_unsupported",
  "category_type_unsupported", "category_required_excluded"]);

/** Retained diagnostic observations, never category/choice proof or chronology.
 * Malformed, unresolved and unrecognized inputs cannot establish unsupported
 * capability. A reason inventory cannot order conflicting observations. */
export function classifyConsentCategoryReasons(reasons: readonly string[], reasonsTruncated: boolean | null): ConsentCategoryDiagnosticResult {
  const states = new Set<ConsentCategoryDiagnosticState>();
  for (const reason of reasons) {
    if (!reason.startsWith("category_")) continue;
    states.add(supported.has(reason) ? "supported" : reason === "category_no_optional" ? "no_optional_categories"
      : unsupported.has(reason) ? "unsupported" : "unknown");
  }
  const conflictingObservations = states.size > 1;
  return {state: reasonsTruncated === true || conflictingObservations ? "unknown" : [...states][0] ?? "unknown",
    conflictingObservations, reasonsTruncated};
}

export function assessConsentCategoryDiagnostics(diagnostics: ConsentConfirmationDiagnostics | undefined): ConsentCategoryDiagnostics {
  const phased = diagnostics && "initialReasons" in diagnostics ? diagnostics : undefined;
  const truncated = phased?.reasonsTruncated ?? null;
  return {policyVersion: "consent_category_diagnostics.v1", diagnosticOnly: true, source: "retained_reason_inventory",
    aggregate: classifyConsentCategoryReasons(diagnostics?.reasons ?? [], truncated),
    initial: phased ? classifyConsentCategoryReasons(phased.initialReasons, truncated) : null,
    terminal: phased ? classifyConsentCategoryReasons(phased.terminalReasons, truncated) : null};
}
