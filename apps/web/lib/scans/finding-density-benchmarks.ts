import type { CertScoreFinding } from "./finding-registry";

export type FindingDensityBenchmark = {
  findingId: CertScoreFinding["id"];
  positiveCount: number;
  sampleSize: number;
  densityPct: number;
  contextLabel: string;
  tooltip: string;
  calibrationNote: string;
  sourceLabel: string;
  slices: FindingDensityBenchmarkSlice[];
};

export type FindingDensityBenchmarkSlice = {
  label: string;
  positiveCount: number;
  sampleSize: number;
  densityPct: number;
};

export const FINDING_DENSITY_BENCHMARK_SCOPE = {
  label: "Tranco top 1-2500 calibration set",
  methodologyNote:
    "Directional density from recent public-web scan calibration batches. Rank bands are approximate and may contain minor overlap. Not a legal, compliance, or statistical conclusion.",
  sampleSizeApprox: 2505
} as const;

const DENSITY_SAMPLE_SIZE = FINDING_DENSITY_BENCHMARK_SCOPE.sampleSizeApprox;
const DENSITY_SOURCE_LABEL = FINDING_DENSITY_BENCHMARK_SCOPE.label;
const DENSITY_TOOLTIP =
  "Based on recent CertScore.ai scan calibration batches across public websites. This is directional market context, not a compliance benchmark or legal conclusion.";
export const FINDING_DENSITY_CALIBRATION_NOTE =
  "Benchmark frequency is directional market context only. It is not a compliance benchmark, legal conclusion, or severity score. Rare findings may be top-ranked only when retained evidence is strong; common findings may remain medium when evidence is automated or context-dependent. Rarity is not severity, and prevalence is not compliance risk.";

const FINDING_DENSITY_INPUTS: Partial<Record<CertScoreFinding["id"], { count: number; densityPct: number; label: string }>> = {
  visual_contrast_accessibility_issue: { count: 581, densityPct: 23, label: "Seen on ~23% of scanned top sites" },
  cookie_disclosure_gap: { count: 0, densityPct: 0, label: "Formal top-finding density pending calibration" },
  focus_management_issue: { count: 0, densityPct: 0, label: "Formal top-finding density pending calibration" },
  long_lived_cookie_retention_review: { count: 0, densityPct: 0, label: "Formal top-finding density pending calibration" },
  pre_consent_tracking_detected: { count: 458, densityPct: 18, label: "Seen on ~18% of scanned top sites" },
  semantic_labeling_accessibility_issue: { count: 437, densityPct: 17, label: "Seen on ~17% of scanned top sites" },
  fingerprinting_related_signals_observed: { count: 396, densityPct: 16, label: "Seen on ~16% of scanned top sites" },
  third_party_cookie_pre_consent: { count: 311, densityPct: 12, label: "Seen on ~12% of scanned top sites" },
  text_alternative_accessibility_issue: { count: 248, densityPct: 10, label: "Seen on ~10% of scanned top sites" },
  session_recording_services_detected: { count: 228, densityPct: 9, label: "Seen on ~9% of scanned top sites" },
  rtb_cookie_sync_observed: { count: 220, densityPct: 9, label: "Seen on ~9% of scanned top sites" },
  policy_behavior_contradiction_detected: { count: 0, densityPct: 0, label: "Formal top-finding density pending calibration" },
  consent_dark_patterns_detected: { count: 116, densityPct: 5, label: "Seen on ~5% of scanned top sites" },
  cpra_cba_opt_out_missing: { count: 105, densityPct: 4, label: "Seen on ~4% of scanned top sites" },
  reject_option_missing_or_hidden: { count: 98, densityPct: 4, label: "Seen on ~4% of scanned top sites" },
  asymmetric_consent_ui: { count: 91, densityPct: 4, label: "Seen on ~4% of scanned top sites" },
  forced_consent_interaction: { count: 78, densityPct: 3, label: "Seen on ~3% of scanned top sites" },
  sensitive_data_collection_with_third_party_tracking_present: { count: 69, densityPct: 3, label: "Seen on ~3% of scanned top sites" },
  session_replay_present_with_sensitive_surfaces_observed: { count: 0, densityPct: 0, label: "Formal top-finding density pending calibration" },
  keyboard_navigation_accessibility_issue: { count: 64, densityPct: 3, label: "Seen on ~3% of scanned top sites" },
  cross_domain_identifier_sharing_observed: { count: 49, densityPct: 2, label: "Seen on ~2% of scanned top sites" },
  reject_tracking_persists_after_reject: { count: 34, densityPct: 1, label: "Seen on ~1% of scanned top sites" },
  possible_session_replay_on_sensitive_input_surface: { count: 7, densityPct: 0.3, label: "Seen on <1% of scanned top sites" },
  probable_fingerprinting: { count: 4, densityPct: 0.2, label: "Seen on <1% of scanned top sites" }
};

function makeDensityBenchmark(findingId: CertScoreFinding["id"]): FindingDensityBenchmark {
  const input = FINDING_DENSITY_INPUTS[findingId];
  const positiveCount = input?.count ?? 0;
  const densityPct = input?.densityPct ?? (positiveCount / DENSITY_SAMPLE_SIZE) * 100;

  return {
    findingId,
    positiveCount,
    sampleSize: DENSITY_SAMPLE_SIZE,
    densityPct,
    contextLabel: input?.label ?? `Seen on ~${Math.round(densityPct)}% of scanned top sites`,
    tooltip: DENSITY_TOOLTIP,
    calibrationNote: FINDING_DENSITY_CALIBRATION_NOTE,
    sourceLabel: DENSITY_SOURCE_LABEL,
    slices: [
      {
        label: FINDING_DENSITY_BENCHMARK_SCOPE.label,
        positiveCount,
        sampleSize: DENSITY_SAMPLE_SIZE,
        densityPct
      }
    ]
  };
}

export const FINDING_DENSITY_BENCHMARKS: Record<string, FindingDensityBenchmark> = {
  asymmetric_consent_ui: makeDensityBenchmark("asymmetric_consent_ui"),
  consent_dark_patterns_detected: makeDensityBenchmark("consent_dark_patterns_detected"),
  cpra_cba_opt_out_missing: makeDensityBenchmark("cpra_cba_opt_out_missing"),
  cross_domain_identifier_sharing_observed: makeDensityBenchmark("cross_domain_identifier_sharing_observed"),
  fingerprinting_related_signals_observed: makeDensityBenchmark("fingerprinting_related_signals_observed"),
  focus_management_issue: makeDensityBenchmark("focus_management_issue"),
  forced_consent_interaction: makeDensityBenchmark("forced_consent_interaction"),
  keyboard_navigation_accessibility_issue: makeDensityBenchmark("keyboard_navigation_accessibility_issue"),
  cookie_disclosure_gap: makeDensityBenchmark("cookie_disclosure_gap"),
  long_lived_cookie_retention_review: makeDensityBenchmark("long_lived_cookie_retention_review"),
  possible_session_replay_on_sensitive_input_surface: makeDensityBenchmark("possible_session_replay_on_sensitive_input_surface"),
  policy_behavior_contradiction_detected: makeDensityBenchmark("policy_behavior_contradiction_detected"),
  pre_consent_tracking_detected: makeDensityBenchmark("pre_consent_tracking_detected"),
  probable_fingerprinting: makeDensityBenchmark("probable_fingerprinting"),
  reject_option_missing_or_hidden: makeDensityBenchmark("reject_option_missing_or_hidden"),
  reject_tracking_persists_after_reject: makeDensityBenchmark("reject_tracking_persists_after_reject"),
  rtb_cookie_sync_observed: makeDensityBenchmark("rtb_cookie_sync_observed"),
  semantic_labeling_accessibility_issue: makeDensityBenchmark("semantic_labeling_accessibility_issue"),
  sensitive_data_collection_with_third_party_tracking_present: makeDensityBenchmark(
    "sensitive_data_collection_with_third_party_tracking_present"
  ),
  session_replay_present_with_sensitive_surfaces_observed: makeDensityBenchmark(
    "session_replay_present_with_sensitive_surfaces_observed"
  ),
  session_recording_services_detected: makeDensityBenchmark("session_recording_services_detected"),
  text_alternative_accessibility_issue: makeDensityBenchmark("text_alternative_accessibility_issue"),
  third_party_cookie_pre_consent: makeDensityBenchmark("third_party_cookie_pre_consent"),
  visual_contrast_accessibility_issue: makeDensityBenchmark("visual_contrast_accessibility_issue")
};

export function getFindingDensityBenchmark(findingId: CertScoreFinding["id"]): FindingDensityBenchmark | null {
  return FINDING_DENSITY_BENCHMARKS[findingId] ?? null;
}
