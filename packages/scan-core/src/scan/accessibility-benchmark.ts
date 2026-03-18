export type AccessibilityBenchmarkAssertion = {
  allowedHomepageFetchStatuses?: string[];
  maxWcagErrorCountTotal?: number;
  minAccessibilityScore?: number;
  minPagesScanned?: number;
  minWcagErrorCountTotal?: number;
  requiredRuleCodes?: string[];
};

type AccessibilityBenchmarkSnapshot = {
  accessibility_score?: number | null;
  homepage_fetch_status?: string | null;
  pages_scanned?: number | null;
  wcag_error_count_total?: number | null;
};

type AccessibilityBenchmarkTopRule = {
  instanceCount: number;
  ruleCode: string;
};

export type AccessibilityBenchmarkSummary = {
  snapshot: AccessibilityBenchmarkSnapshot | null;
  topRules: AccessibilityBenchmarkTopRule[];
};

export function evaluateAccessibilityBenchmarkAssertions(input: {
  assertions?: AccessibilityBenchmarkAssertion;
  summary: AccessibilityBenchmarkSummary;
}) {
  const failures: string[] = [];
  const assertions = input.assertions;

  if (!assertions) {
    return {
      failures,
      passed: true
    };
  }

  const snapshot = input.summary.snapshot;
  const topRuleCodes = new Set(input.summary.topRules.map((rule) => rule.ruleCode));

  if (!snapshot) {
    failures.push("Missing scan snapshot.");
    return {
      failures,
      passed: false
    };
  }

  if (assertions.allowedHomepageFetchStatuses?.length) {
    const fetchStatus = snapshot.homepage_fetch_status ?? null;
    if (!fetchStatus || !assertions.allowedHomepageFetchStatuses.includes(fetchStatus)) {
      failures.push(
        `Expected homepage fetch status in ${assertions.allowedHomepageFetchStatuses.join(", ")}, received ${fetchStatus ?? "null"}.`
      );
    }
  }

  if (typeof assertions.minAccessibilityScore === "number") {
    const score = snapshot.accessibility_score ?? null;
    if (score === null || score < assertions.minAccessibilityScore) {
      failures.push(`Expected accessibility score >= ${assertions.minAccessibilityScore}, received ${score ?? "null"}.`);
    }
  }

  if (typeof assertions.minPagesScanned === "number") {
    const pagesScanned = snapshot.pages_scanned ?? null;
    if (pagesScanned === null || pagesScanned < assertions.minPagesScanned) {
      failures.push(`Expected pages scanned >= ${assertions.minPagesScanned}, received ${pagesScanned ?? "null"}.`);
    }
  }

  if (typeof assertions.minWcagErrorCountTotal === "number") {
    const totalErrors = snapshot.wcag_error_count_total ?? null;
    if (totalErrors === null || totalErrors < assertions.minWcagErrorCountTotal) {
      failures.push(`Expected WCAG error count >= ${assertions.minWcagErrorCountTotal}, received ${totalErrors ?? "null"}.`);
    }
  }

  if (typeof assertions.maxWcagErrorCountTotal === "number") {
    const totalErrors = snapshot.wcag_error_count_total ?? null;
    if (totalErrors === null || totalErrors > assertions.maxWcagErrorCountTotal) {
      failures.push(`Expected WCAG error count <= ${assertions.maxWcagErrorCountTotal}, received ${totalErrors ?? "null"}.`);
    }
  }

  if (assertions.requiredRuleCodes?.length) {
    for (const ruleCode of assertions.requiredRuleCodes) {
      if (!topRuleCodes.has(ruleCode)) {
        failures.push(`Expected rule code ${ruleCode} in top rule counts.`);
      }
    }
  }

  return {
    failures,
    passed: failures.length === 0
  };
}
