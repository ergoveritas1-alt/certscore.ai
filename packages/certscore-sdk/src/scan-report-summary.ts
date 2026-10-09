/** Retained observations by consent phase; unavailable coverage is not a zero. */
export interface ScanFormsSummary {
  contractVersion: "certscore.forms-summary.v1";
  scope: "starting_page_reportable_observations";
  totalObserved: number;
  preConsentObserved: number | null;
  afterAcceptObserved: number | null;
  preConsentCapture: "complete" | "limited" | "unavailable";
  afterAcceptCapture: "retained" | "limited" | "unavailable";
  countStatus?: "captured" | "limited" | "not_captured";
}

/** Canonical capped deduction families; individual rules explain contributors. */
export interface ScanScoreExplanation {
  contractVersion: "certscore.score-explanation.v1";
  scope: "starting_page_canonical_score";
  scoreVersion: string;
  policyVersion: string;
  baseScore: 100;
  scoreFloor: 0;
  score: number;
  totalPolicyDeductionPoints: number;
  deductions: Array<{
    family: string;
    label: string;
    deductionPoints: number;
    rules: Array<{
      ruleId: string;
      label: string;
      policyDeductionPoints: number;
      findingIds: string[];
      decisionVerification: "confirmed" | "unconfirmed" | "not_applicable" | "unknown";
    }>;
  }>;
}
