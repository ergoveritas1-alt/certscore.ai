import type { CertScoreFinding } from "./finding-registry";

export type FindingDensityBenchmark = {
  findingId: CertScoreFinding["id"];
  positiveCount: number;
  sampleSize: number;
  densityPct: number;
  contextLabel: string;
  tooltip: string;
  sourceLabel: string;
  slices: FindingDensityBenchmarkSlice[];
};

export type FindingDensityBenchmarkSlice = {
  label: string;
  positiveCount: number;
  sampleSize: number;
  densityPct: number;
};

function formatApproxDensityLabel(densityPct: number) {
  return `Seen on ~${Math.round(densityPct)}% of sites`;
}

const DENSITY_SAMPLE_SIZE = 355;
const DENSITY_SOURCE_LABEL = "Prod load-test top findings, rank slots 851-1205";
const DENSITY_TOOLTIP =
  "Based on recent CertScore scan samples across comparable public sites. This is directional market context, not a compliance benchmark or legal conclusion.";

function makeDensityBenchmark(
  findingId: CertScoreFinding["id"],
  positiveCount: number
): FindingDensityBenchmark {
  const densityPct = (positiveCount / DENSITY_SAMPLE_SIZE) * 100;

  return {
    findingId,
    positiveCount,
    sampleSize: DENSITY_SAMPLE_SIZE,
    densityPct,
    contextLabel: formatApproxDensityLabel(densityPct),
    tooltip: DENSITY_TOOLTIP,
    sourceLabel: DENSITY_SOURCE_LABEL,
    slices: [
      {
        label: "Tranco ranks 851-1205",
        positiveCount,
        sampleSize: DENSITY_SAMPLE_SIZE,
        densityPct
      }
    ]
  };
}

export const FINDING_DENSITY_BENCHMARKS: Record<string, FindingDensityBenchmark> = {
  asymmetric_consent_ui: makeDensityBenchmark("asymmetric_consent_ui", 12),
  consent_dark_patterns_detected: makeDensityBenchmark("consent_dark_patterns_detected", 19),
  cpra_cba_opt_out_missing: makeDensityBenchmark("cpra_cba_opt_out_missing", 17),
  cross_domain_identifier_sharing_observed: makeDensityBenchmark("cross_domain_identifier_sharing_observed", 8),
  fingerprinting_related_signals_observed: makeDensityBenchmark("fingerprinting_related_signals_observed", 57),
  focus_management_issue: makeDensityBenchmark("focus_management_issue", 0),
  forced_consent_interaction: makeDensityBenchmark("forced_consent_interaction", 14),
  keyboard_navigation_accessibility_issue: makeDensityBenchmark("keyboard_navigation_accessibility_issue", 10),
  possible_session_replay_on_sensitive_input_surface: makeDensityBenchmark("possible_session_replay_on_sensitive_input_surface", 2),
  pre_consent_tracking_detected: makeDensityBenchmark("pre_consent_tracking_detected", 64),
  probable_fingerprinting: makeDensityBenchmark("probable_fingerprinting", 1),
  reject_option_missing_or_hidden: makeDensityBenchmark("reject_option_missing_or_hidden", 14),
  reject_tracking_persists_after_reject: makeDensityBenchmark("reject_tracking_persists_after_reject", 7),
  rtb_cookie_sync_observed: makeDensityBenchmark("rtb_cookie_sync_observed", 34),
  semantic_labeling_accessibility_issue: makeDensityBenchmark("semantic_labeling_accessibility_issue", 61),
  sensitive_data_collection_with_third_party_tracking_present: makeDensityBenchmark(
    "sensitive_data_collection_with_third_party_tracking_present",
    13
  ),
  session_recording_services_detected: makeDensityBenchmark("session_recording_services_detected", 44),
  text_alternative_accessibility_issue: makeDensityBenchmark("text_alternative_accessibility_issue", 34),
  third_party_cookie_pre_consent: makeDensityBenchmark("third_party_cookie_pre_consent", 39),
  visual_contrast_accessibility_issue: makeDensityBenchmark("visual_contrast_accessibility_issue", 65)
};

export function getFindingDensityBenchmark(findingId: CertScoreFinding["id"]): FindingDensityBenchmark | null {
  return FINDING_DENSITY_BENCHMARKS[findingId] ?? null;
}
