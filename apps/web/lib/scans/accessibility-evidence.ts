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

function getAccessibilityStringArrayValue(entry: AccessibilityRuleExampleLike, keys: string[]) {
  for (const key of keys) {
    const value = entry[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "string" && value.trim().length > 0) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
        }
      } catch {
        return [value.trim()];
      }
    }
  }

  return [];
}

export function isCompleteRepresentativeAccessibilityExample(entry: AccessibilityRuleExampleLike) {
  const pageUrl = getAccessibilityStringValue(entry, ["pageUrl", "page_url"]);
  const ruleCode = getAccessibilityStringValue(entry, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
  const ruleGroup = getAccessibilityStringValue(entry, ["ruleGroup", "rule_group", "wcag"]);
  const selectors = getAccessibilityStringArrayValue(entry, ["representativeSelectors", "representative_selectors"]);
  const nodeCount = getAccessibilityNumberValue(entry, ["nodeCount", "node_count", "affectedNodeCount", "affected_node_count"]);
  const impact = getAccessibilityStringValue(entry, ["impact", "axeImpact", "axe_impact"]);
  const severity = getAccessibilityStringValue(entry, ["severity"]);
  const help = getAccessibilityStringValue(entry, ["help", "label"]);

  return Boolean(
    pageUrl &&
    /^https?:\/\//i.test(pageUrl) &&
    ruleCode &&
    ruleGroup &&
    selectors.length > 0 &&
    typeof nodeCount === "number" &&
    nodeCount > 0 &&
    impact &&
    severity &&
    help
  );
}

function formatRepresentativeExampleSnippet(entry: AccessibilityRuleExampleLike) {
  const pageUrl = getAccessibilityStringValue(entry, ["pageUrl", "page_url"]);
  const ruleCode = getAccessibilityStringValue(entry, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
  const ruleGroup = getAccessibilityStringValue(entry, ["ruleGroup", "rule_group", "wcag"]);
  const selectors = getAccessibilityStringArrayValue(entry, ["representativeSelectors", "representative_selectors"]);
  const nodeCount = getAccessibilityNumberValue(entry, ["nodeCount", "node_count", "affectedNodeCount", "affected_node_count"]);
  const impact = getAccessibilityStringValue(entry, ["impact", "axeImpact", "axe_impact"]);
  const severity = getAccessibilityStringValue(entry, ["severity"]);
  const help = getAccessibilityStringValue(entry, ["help", "label"]);
  const selector = selectors[0];

  if (!pageUrl || !ruleCode || !ruleGroup || !selector || typeof nodeCount !== "number" || !impact || !severity || !help) {
    return null;
  }

  return `Axe example: ${ruleCode}/${ruleGroup} on ${pageUrl}; selector ${selector}; nodes ${nodeCount}; impact ${impact}; severity ${severity}; help: ${help}.`;
}

export function formatRepresentativeAccessibilityExampleSnippets(
  rawEvidence: Record<string, unknown> | null | undefined,
  limit = 3
) {
  if (!rawEvidence || !Array.isArray(rawEvidence.accessibilityRuleExamples)) {
    return [] as string[];
  }

  return rawEvidence.accessibilityRuleExamples
    .filter((entry): entry is AccessibilityRuleExampleLike => Boolean(entry) && typeof entry === "object")
    .filter(isCompleteRepresentativeAccessibilityExample)
    .map(formatRepresentativeExampleSnippet)
    .filter((snippet): snippet is string => typeof snippet === "string")
    .slice(0, limit);
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
    const nodeCount = getAccessibilityNumberValue(example, ["nodeCount", "node_count", "affectedNodeCount", "affected_node_count"]);
    const impact = getAccessibilityStringValue(example, ["impact", "axeImpact", "axe_impact", "severity"]);

    if (!pageUrl || !ruleId || !isCompleteRepresentativeAccessibilityExample(example)) {
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
    representativeSelectors: getAccessibilityStringArrayValue(
      example as unknown as AccessibilityRuleExampleLike,
      ["representative_selectors", "representativeSelectors"]
    ),
    ruleCode: example.rule_code,
    ruleGroup: example.rule_group,
    severity: example.severity
  }));
}
