import { REGULATORY_FINDING_DEFINITIONS, REGULATORY_FINDING_IDS } from "./registry";
import { baseFindingFromDefinition, buildLimitations } from "./engines";
import { buildEvidenceRefs } from "./safety";
import type { EvidencePacket, LaunchFindingId, ScanFinding, ScanMethodology } from "./types";

function timestamp(hour: number) {
  return `2026-03-22T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function methodology(scanRunId: string): ScanMethodology {
  return {
    browserProfileType: "fresh",
    browserSignalTesting: {
      comparedAgainstControl: true,
      enabled: true,
      signalTypesTested: ["Global Privacy Control"]
    },
    consentStateReset: true,
    evidenceCollection: {
      cookieDiffingEnabled: true,
      domSnapshotsCaptured: true,
      networkLoggingEnabled: true,
      screenshotsCaptured: true,
      storageWriteTrackingEnabled: true
    },
    generatedAt: timestamp(11),
    pageSelection: {
      discoveredPages: ["https://example.com/privacy", "https://example.com/checkout"],
      keyFlowsTested: ["https://example.com/signup", "https://example.com/checkout"],
      legalPagesTested: ["https://example.com/privacy", "https://example.com/accessibility"],
      seedPages: ["https://example.com"]
    },
    scanRunId
  };
}

function baseEvidence(findingId: LaunchFindingId, mode: "high" | "medium"): EvidencePacket {
  const def = REGULATORY_FINDING_DEFINITIONS[findingId];
  const pageUrl = def.module.includes("Accessibility") ? "https://example.com/checkout" : "https://example.com/privacy";

  return buildEvidenceRefs({
    cookies:
      def.claimType === "observable_behavior" || def.claimType === "readiness_not_evident"
        ? [
            {
              id: `${findingId}-cookie`,
              name: "example_opt_state",
              pageUrl,
              phase: "before_choice",
              timestamp: timestamp(10)
            }
          ]
        : [],
    domSnapshots: [
      {
        excerpt:
          def.claimType === "claim_vs_behavior_gap"
            ? "We respect your privacy choices and honor browser-based opt-out signals."
            : `${def.title} evidence excerpt retained during the scan.`,
        id: `${findingId}-dom`,
        pageUrl,
        selector: def.claimType === "claim_vs_behavior_gap" ? "main article p" : "footer a",
        timestamp: timestamp(9)
      }
    ],
    networkEvents:
      def.claimType === "observable_behavior" || def.claimType === "claim_vs_behavior_gap" || def.claimType === "readiness_not_evident"
        ? [
            {
              category: "analytics",
              id: `${findingId}-network`,
              method: "GET",
              notes: "Representative network event retained during the scan.",
              pageUrl,
              phase: "before_choice",
              requestUrl: "https://analytics.example-vendor.test/collect",
              timestamp: timestamp(10),
              vendor: "Example Analytics"
            }
          ]
        : [],
    pageUrls: [pageUrl, ...(mode === "high" ? ["https://example.com/checkout"] : [])],
    screenshots: [
      {
        caption: `${def.title} screenshot evidence`,
        id: `${findingId}-shot`,
        pageUrl,
        timestamp: timestamp(9),
        url: `https://evidence.certscore.test/${findingId}-shot.png`
      }
    ],
    sessionLogs: [
      {
        eventType: def.claimType === "manual_review_recommended" ? "manual_review_reason" : "scan_observation",
        id: `${findingId}-log`,
        message:
          def.claimType === "manual_review_recommended"
            ? "Automation surfaced issue evidence on a key flow; manual review is recommended."
            : `${def.title} was supported by retained scan evidence.`,
        pageUrl,
        timestamp: timestamp(10)
      }
    ],
    storageWrites:
      def.claimType === "observable_behavior" || def.claimType === "readiness_not_evident"
        ? [
            {
              id: `${findingId}-storage`,
              key: "privacy_preference",
              pageUrl,
              phase: "signal_enabled",
              storageType: "localStorage",
              timestamp: timestamp(10)
            }
          ]
        : []
  });
}

function observationFor(findingId: LaunchFindingId) {
  switch (findingId) {
    case "privacy.ca.privacy_policy_surface_missing":
      return ["A privacy policy page was not evident from the homepage, footer, or tested legal-page paths."];
    case "privacy.ca.opt_out_surface_missing":
      return ["An observable opt-out privacy choice path was not detected on tested public pages."];
    case "privacy.ca.browser_signal_not_evident":
      return ["A visible response to the tested browser opt-out signal was not evident during the compared sessions."];
    case "privacy.ca.pre_choice_tracking_observed":
      return ["Network activity associated with a third-party analytics vendor was observed before a privacy choice interaction."];
    case "privacy.ca.claim_behavior_gap":
      return [
        "Claim text captured from https://example.com/privacy: We respect your privacy choices and honor browser-based opt-out signals.",
        "Observed behavior during the scan did not show an externally visible change after the tested browser signal was enabled."
      ];
    case "privacy.state.consumer_rights_mechanism_missing":
      return ["A consumer rights request pathway was not detected on the tested privacy pages or footer surfaces."];
    case "privacy.state.targeted_ads_opt_out_missing":
      return ["A targeted advertising opt-out surface was not evident during the tested scan conditions."];
    case "privacy.state.universal_opt_out_not_evident":
      return ["Observable handling of a universal opt-out signal was not evident in the compared public sessions."];
    case "privacy.state.disclosure_behavior_gap":
      return [
        "Claim text captured from https://example.com/privacy: Users can control advertising and sale or sharing preferences from this site.",
        "Observed behavior during the scan did not show an externally visible targeted advertising opt-out surface."
      ];
    case "accessibility.eu.statement_missing":
      return ["An accessibility statement was not detected on the tested public pages."];
    case "accessibility.eu.automated_barriers_detected":
      return ["Automated testing identified color contrast and form-label barriers on tested pages."];
    case "accessibility.eu.key_flow_barriers":
      return ["Automated testing identified serious barriers on checkout and signup flows that may affect assistive-technology users."];
    case "accessibility.eu.claim_gap":
      return [
        "Claim text captured from https://example.com/accessibility: Our website is designed to support keyboard and screen-reader navigation.",
        "Automated testing identified barriers on tested key pages that may warrant review of that public statement."
      ];
    case "privacy.ca.browser_readiness_not_evident":
      return ["Observable browser-level privacy signal readiness was not evident during the tested public scan."];
    case "privacy.ca.preference_persistence_not_evident":
      return ["Observable persistence of the tested privacy preference was not evident after page reload and retest."];
    case "privacy.ca.user_confirmation_not_evident":
      return ["A visible confirmation acknowledging receipt of the tested privacy preference was not evident."];
  }
}

function testedFor(findingId: LaunchFindingId) {
  return [`Retained public evidence relevant to ${REGULATORY_FINDING_DEFINITIONS[findingId].title.toLowerCase()} was collected on tested pages.`];
}

function recommendedReviewFor(findingId: LaunchFindingId) {
  if (findingId === "accessibility.eu.key_flow_barriers") {
    return "Manual review recommended on tested key flows to confirm screen-reader, keyboard, and assistive-technology impact.";
  }
  if (findingId.includes("claim_gap") || findingId.includes("behavior_gap")) {
    return "Review the retained public claim text and corresponding behavior evidence together.";
  }
  if (findingId.includes("signal") || findingId.includes("readiness")) {
    return "Manual review recommended if the tested behavior may vary by region, account state, or device.";
  }
  return undefined;
}

function buildValidFixture(findingId: LaunchFindingId, mode: "high" | "medium"): ScanFinding {
  const definition = REGULATORY_FINDING_DEFINITIONS[findingId];
  const result = baseFindingFromDefinition({
    breadth: mode === "high" ? 2 : 1,
    contradictionImportance: definition.claimType === "claim_vs_behavior_gap" ? "material" : "limited",
    evidence: baseEvidence(findingId, mode),
    finding: {
      claimType: definition.claimType,
      findingId,
      generatedAt: timestamp(11),
      limitations: buildLimitations(definition.module, definition.claimType, { claimGap: definition.claimType === "claim_vs_behavior_gap" }),
      module: definition.module,
      observations: observationFor(findingId),
      pillar: definition.pillar,
      recommendedReview: recommendedReviewFor(findingId),
      regulatoryMappings: definition.regulatoryMappings,
      reproduction: {
        comparedAgainstControl: true,
        repeatability: mode === "high" ? "consistent" : "partially_consistent",
        sessionCount: mode === "high" ? 2 : 1,
        testConditions: [
          "Fresh browser profile with retained screenshots, DOM excerpts, and network evidence.",
          "Public pages only; authenticated flows were not tested."
        ]
      },
      scanRunId: `fixture-${findingId}-${mode}`,
      title: definition.title,
      whatWasTested: testedFor(findingId)
    },
    flowCriticality: findingId === "accessibility.eu.key_flow_barriers" ? "core" : "important"
  });

  if (!result.validation.ok) {
    throw new Error(`Fixture build failed for ${findingId}/${mode}: ${result.validation.errors.join(" | ")}`);
  }

  return result.finding;
}

function buildInvalidFixture(findingId: LaunchFindingId): ScanFinding {
  const valid = buildValidFixture(findingId, "medium");
  return {
    ...valid,
    limitations: [],
    summary: "This site is non-compliant with privacy law.",
    title: `${valid.title} violation`
  };
}

export const REGULATORY_REVIEW_FIXTURES = Object.fromEntries(
  REGULATORY_FINDING_IDS.map((findingId) => [
    findingId,
    {
      invalid: [buildInvalidFixture(findingId)],
      valid: [buildValidFixture(findingId, "high"), buildValidFixture(findingId, "medium")]
    }
  ])
) as Record<LaunchFindingId, { valid: ScanFinding[]; invalid: ScanFinding[] }>;

export const EXAMPLE_SCAN_METHODOLOGY = methodology("fixture-methodology-scan");
