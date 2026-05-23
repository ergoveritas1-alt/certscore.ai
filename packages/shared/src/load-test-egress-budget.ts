export type LoadTestEgressBudgetDecision = "pass" | "warn" | "block" | "delay";

export type LoadTestEgressBudgetPolicy = {
  cooldownUntil: string | null;
  egress_id: string;
  egress_provider: string;
  manualPause: boolean;
  maxConcurrentNonTerminal: number;
  maxStartedPerHour: number;
  minCompletedWindowForQualityContext: number;
};

export type LoadTestEgressBudgetEvidence = {
  currentNonTerminalCount: number | null;
  currentScannerQueueCount: number | null;
  recentCompletedCount: number | null;
  recentStartedCount: number | null;
};

export type LoadTestEgressBudgetCheck = {
  batchId: string;
  caveats: string[];
  checked_at: string;
  currentNonTerminalCount: number | null;
  currentScannerQueueCount: number | null;
  decision: LoadTestEgressBudgetDecision;
  egress_id: string;
  egress_provider: string;
  policy: LoadTestEgressBudgetPolicy;
  reasons: string[];
  recentCompletedCount: number | null;
  recentStartedCount: number | null;
  recommendedResumeAt: string | null;
};

export const DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY: LoadTestEgressBudgetPolicy = {
  cooldownUntil: null,
  egress_id: "aws-default",
  egress_provider: "aws",
  manualPause: false,
  maxConcurrentNonTerminal: 25,
  maxStartedPerHour: 50,
  minCompletedWindowForQualityContext: 25
};

function parseDateMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isoOrNull(ms: number | null) {
  return ms === null ? null : new Date(ms).toISOString();
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function normalizeLoadTestEgressBudgetPolicy(
  input?: Partial<LoadTestEgressBudgetPolicy> | null
): LoadTestEgressBudgetPolicy {
  return {
    ...DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY,
    ...input,
    cooldownUntil: typeof input?.cooldownUntil === "string" && input.cooldownUntil.trim() ? input.cooldownUntil : null,
    egress_id:
      typeof input?.egress_id === "string" && input.egress_id.trim()
        ? input.egress_id.trim()
        : DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY.egress_id,
    egress_provider:
      typeof input?.egress_provider === "string" && input.egress_provider.trim()
        ? input.egress_provider.trim()
        : DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY.egress_provider,
    manualPause: input?.manualPause === true,
    maxConcurrentNonTerminal: normalizeNonNegativeInteger(
      input?.maxConcurrentNonTerminal,
      DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY.maxConcurrentNonTerminal
    ),
    maxStartedPerHour: normalizeNonNegativeInteger(
      input?.maxStartedPerHour,
      DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY.maxStartedPerHour
    ),
    minCompletedWindowForQualityContext: normalizeNonNegativeInteger(
      input?.minCompletedWindowForQualityContext,
      DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY.minCompletedWindowForQualityContext
    )
  };
}

export function evaluateLoadTestEgressBudget(input: {
  batchId: string;
  checkedAt?: string;
  caveats?: string[];
  evidence: LoadTestEgressBudgetEvidence;
  policy?: Partial<LoadTestEgressBudgetPolicy> | null;
}): LoadTestEgressBudgetCheck {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const checkedAtMs = parseDateMs(checkedAt) ?? Date.now();
  const policy = normalizeLoadTestEgressBudgetPolicy(input.policy);
  const caveats = [...(input.caveats ?? [])];
  const reasons: string[] = [];
  let decision: LoadTestEgressBudgetDecision = "pass";
  let recommendedResumeAt: string | null = null;

  const cooldownMs = parseDateMs(policy.cooldownUntil);
  if (policy.manualPause) {
    decision = "block";
    reasons.push(`Manual pause is active for egress_id=${policy.egress_id}.`);
  }

  if (cooldownMs !== null && cooldownMs > checkedAtMs) {
    decision = decision === "block" ? "block" : "delay";
    recommendedResumeAt = isoOrNull(cooldownMs);
    reasons.push(`Cooldown is active until ${recommendedResumeAt}.`);
  } else if (policy.cooldownUntil && cooldownMs === null) {
    decision = "block";
    reasons.push(`Cooldown value is not a valid timestamp: ${policy.cooldownUntil}.`);
  }

  if (input.evidence.currentNonTerminalCount === null) {
    decision = "block";
    reasons.push("Current non-terminal per-egress count is unavailable.");
  } else if (input.evidence.currentNonTerminalCount >= policy.maxConcurrentNonTerminal) {
    decision = decision === "block" ? "block" : "delay";
    recommendedResumeAt = recommendedResumeAt ?? new Date(checkedAtMs + 5 * 60 * 1000).toISOString();
    reasons.push(
      `Current non-terminal count ${input.evidence.currentNonTerminalCount} has reached maxConcurrentNonTerminal=${policy.maxConcurrentNonTerminal}.`
    );
  }

  if (input.evidence.recentStartedCount === null) {
    decision = "block";
    reasons.push("Recent started per-egress count is unavailable.");
  } else if (input.evidence.recentStartedCount >= policy.maxStartedPerHour) {
    decision = decision === "block" ? "block" : "delay";
    recommendedResumeAt = recommendedResumeAt ?? new Date(checkedAtMs + 60 * 60 * 1000).toISOString();
    reasons.push(
      `Recent started count ${input.evidence.recentStartedCount} has reached maxStartedPerHour=${policy.maxStartedPerHour}.`
    );
  }

  if (input.evidence.recentCompletedCount === null) {
    caveats.push("Recent completed count is unavailable, so quality-context sufficiency could not be assessed.");
  } else if (input.evidence.recentCompletedCount < policy.minCompletedWindowForQualityContext && decision === "pass") {
    decision = "warn";
    reasons.push(
      `Recent completed count ${input.evidence.recentCompletedCount} is below minCompletedWindowForQualityContext=${policy.minCompletedWindowForQualityContext}.`
    );
  }

  if (input.evidence.currentScannerQueueCount === null) {
    caveats.push("Current scanner queue count is unavailable.");
  }

  if (reasons.length === 0) {
    reasons.push("Egress budget evidence is within configured limits.");
  }

  return {
    batchId: input.batchId,
    caveats,
    checked_at: checkedAt,
    currentNonTerminalCount: input.evidence.currentNonTerminalCount,
    currentScannerQueueCount: input.evidence.currentScannerQueueCount,
    decision,
    egress_id: policy.egress_id,
    egress_provider: policy.egress_provider,
    policy,
    reasons,
    recentCompletedCount: input.evidence.recentCompletedCount,
    recentStartedCount: input.evidence.recentStartedCount,
    recommendedResumeAt
  };
}

export function assertLoadTestEgressBudgetAllowsEnqueue(check: Pick<LoadTestEgressBudgetCheck, "decision" | "recommendedResumeAt" | "reasons">) {
  if (check.decision === "block" || check.decision === "delay") {
    const resume = check.recommendedResumeAt ? ` Recommended resume time: ${check.recommendedResumeAt}.` : "";
    throw new Error(`Egress budget check ${check.decision}: ${check.reasons.join(" ")}${resume}`);
  }
}
