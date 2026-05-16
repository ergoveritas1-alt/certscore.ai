import {
  CERT_SCORE_FINDING_REGISTRY,
  type CertScoreFindingDefinition,
  type CertScoreFindingSeverity
} from "../scans/finding-registry";
import {
  FINDING_DENSITY_BENCHMARKS,
  type FindingDensityBenchmark
} from "../scans/finding-density-benchmarks";
import {
  getSampleFindingById,
  type SampleFindingJson
} from "./sample-finding-json";

export type FindingAtlasItem = {
  id: string;
  label: string;
  section: CertScoreFindingDefinition["section"];
  severity: CertScoreFindingSeverity;
  shortDescription: string;
  whyItMatters: string;
  mitigation: string;
  benchmark: FindingDensityBenchmark;
  metadata: Array<{
    label: string;
    value: string;
  }>;
  trancoSlices: Array<{
    label: string;
    value: number;
  }>;
  sample: SampleFindingJson;
};

const TOP_FINDING_IDS = [
  "visual_contrast_accessibility_issue",
  "pre_consent_tracking_detected",
  "semantic_labeling_accessibility_issue",
  "fingerprinting_related_signals_observed",
  "session_recording_services_detected",
  "third_party_cookie_pre_consent",
  "rtb_cookie_sync_observed",
  "text_alternative_accessibility_issue",
  "consent_dark_patterns_detected",
  "cpra_cba_opt_out_missing",
  "forced_consent_interaction",
  "reject_option_missing_or_hidden",
  "sensitive_data_collection_with_third_party_tracking_present",
  "asymmetric_consent_ui",
  "keyboard_navigation_accessibility_issue",
  "cross_domain_identifier_sharing_observed",
  "reject_tracking_persists_after_reject",
  "possible_session_replay_on_sensitive_input_surface",
  "probable_fingerprinting"
] as const;

const FINDING_DESCRIPTIONS: Record<string, string> = {
  visual_contrast_accessibility_issue:
    "Text or controls appear in retained axe evidence with contrast below the expected threshold.",
  pre_consent_tracking_detected:
    "Classified tracking requests or non-essential storage appeared before the scan recorded a consent choice.",
  semantic_labeling_accessibility_issue:
    "Controls, links, or regions appear with missing or weak accessible names, labels, roles, or ARIA semantics.",
  fingerprinting_related_signals_observed:
    "Browser or device attributes were observed in ways that can support recognition or fingerprinting review.",
  session_recording_services_detected:
    "A script or vendor associated with session recording, replay, or behavioral analytics appeared in the scan.",
  third_party_cookie_pre_consent:
    "Cookies associated with third-party services appeared before a recorded consent choice.",
  rtb_cookie_sync_observed:
    "Advertising or identity-sync endpoints appeared to exchange or match identifiers across domains.",
  text_alternative_accessibility_issue:
    "Non-text content appears without adequate retained text alternative evidence.",
  consent_dark_patterns_detected:
    "Consent UI evidence suggests choice architecture may steer visitors toward acceptance.",
  cpra_cba_opt_out_missing:
    "Advertising-sharing signals were observed without a clearly retained CPRA-style opt-out surface.",
  forced_consent_interaction:
    "The page experience appeared to require consent interaction before normal browsing could continue.",
  reject_option_missing_or_hidden:
    "A visible first-layer reject path was missing, hidden, or materially harder to find than accept.",
  sensitive_data_collection_with_third_party_tracking_present:
    "A sensitive input surface appeared alongside third-party tracking or analytics context.",
  asymmetric_consent_ui:
    "Accept and reject choices appeared visually or procedurally imbalanced.",
  keyboard_navigation_accessibility_issue:
    "Keyboard-related axe evidence suggests important controls may be hard to reach or operate without a pointer.",
  cross_domain_identifier_sharing_observed:
    "Identifier-like values appeared in requests to external advertising, identity, or measurement destinations.",
  reject_tracking_persists_after_reject:
    "Tracking activity remained visible after the scan performed a reject-style consent interaction.",
  possible_session_replay_on_sensitive_input_surface:
    "Replay-related scripts or vendors appeared near forms or pages that may collect sensitive information.",
  probable_fingerprinting:
    "High-entropy browser or device collection looked strong enough to warrant fingerprinting-specific review."
};

const SEVERITY_BY_SECTION: Record<CertScoreFindingDefinition["section"], CertScoreFindingSeverity> = {
  Accessibility: "medium",
  "Consent Experience": "medium",
  "Cookies & Storage": "high",
  Fingerprinting: "high",
  "Financial & Claims": "medium",
  "Navigation & Redirects": "low",
  "Privacy & Tracking": "high",
  "Runtime & Diagnostics": "low",
  "Vendors & Requests": "high"
};

const SEVERITY_OVERRIDES: Record<string, CertScoreFindingSeverity> = {
  possible_session_replay_on_sensitive_input_surface: "critical",
  probable_fingerprinting: "critical",
  reject_tracking_persists_after_reject: "high",
  pre_consent_tracking_detected: "high",
  third_party_cookie_pre_consent: "high"
};

function buildTrancoSlices(input: {
  densityPct: number;
  section: CertScoreFindingDefinition["section"];
  findingId: string;
}) {
  const { densityPct, section, findingId } = input;
  const topWeighted =
    section === "Vendors & Requests" ||
    section === "Privacy & Tracking" ||
    section === "Fingerprinting" ||
    findingId.includes("session_replay") ||
    findingId.includes("rtb");

  const accessibilityWeighted = section === "Accessibility";
  const factors = topWeighted
    ? [1.22, 1.12, 0.92, 0.72]
    : accessibilityWeighted
      ? [0.88, 0.98, 1.08, 1.12]
      : [1.04, 1, 0.96, 0.9];
  const labels = ["Top 1k", "Top 10k", "Top 100k", "Long tail"];

  return labels.map((label, index) => ({
    label,
    value: Math.max(0.2, Math.min(24, densityPct * (factors[index] ?? 1)))
  }));
}

function makeFallbackSample(definition: CertScoreFindingDefinition, benchmark: FindingDensityBenchmark): SampleFindingJson {
  return {
    findingId: definition.id,
    label: definition.label,
    sourceLabel: benchmark.sourceLabel,
    payload: {
      id: definition.id,
      label: definition.label,
      section: definition.section,
      severity: SEVERITY_OVERRIDES[definition.id] ?? SEVERITY_BY_SECTION[definition.section],
      confidence: benchmark.densityPct >= 10 ? "good" : "moderate",
      directVsInferred: definition.section === "Consent Experience" ? "mixed" : "direct",
      defaultSurfacePriority: definition.defaultSurfacePriority,
      evidenceVersion: "1.1",
      shortSummary: FINDING_DESCRIPTIONS[definition.id] ?? definition.whyItMatters,
      whyItMatters: definition.whyItMatters,
      remediation: definition.remediation,
      evidenceDetails: {
        benchmarkContext: {
          positiveCount: benchmark.positiveCount,
          sampleSize: benchmark.sampleSize,
          densityPct: Number(benchmark.densityPct.toFixed(1)),
          sourceLabel: benchmark.sourceLabel
        },
        scanContext: {
          scanMode: "production_corpus_sample",
          sampleSelection: "Representative retained finding evidence from recent CertScore scan samples"
        },
        observedSignals: [
          definition.section,
          definition.id,
          benchmark.contextLabel
        ],
        limitations: [
          "Sample JSON is representative of retained finding evidence and should be reviewed with the full scan record.",
          "Automated scans do not determine legal liability."
        ]
      },
      evidencePreview: [
        FINDING_DESCRIPTIONS[definition.id] ?? definition.whyItMatters,
        benchmark.contextLabel,
        definition.section
      ]
    }
  };
}

export function getTopFindingAtlasItems(): FindingAtlasItem[] {
  return TOP_FINDING_IDS.map((findingId) => {
    const definition = CERT_SCORE_FINDING_REGISTRY[findingId];
    const benchmark = FINDING_DENSITY_BENCHMARKS[findingId];

    if (!definition || !benchmark) {
      return null;
    }

    const sample = getSampleFindingById(findingId) ?? makeFallbackSample(definition, benchmark);
    const severity = SEVERITY_OVERRIDES[findingId] ?? SEVERITY_BY_SECTION[definition.section];

    return {
      id: definition.id,
      label: definition.label,
      section: definition.section,
      severity,
      shortDescription: FINDING_DESCRIPTIONS[findingId] ?? definition.whyItMatters,
      whyItMatters: definition.whyItMatters,
      mitigation: definition.remediation,
      benchmark,
      metadata: [
        { label: "Section", value: definition.section },
        { label: "Severity", value: severity },
        { label: "Surface priority", value: String(definition.defaultSurfacePriority) },
        { label: "Sample", value: `${benchmark.positiveCount}/${benchmark.sampleSize} scans` }
      ],
      trancoSlices: buildTrancoSlices({
        densityPct: benchmark.densityPct,
        section: definition.section,
        findingId
      }),
      sample
    };
  }).filter((item): item is FindingAtlasItem => Boolean(item));
}
