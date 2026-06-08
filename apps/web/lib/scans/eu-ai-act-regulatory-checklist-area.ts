import type {
  BetaRegulatoryChecklistArea,
  BetaRegulatoryChecklistRow,
  BetaRegulatoryChecklistStatus
} from "../../components/scans/beta-regulatory-checklist-card";

export type BetaRegulatoryFindingSource = {
  id: string;
  label: string;
};

type RegulatoryFindingSourceLike = {
  id?: string | null;
  label?: string | null;
  title?: string | null;
  unifiedFindingId?: string | null;
};

type RegulatoryMergedSignalLike = {
  evidenceRefs?: string[];
  key?: string | null;
  label?: string | null;
  populationStatus?: string | null;
  selectedPopulation?: {
    value?: boolean | number | string | string[] | null;
  } | null;
  value?: boolean | number | string | string[] | null;
};

export function buildBetaRegulatoryFindingSources(input: {
  executiveFindings?: RegulatoryFindingSourceLike[];
  unifiedFindings?: RegulatoryFindingSourceLike[];
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

type EuAiActRowSeed = Omit<BetaRegulatoryChecklistRow, "evidenceRefs" | "status"> & {
  findingIds?: string[];
  matchedStatus?: BetaRegulatoryChecklistStatus;
  notObservedSignalKeys?: string[];
  status?: BetaRegulatoryChecklistStatus;
};

const EU_AI_ACT_ROW_SEEDS: EuAiActRowSeed[] = [
  {
    evidenceCapability: "near_term_supported",
    findingIds: ["ai_feature_claim_present", "ai_interaction_disclosure_present"],
    id: "ai_feature_disclosure",
    label: "AI feature / direct interaction disclosure",
    matchedStatus: "review_signal",
    note: "AI interaction disclosure requires retained evidence of an AI-facing user interaction and nearby user-facing AI disclosure language.",
    regulatoryMapping: []
  },
  {
    evidenceCapability: "near_term_supported",
    findingIds: ["ai_transparency_notice_present"],
    id: "ai_transparency_notice",
    label: "AI transparency notice availability",
    matchedStatus: "checked",
    note: "AI transparency notice review requires retained public AI, responsible-use, trust, legal, help, privacy, or terms surfaces.",
    regulatoryMapping: []
  },
  {
    evidenceCapability: "near_term_supported",
    findingIds: ["ai_marketing_disclosure_alignment_review"],
    id: "marketing_legal_alignment",
    label: "AI marketing / disclosure alignment",
    matchedStatus: "review_signal",
    note: "Marketing AI claims must be compared with retained legal, help, privacy, or transparency disclosures through normalized concerns before a gap can be projected.",
    regulatoryMapping: []
  },
  {
    evidenceCapability: "near_term_supported",
    findingIds: ["ai_generated_content_label_present"],
    id: "generated_content_labeling",
    label: "AI-generated content labeling",
    matchedStatus: "checked",
    notObservedSignalKeys: ["ai.generated_content_label_present"],
    note: "Generated-content labeling requires a retained generated-content surface, explicit origin context, or public claim; CertScore must not infer AI generation from appearance alone.",
    regulatoryMapping: []
  },
  {
    evidenceCapability: "near_term_supported",
    findingIds: ["ai_automated_decision_disclosure_present"],
    id: "automated_decision_disclosure",
    label: "Automated decision-making / profiling disclosure",
    matchedStatus: "checked",
    notObservedSignalKeys: ["ai.automated_decision_disclosure_present"],
    note: "Automated decisioning or profiling disclosure review requires retained policy text or public flow evidence tied to decisions, scoring, ranking, eligibility, recommendations, or personalization.",
    regulatoryMapping: []
  },
  {
    evidenceCapability: "near_term_supported",
    findingIds: ["ai_human_review_path_present"],
    id: "human_review_path",
    label: "Human review or escalation path",
    matchedStatus: "checked",
    notObservedSignalKeys: ["ai.human_review_path_present"],
    note: "Human review, appeal, complaint, or escalation path review is relevant only when retained AI or automated-decision context suggests user-impacting outcomes.",
    regulatoryMapping: []
  },
  {
    evidenceCapability: "near_term_supported",
    findingIds: ["ai_sensitive_context_review_signal"],
    id: "sensitive_context_ai",
    label: "Sensitive-context AI surface",
    matchedStatus: "review_signal",
    note: "Sensitive-context AI review is a triage signal for employment, education, credit, insurance, healthcare, housing, identity, biometric, minors, or similar contexts; it does not confirm high-risk AI status.",
    regulatoryMapping: []
  },
  {
    evidenceCapability: "near_term_supported",
    findingIds: ["ai_surface_tracking_review_signal"],
    id: "ai_flow_tracking",
    label: "AI flow tracking / replay / adtech",
    matchedStatus: "review_signal",
    note: "AI-flow tracking review requires retained runtime evidence on the same AI surface or exercised AI interaction, not generic site-wide tracking alone.",
    regulatoryMapping: []
  }
];

function buildCounters(rows: BetaRegulatoryChecklistRow[]): BetaRegulatoryChecklistArea["counters"] {
  return {
    checked: rows.filter((row) => row.status === "checked").length,
    gaps: rows.filter((row) => row.status === "gap_observed").length,
    notApplicable: rows.filter((row) => row.status === "not_applicable").length,
    notObserved: rows.filter((row) => row.status === "not_observed").length,
    notTestable: rows.filter((row) => row.status === "not_testable").length,
    review: rows.filter((row) => row.status === "review_signal" || row.status === "litigation_risk_signal").length
  };
}

function deriveEuAiActAlphaScore(rows: BetaRegulatoryChecklistRow[]) {
  const scoreableRows = rows.filter((row) => row.status !== "not_applicable");
  if (scoreableRows.every((row) => row.status === "not_testable")) {
    return null;
  }

  const points = scoreableRows.reduce((total, row) => {
    switch (row.status) {
      case "checked":
        return total + 100;
      case "not_observed":
        return total + 50;
      case "review_signal":
        return total + 50;
      case "gap_observed":
      case "litigation_risk_signal":
      case "not_testable":
      default:
        return total;
    }
  }, 0);

  return Math.round(points / Math.max(1, scoreableRows.length));
}

export function buildEuAiActRegulatoryChecklistArea(
  findingSources: BetaRegulatoryFindingSource[] = [],
  options: { mergedSignals?: RegulatoryMergedSignalLike[] } = {}
): BetaRegulatoryChecklistArea {
  const missingSignalByKey = new Map(
    (options.mergedSignals ?? [])
      .filter((signal) => {
        const value = signal.selectedPopulation?.value ?? signal.value;
        return signal.key && signal.populationStatus === "missing" && value === false;
      })
      .map((signal) => [signal.key as string, signal])
  );
  const rows = EU_AI_ACT_ROW_SEEDS.map((row): BetaRegulatoryChecklistRow => {
    const matchedFindings = findingSources
      .filter((finding) => row.findingIds?.includes(finding.id))
      .slice(0, 6);
    const matchedFindingRefs = matchedFindings
      .map((finding) => finding.label);
    const missingSignals = (row.notObservedSignalKeys ?? [])
      .map((key) => missingSignalByKey.get(key))
      .filter((signal): signal is RegulatoryMergedSignalLike => Boolean(signal))
      .slice(0, 6);
    const missingSignalRefs = missingSignals
      .flatMap((signal) => signal.evidenceRefs && signal.evidenceRefs.length > 0 ? signal.evidenceRefs : [signal.label ?? signal.key ?? "AI signal not observed"])
      .slice(0, 6);
    const matchedStatus =
      row.id === "ai_feature_disclosure" && matchedFindings.some((finding) => finding.id === "ai_interaction_disclosure_present")
        ? "checked"
        : row.matchedStatus;
    return {
      ...row,
      evidenceRefs:
        matchedFindingRefs.length > 0
          ? matchedFindingRefs
          : missingSignalRefs.length > 0
            ? missingSignalRefs
            : undefined,
      status:
        row.status ??
        (matchedFindingRefs.length > 0
          ? matchedStatus ?? "review_signal"
          : missingSignals.length > 0
            ? "not_observed"
            : "not_testable")
    };
  });
  const counters = buildCounters(rows);
  const score = deriveEuAiActAlphaScore(rows);

  return {
    counters,
    id: "eu-ai-act",
    maturityLabel: "Alpha",
    navLabel: "EU AI Act",
    rows,
    score,
    status: counters.review > 0 ? "review_recommended" : "limited_coverage",
    subtitle: "Article 50-oriented transparency, disclosure, labeling, and sensitive-context AI review signals.",
    summary: "EU AI Act alpha review is limited to public-web AI transparency signals. CertScore does not determine AI Act scope, high-risk classification, or compliance status.",
    title: "EU AI Act"
  };
}
