export type AccessibilityRuleExampleLike = Record<string, unknown>;

export type RepresentativeAccessibilityExampleCoverage = {
  distinctPageCount: number;
  distinctRuleCount: number;
  hasSevereExample: boolean;
  maxImpact: string | null;
  representativeExampleCount: number;
};

export type PersistedAccessibilityRuleExampleRow = {
  description: string;
  help: string;
  help_url: string;
  impact: string | null;
  node_count: number;
  page_url: string;
  representative_selectors: string[] | null;
  rule_code: string;
  rule_group: string;
  severity: string;
};

export type NormalizedAccessibilityRuleExample = {
  description: string;
  help: string;
  helpUrl: string;
  impact: string | null;
  nodeCount: number;
  pageUrl: string;
  representativeSelectors: string[];
  ruleCode: string;
  ruleGroup: string;
  severity: string;
};

const IMPACT_RANK: Record<string, number> = {
  minor: 1,
  moderate: 2,
  serious: 3,
  high: 4,
  critical: 5
};

export function getAccessibilityStringValue(entry: AccessibilityRuleExampleLike, keys: string[]) {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function getAccessibilityNumberValue(entry: AccessibilityRuleExampleLike, keys: string[]) {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function hasStringArrayValue(entry: AccessibilityRuleExampleLike, keys: string[]) {
  return keys.some((key) => {
    const value = entry[key];
    return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0);
  });
}

export function getRepresentativeAccessibilityExampleCoverage(
  rawEvidence: Record<string, unknown> | null | undefined
): RepresentativeAccessibilityExampleCoverage {
  const emptyCoverage = {
    hasSevereExample: false,
    maxImpact: null,
    representativeExampleCount: 0,
    distinctPageCount: 0,
    distinctRuleCount: 0
  };

  if (!rawEvidence || !Array.isArray(rawEvidence.accessibilityRuleExamples)) {
    return emptyCoverage;
  }

  const pages = new Set<string>();
  const rules = new Set<string>();
  let hasSevereExample = false;
  let maxImpact: string | null = null;
  let representativeExampleCount = 0;

  for (const entry of rawEvidence.accessibilityRuleExamples) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const example = entry as AccessibilityRuleExampleLike;
    const pageUrl = getAccessibilityStringValue(example, ["pageUrl", "page_url"]);
    const ruleId = getAccessibilityStringValue(example, ["ruleId", "rule_id", "ruleCode", "rule_code"]);
    const selector =
      getAccessibilityStringValue(example, ["selector", "target"]) ??
      (hasStringArrayValue(example, ["representativeSelectors", "representative_selectors"]) ? "representative_selector" : null);
    const snippet = getAccessibilityStringValue(example, ["snippet", "message", "description", "help"]);
    const nodeCount = getAccessibilityNumberValue(example, ["nodeCount", "node_count"]);
    const impact = getAccessibilityStringValue(example, ["impact", "severity"]);

    if (!pageUrl || !ruleId || (!selector && !snippet && !(typeof nodeCount === "number" && nodeCount > 0))) {
      continue;
    }

    representativeExampleCount += 1;
    pages.add(pageUrl);
    rules.add(ruleId);

    const impactKey = impact?.toLowerCase() ?? null;
    if (impactKey && /^(?:critical|serious|high)$/.test(impactKey)) {
      hasSevereExample = true;
    }
    if (
      impactKey &&
      (maxImpact === null || (IMPACT_RANK[impactKey] ?? 0) > (IMPACT_RANK[maxImpact.toLowerCase()] ?? 0))
    ) {
      maxImpact = impact;
    }
  }

  return {
    hasSevereExample,
    maxImpact,
    representativeExampleCount,
    distinctPageCount: pages.size,
    distinctRuleCount: rules.size
  };
}

export function hasExternallyPromotableAccessibilityExamples(rawEvidence: Record<string, unknown> | null | undefined) {
  const coverage = getRepresentativeAccessibilityExampleCoverage(rawEvidence);

  return (
    coverage.hasSevereExample ||
    coverage.distinctPageCount >= 2 ||
    coverage.distinctRuleCount >= 2
  );
}

export function formatRepresentativeAccessibilityCoverage(coverage: RepresentativeAccessibilityExampleCoverage) {
  const ruleLabel = `${coverage.distinctRuleCount} rule${coverage.distinctRuleCount === 1 ? "" : "s"}`;
  const pageLabel = `${coverage.distinctPageCount} page${coverage.distinctPageCount === 1 ? "" : "s"}`;
  const impactLabel = coverage.maxImpact ? `; max impact: ${coverage.maxImpact}` : "";
  return `Representative axe examples: ${ruleLabel} across ${pageLabel}${impactLabel}.`;
}

export function normalizePersistedAccessibilityRuleExamples(
  examples: PersistedAccessibilityRuleExampleRow[]
): NormalizedAccessibilityRuleExample[] {
  return examples.map((example) => ({
    description: example.description,
    help: example.help,
    helpUrl: example.help_url,
    impact: example.impact,
    nodeCount: example.node_count,
    pageUrl: example.page_url,
    representativeSelectors: example.representative_selectors ?? [],
    ruleCode: example.rule_code,
    ruleGroup: example.rule_group,
    severity: example.severity
  }));
}
