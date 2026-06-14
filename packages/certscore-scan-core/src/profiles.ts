import type { ScanProfile } from "@certscore/contracts";

export const scanProfiles: Record<ScanProfile["profileId"], ScanProfile> = {
  tiny: {
    profileId: "tiny",
    label: "Tiny pre-consent runtime scan",
    targetDurationMs: 12_000,
    internalBudgetMs: 15_000,
    enabledModules: ["preConsentRuntimeScanner"],
  },
  quick: {
    profileId: "quick",
    label: "Quick pre-consent runtime scan",
    targetDurationMs: 12_000,
    internalBudgetMs: 15_000,
    enabledModules: ["preConsentRuntimeScanner"],
  },
  policy: {
    profileId: "policy",
    label: "Policy-surface scan",
    targetDurationMs: 15_000,
    internalBudgetMs: 18_000,
    enabledModules: ["policySurfaceScanner"],
  },
  standard: {
    profileId: "standard",
    label: "Standard runtime and policy scan",
    targetDurationMs: 30_000,
    internalBudgetMs: 35_000,
    enabledModules: ["preConsentRuntimeScanner", "policySurfaceScanner"],
  },
  consent: {
    profileId: "consent",
    label: "Consent-flow runtime scan",
    targetDurationMs: 45_000,
    internalBudgetMs: 50_000,
    enabledModules: ["preConsentRuntimeScanner", "consentFlowRuntimeScanner"],
  },
  consent_flow: {
    profileId: "consent_flow",
    label: "Consent-flow runtime scan",
    targetDurationMs: 45_000,
    internalBudgetMs: 50_000,
    enabledModules: ["preConsentRuntimeScanner", "consentFlowRuntimeScanner"],
  },
  full: {
    profileId: "full",
    label: "Full scan placeholder",
    targetDurationMs: 90_000,
    internalBudgetMs: 100_000,
    enabledModules: [
      "preConsentRuntimeScanner",
      "consentFlowRuntimeScanner",
      "policySurfaceScanner",
    ],
  },
};

export function getScanProfile(profileId: ScanProfile["profileId"]): ScanProfile {
  return scanProfiles[profileId];
}
