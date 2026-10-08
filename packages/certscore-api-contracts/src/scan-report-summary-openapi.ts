export const scanReportSummaryOpenApi = {
  FormsSummary: {
    type: "object", additionalProperties: false,
    description: "Starting-page retained reportable form observations by phase. Counts are observations, not deduplicated forms across browser sessions. Null means unavailable, never zero. Detailed form fields and screenshots are retrieved through report-evidence?section=forms.",
    required: ["contractVersion", "scope", "totalObserved", "preConsentObserved", "afterAcceptObserved", "preConsentCapture", "afterAcceptCapture"],
    properties: {
      contractVersion: { type: "string", enum: ["certscore.forms-summary.v1"] },
      scope: { type: "string", enum: ["starting_page_reportable_observations"] },
      totalObserved: { type: "integer", minimum: 0 },
      preConsentObserved: { type: ["integer", "null"], minimum: 0 },
      afterAcceptObserved: { type: ["integer", "null"], minimum: 0 },
      preConsentCapture: { type: "string", enum: ["complete", "limited", "unavailable"] },
      afterAcceptCapture: { type: "string", enum: ["retained", "limited", "unavailable"] },
    },
  },
  ScoreExplanation: {
    type: "object", additionalProperties: false,
    description: "Explanation from the same capped canonical score calculation. Family deductionPoints are capped; rule policyDeductionPoints are eligible contributors and must not be summed instead. The score floor applies after all family deductions. Historical or unreconciled scores omit this explanation.",
    required: ["contractVersion", "scope", "scoreVersion", "policyVersion", "baseScore", "scoreFloor", "score", "totalPolicyDeductionPoints", "deductions"],
    properties: {
      contractVersion: { type: "string", enum: ["certscore.score-explanation.v1"] },
      scope: { type: "string", enum: ["starting_page_canonical_score"] },
      scoreVersion: { type: "string", maxLength: 120 }, policyVersion: { type: "string", maxLength: 120 },
      baseScore: { type: "integer", enum: [100] }, scoreFloor: { type: "integer", enum: [0] },
      score: { type: "integer", minimum: 0, maximum: 100 }, totalPolicyDeductionPoints: { type: "integer", minimum: 0 },
      deductions: { type: "array", maxItems: 16, items: {
        type: "object", additionalProperties: false, required: ["family", "label", "deductionPoints", "rules"],
        properties: {
          family: { type: "string", maxLength: 80 }, label: { type: "string", maxLength: 160 }, deductionPoints: { type: "integer", minimum: 1 },
          rules: { type: "array", maxItems: 40, items: {
            type: "object", additionalProperties: false, required: ["ruleId", "label", "policyDeductionPoints", "findingIds", "decisionVerification"],
            properties: {
              ruleId: { type: "string", maxLength: 160 }, label: { type: "string", maxLength: 160 }, policyDeductionPoints: { type: "integer", minimum: 1 },
              findingIds: { type: "array", maxItems: 4, items: { type: "string", maxLength: 180 } },
              decisionVerification: { type: "string", enum: ["confirmed", "unconfirmed", "not_applicable", "unknown"] },
            },
          } },
        },
      } },
    },
  },
} as const;
