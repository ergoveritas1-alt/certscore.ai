import type { AccessPostureClass, RecoverableFindingClass, ScanExecutionTier } from "@website-signal-risk-scanner/shared";

type AccessPosturePresentationInput = {
  accessPostureClass?: AccessPostureClass | null;
  highestSuccessfulTier?: ScanExecutionTier | null;
  stopTier?: ScanExecutionTier | null;
  totalSignals?: number | null;
  pagesScanned?: number | null;
  recoverableFindingClasses?: RecoverableFindingClass[] | null;
};

export type AccessPosturePresentation = {
  label: string | null;
  reason: string | null;
};

function formatTierLabel(value: ScanExecutionTier | null | undefined) {
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

function formatFindingClass(value: RecoverableFindingClass) {
  switch (value) {
    case "access_surface":
      return "access surface";
    case "privacy_surface":
      return "privacy surface";
    case "cmp_presence":
      return "CMP presence";
    case "initial_tracking":
      return "initial tracking";
    case "initial_storage":
      return "initial storage";
    case "implicit_consent_state":
      return "implicit consent state";
    case "privacy_choice_surface":
      return "privacy choice surface";
    case "preferences_ui_exposure":
      return "preferences UI exposure";
    case "consent_effectiveness":
      return "consent effectiveness";
    case "policy_runtime_contradiction":
      return "policy/runtime contradiction";
    default:
      return value;
  }
}

export function deriveAccessPosturePresentation(input: AccessPosturePresentationInput): AccessPosturePresentation {
  const highestSuccessfulTier = formatTierLabel(input.highestSuccessfulTier);
  const stopTier = formatTierLabel(input.stopTier);
  const totalSignals = typeof input.totalSignals === "number" ? input.totalSignals : null;
  const pagesScanned = typeof input.pagesScanned === "number" ? input.pagesScanned : null;
  const recoverableFindingClasses = (input.recoverableFindingClasses ?? []).slice(0, 3).map(formatFindingClass);

  switch (input.accessPostureClass) {
    case "early_loss":
      return {
        label: "Blocked early",
        reason:
          stopTier
            ? `Site protections limited the scan before meaningful public evidence was retained. The run stopped at ${stopTier}.`
            : "Site protections limited the scan before meaningful public evidence was retained."
      };
    case "degraded_but_useful":
      return {
        label: "Completed with access limitations",
        reason:
          totalSignals !== null && pagesScanned !== null
            ? `The scan still retained ${totalSignals} signals across ${pagesScanned} pages before deeper access was limited${highestSuccessfulTier ? ` after ${highestSuccessfulTier}` : ""}.`
            : highestSuccessfulTier
              ? `The scan retained meaningful evidence before deeper access was limited after ${highestSuccessfulTier}.`
              : "The scan retained meaningful evidence before deeper access was limited."
      };
    case "robots_limited":
      return {
        label: "Robots-limited",
        reason:
          recoverableFindingClasses.length > 0
            ? `Scanner access was limited by robots or scanner policy. Recoverable coverage remained in ${recoverableFindingClasses.join(", ")}.`
            : "Scanner access was limited by robots or scanner policy."
      };
    case "tolerant":
      return {
        label: null,
        reason: null
      };
    default:
      return {
        label: null,
        reason: null
      };
  }
}
