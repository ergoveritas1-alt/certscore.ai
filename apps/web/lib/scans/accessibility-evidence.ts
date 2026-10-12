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
  representative_nodes?: Array<Record<string, unknown>> | null;
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
  representativeNodes?: Array<Record<string, unknown>>;
  representativeSelectors: string[];
  ruleCode: string;
  ruleGroup: string;
  severity: string;
};

export const TEXT_ALTERNATIVE_ACCESSIBILITY_RULE_IDS = new Set([
  "audio-caption",
  "image-alt",
  "input-image-alt",
  "image-redundant-alt",
  "object-alt",
  "video-caption"
]);

export const VISUAL_CONTRAST_ACCESSIBILITY_RULE_IDS = new Set([
  "color-contrast",
  "color-contrast-enhanced",
  "link-in-text-block"
]);

export const SEMANTIC_LABELING_ACCESSIBILITY_RULE_IDS = new Set([
  "aria-command-name",
  "aria-input-field-name",
  "aria-prohibited-attr",
  "aria-required-children",
  "aria-toggle-field-name",
  "aria-tooltip-name",
  "aria-treeitem-name",
  "button-name",
  "input-button-name",
  "label",
  "link-name",
  "select-name"
]);

const STRONG_SEMANTIC_LABELING_RULE_IDS = new Set([
  "aria-command-name",
  "aria-input-field-name",
  "aria-prohibited-attr",
  "aria-required-children",
  "aria-toggle-field-name",
  "aria-tooltip-name",
  "aria-treeitem-name",
  "button-name",
  "input-button-name",
  "label",
  "select-name"
]);

export const KEYBOARD_NAVIGATION_ACCESSIBILITY_RULE_IDS = new Set([
  "nested-interactive",
  "no-focusable-non-tabindex",
  "scrollable-region-focusable",
  "skip-link",
  "tabindex"
]);

export const DOCUMENT_METADATA_ACCESSIBILITY_RULE_IDS = new Set([
  "document-title",
  "html-has-lang"
]);

export const SPLIT_ACCESSIBILITY_FINDING_IDS = new Set([
  "focus_management_issue",
  "keyboard_navigation_accessibility_issue",
  "semantic_labeling_accessibility_issue",
  "text_alternative_accessibility_issue",
  "visual_contrast_accessibility_issue"
]);

/** Report evidence families; does not change promotion or scoring policy. */
export const ACCESSIBILITY_EVIDENCE_FINDING_IDS = new Set([
  ...SPLIT_ACCESSIBILITY_FINDING_IDS,
  "zoom_restriction_accessibility_issue",
  "target_size_accessibility_issue"
]);

const ACCESSIBILITY_RULE_ISSUE_DESCRIPTIONS: Record<string, string> = {
  "aria-command-name": "Command controls lacked accessible names",
  "aria-input-field-name": "Input controls lacked accessible names",
  "aria-prohibited-attr": "Elements used ARIA attributes that their roles do not allow",
  "aria-required-children": "ARIA elements were missing required child roles",
  "aria-toggle-field-name": "Toggle controls lacked accessible names",
  "aria-tooltip-name": "Tooltips lacked accessible names",
  "aria-treeitem-name": "Tree items lacked accessible names",
  "button-name": "Buttons lacked discernible accessible names",
  "input-button-name": "Input buttons lacked discernible accessible names",
  "label": "Form controls lacked associated labels",
  "link-name": "Links lacked discernible accessible names",
  "select-name": "Select controls lacked accessible names",
  "image-alt": "Images lacked required text alternatives",
  "input-image-alt": "Image buttons lacked text alternatives",
  "image-redundant-alt": "Image alternative text repeated nearby text",
  "object-alt": "Embedded objects lacked text alternatives",
  "audio-caption": "Audio lacked required text alternatives",
  "video-caption": "Video lacked required captions",
  "nested-interactive": "Interactive controls were nested inside other interactive controls",
  "scrollable-region-focusable": "Scrollable regions lacked keyboard access",
  "skip-link": "Skip links lacked an existing, focusable target",
  "tabindex": "Elements used a positive tabindex that changes the natural focus order",
  "meta-viewport": "The page viewport declared a restriction on zoom or text scaling",
  "target-size": "Pointer targets failed the size or spacing check"
};

const FOCUS_MANAGEMENT_ISSUE_TYPES = new Set([
  "background_tabbable_under_modal",
  "focus_not_moved_to_dialog",
  "focus_not_restored",
  "focus_trap_missing",
  "illogical_tab_order",
  "invisible_focus_indicator",
  "spa_route_focus_not_reset",
  "unreachable_keyboard_control"
]);

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

/** Counts rule/node occurrences, not distinct DOM nodes across different rules. */
export function getAccessibilityEvidenceScope(examples: AccessibilityRuleExampleLike[]) {
  const nodeCounts = examples.map(example => getAccessibilityNumberValue(example, ["nodeCount", "node_count", "affectedNodeCount", "affected_node_count"]));
  return {
    affectedNodes: examples.length > 0 && nodeCounts.every(count => count !== null && count >= 0)
      ? nodeCounts.reduce<number>((total, count) => total + (count ?? 0), 0)
      : null,
    pageCount: new Set(examples.flatMap(example => getAccessibilityStringValue(example, ["pageUrl", "page_url"]) ?? [])).size,
    representativeExamplesRetained: examples.length,
    representativeNodesRetained: examples.reduce((total, example) =>
      total + getAccessibilityObjectArrayValue(example, ["representativeNodes", "representative_nodes"]).length, 0)
  };
}

export function getAccessibilityExamplesForFinding(findingId: string, examples: AccessibilityRuleExampleLike[]) {
  return examples.filter(example => getAccessibilityFindingIdForRuleCode(
    getAccessibilityStringValue(example, ["ruleCode", "ruleId", "rule_code", "rule_id"])
  ) === findingId);
}

function isCertScoreCanaryOnly(examples: AccessibilityRuleExampleLike[]) {
  return examples.length > 0 && examples.every(example => {
    const pageUrl = getAccessibilityStringValue(example, ["pageUrl", "page_url"]);
    if (!pageUrl) return false;
    try {
      return new URL(pageUrl).pathname.startsWith("/.well-known/certscore-canary/sentinels/");
    } catch {
      return false;
    }
  });
}

/** Explains already-observed rule failures without claiming task blockage or legal status. */
export function describeAccessibilityEvidence(findingId: string, examples: AccessibilityRuleExampleLike[]) {
  const relevant = getAccessibilityExamplesForFinding(findingId, examples);
  if (findingId === "visual_contrast_accessibility_issue") return describeVisualContrastEvidence(relevant);
  if (relevant.length === 0) return null;
  const scope = getAccessibilityEvidenceScope(relevant);
  const scopeText = scope.pageCount > 0
    ? ` on ${scope.pageCount} tested ${isCertScoreCanaryOnly(relevant) ? "CertScore canary " : ""}${scope.pageCount === 1 ? "page" : "pages"}` : "";
  const countText = scope.affectedNodes !== null
    ? ` (${scope.affectedNodes} element ${scope.affectedNodes === 1 ? "failure" : "failures"})` : "";
  const explanations = [...new Set(relevant.flatMap(example => {
    const rule = getAccessibilityStringValue(example, ["ruleCode", "ruleId", "rule_code", "rule_id"]);
    const explanation = (rule ? ACCESSIBILITY_RULE_ISSUE_DESCRIPTIONS[rule] : null) ??
      getAccessibilityStringValue(example, ["help", "description"]);
    return explanation ? [explanation.replace(/[.!?]+$/, "")] : [];
  }))];
  return `Automated accessibility checks found failures${scopeText}${countText}.${explanations.length > 0 ? ` ${explanations.join("; ")}.` : ""}`;
}

/** Describes retained failures only; it does not determine eligibility or severity. */
export function describeVisualContrastEvidence(examples: AccessibilityRuleExampleLike[]) {
  if (examples.length === 0) return null;
  const scope = getAccessibilityEvidenceScope(examples);
  const rules = examples.map(example => getAccessibilityStringValue(example, ["ruleCode", "ruleId", "rule_code"]));
  const textContrast = rules.every(rule => rule === "color-contrast" || rule === "color-contrast-enhanced");
  const linkDistinction = rules.includes("link-in-text-block");
  const hasTextContrast = rules.some(rule => rule === "color-contrast" || rule === "color-contrast-enhanced");
  const scopeText = scope.pageCount > 0
    ? ` on ${scope.pageCount} tested ${isCertScoreCanaryOnly(examples) ? "CertScore canary " : ""}${scope.pageCount === 1 ? "page" : "pages"}`
    : "";
  const countText = scope.affectedNodes !== null ? ` (${scope.affectedNodes} element ${scope.affectedNodes === 1 ? "failure" : "failures"})` : "";
  const measurements = new Set<string>();
  for (const example of examples) {
    if (!["color-contrast", "color-contrast-enhanced"].includes(getAccessibilityStringValue(example, ["ruleCode", "ruleId", "rule_code"]) ?? "")) continue;
    for (const node of getAccessibilityObjectArrayValue(example, ["representativeNodes", "representative_nodes"])) {
      const contrast = node.colorContrast ?? node.color_contrast;
      if (!contrast || typeof contrast !== "object" || Array.isArray(contrast)) continue;
      const record = contrast as Record<string, unknown>;
      const measured = getAccessibilityNumberValue(record, ["contrastRatio"]);
      const required = getAccessibilityNumberValue(record, ["requiredContrastRatio"]);
      if (measured !== null && required !== null && measured >= 1 && required > measured) {
        measurements.add(`${measured}:1 (required ${required}:1)`);
      }
    }
  }
  const issue = textContrast ? "Low-contrast text was detected"
    : linkDistinction && !hasTextContrast ? "Links were not distinguishable from surrounding text without relying on color"
    : "Text or links failed visual-contrast checks";
  const linkDetail = linkDistinction && hasTextContrast
    ? " Retained checks found both low-contrast text and links that were not distinguishable from surrounding text without relying on color." : "";
  return `${issue}${scopeText}${countText}.${linkDetail}${measurements.size > 0 ? ` Retained examples measured ${[...measurements].slice(0, 3).join("; ")}.` : ""}`;
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

function getAccessibilityObjectArrayValue(entry: AccessibilityRuleExampleLike, keys: string[]) {
  for (const key of keys) {
    const value = entry[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
    }
  }

  return [];
}

function hasConcreteRepresentativeNodeEvidence(entry: AccessibilityRuleExampleLike) {
  const nodes = getAccessibilityObjectArrayValue(entry, ["representativeNodes", "representative_nodes"]);
  return nodes.some((node) => {
    const selectors = getAccessibilityStringArrayValue(node, ["selectors", "target", "targets"]);
    const htmlSnippet = getAccessibilityStringValue(node, ["htmlSnippet", "html_snippet", "sanitizedHtmlSnippet", "sanitized_html_snippet"]);
    const failureSummary = getAccessibilityStringValue(node, ["failureSummary", "failure_summary"]);
    return selectors.length > 0 && Boolean(htmlSnippet && failureSummary);
  });
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

export function isPromotionGradeKeyboardAccessibilityExample(entry: AccessibilityRuleExampleLike) {
  const ruleCode = getAccessibilityStringValue(entry, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
  return (
    getAccessibilityFindingIdForRuleCode(ruleCode) === "keyboard_navigation_accessibility_issue" &&
    isCompleteRepresentativeAccessibilityExample(entry) &&
    hasConcreteRepresentativeNodeEvidence(entry)
  );
}

export function isPromotionGradeSemanticLabelingAccessibilityExample(entry: AccessibilityRuleExampleLike) {
  const ruleCode = getAccessibilityStringValue(entry, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
  return (
    getAccessibilityFindingIdForRuleCode(ruleCode) === "semantic_labeling_accessibility_issue" &&
    isCompleteRepresentativeAccessibilityExample(entry) &&
    hasConcreteRepresentativeNodeEvidence(entry)
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

export function getCompleteRepresentativeAccessibilityExamples(
  rawEvidence: Record<string, unknown> | null | undefined
) {
  if (!rawEvidence || !Array.isArray(rawEvidence.accessibilityRuleExamples)) {
    return [] as AccessibilityRuleExampleLike[];
  }

  return rawEvidence.accessibilityRuleExamples
    .filter((entry): entry is AccessibilityRuleExampleLike => Boolean(entry) && typeof entry === "object")
    .filter(isCompleteRepresentativeAccessibilityExample);
}

export function getAccessibilityFindingIdForRuleCode(ruleCode: string | null | undefined) {
  if (!ruleCode) {
    return null;
  }
  if (ruleCode === "meta-viewport") return "zoom_restriction_accessibility_issue";
  if (ruleCode === "target-size") return "target_size_accessibility_issue";

  if (TEXT_ALTERNATIVE_ACCESSIBILITY_RULE_IDS.has(ruleCode)) {
    return "text_alternative_accessibility_issue";
  }
  if (VISUAL_CONTRAST_ACCESSIBILITY_RULE_IDS.has(ruleCode)) {
    return "visual_contrast_accessibility_issue";
  }
  if (SEMANTIC_LABELING_ACCESSIBILITY_RULE_IDS.has(ruleCode)) {
    return "semantic_labeling_accessibility_issue";
  }
  if (KEYBOARD_NAVIGATION_ACCESSIBILITY_RULE_IDS.has(ruleCode)) {
    return "keyboard_navigation_accessibility_issue";
  }

  return null;
}

export function inferSplitAccessibilityFindingIdFromEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const examples = getCompleteRepresentativeAccessibilityExamples(rawEvidence);
  const findingIds = examples
    .map((example) => getAccessibilityFindingIdForRuleCode(getAccessibilityStringValue(example, ["ruleCode", "rule_code", "ruleId", "rule_id"])))
    .filter((findingId): findingId is NonNullable<ReturnType<typeof getAccessibilityFindingIdForRuleCode>> => Boolean(findingId));

  if (findingIds.includes("keyboard_navigation_accessibility_issue")) {
    return "keyboard_navigation_accessibility_issue";
  }
  if (findingIds.includes("semantic_labeling_accessibility_issue")) {
    return "semantic_labeling_accessibility_issue";
  }
  if (findingIds.includes("visual_contrast_accessibility_issue")) {
    return "visual_contrast_accessibility_issue";
  }
  if (findingIds.includes("text_alternative_accessibility_issue")) {
    return "text_alternative_accessibility_issue";
  }

  return null;
}

export function hasDocumentMetadataAccessibilityExamples(rawEvidence: Record<string, unknown> | null | undefined) {
  return getCompleteRepresentativeAccessibilityExamples(rawEvidence).some((example) => {
    const ruleCode = getAccessibilityStringValue(example, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
    return Boolean(ruleCode && DOCUMENT_METADATA_ACCESSIBILITY_RULE_IDS.has(ruleCode));
  });
}

export function hasOnlyDocumentMetadataAccessibilityExamples(rawEvidence: Record<string, unknown> | null | undefined) {
  const examples = getCompleteRepresentativeAccessibilityExamples(rawEvidence);
  return (
    examples.length > 0 &&
    examples.every((example) => {
      const ruleCode = getAccessibilityStringValue(example, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
      return Boolean(ruleCode && DOCUMENT_METADATA_ACCESSIBILITY_RULE_IDS.has(ruleCode));
    })
  );
}

export function hasCompleteExamplesForAccessibilityFinding(
  rawEvidence: Record<string, unknown> | null | undefined,
  findingId: string
) {
  return getCompleteRepresentativeAccessibilityExamples(rawEvidence).some((example) => {
    const ruleCode = getAccessibilityStringValue(example, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
    return getAccessibilityFindingIdForRuleCode(ruleCode) === findingId;
  });
}

export function hasPromotableKeyboardAccessibilityEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const examples = getCompleteRepresentativeAccessibilityExamples(rawEvidence).filter((example) => {
    const ruleCode = getAccessibilityStringValue(example, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
    return getAccessibilityFindingIdForRuleCode(ruleCode) === "keyboard_navigation_accessibility_issue";
  });
  const pages = new Set<string>();
  const rules = new Set<string>();
  let hasSevereExample = false;

  for (const example of examples) {
    const pageUrl = getAccessibilityStringValue(example, ["pageUrl", "page_url"]);
    const ruleCode = getAccessibilityStringValue(example, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
    const impact = getAccessibilityStringValue(example, ["impact", "axeImpact", "axe_impact", "severity"])?.toLowerCase();
    if (pageUrl) {
      pages.add(pageUrl);
    }
    if (ruleCode) {
      rules.add(ruleCode);
    }
    if (impact && /^(?:critical|serious|high)$/.test(impact)) {
      hasSevereExample = true;
    }
  }

  return examples.some(isPromotionGradeKeyboardAccessibilityExample) && (hasSevereExample || pages.size >= 2 || rules.size >= 2);
}

export function hasPromotableSemanticLabelingAccessibilityEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const examples = getCompleteRepresentativeAccessibilityExamples(rawEvidence).filter((example) => {
    const ruleCode = getAccessibilityStringValue(example, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
    return getAccessibilityFindingIdForRuleCode(ruleCode) === "semantic_labeling_accessibility_issue";
  });
  const promotionGradeExamples = examples.filter(isPromotionGradeSemanticLabelingAccessibilityExample);
  const linkNamePages = new Set<string>();
  let linkNameExampleCount = 0;
  let linkNameNodeCount = 0;
  let hasStrongNameOrLabelRule = false;

  for (const example of promotionGradeExamples) {
    const ruleCode = getAccessibilityStringValue(example, ["ruleCode", "rule_code", "ruleId", "rule_id"]);
    const pageUrl = getAccessibilityStringValue(example, ["pageUrl", "page_url"]);
    if (ruleCode && STRONG_SEMANTIC_LABELING_RULE_IDS.has(ruleCode)) {
      hasStrongNameOrLabelRule = true;
    }
    if (ruleCode === "link-name") {
      linkNameExampleCount += 1;
      linkNameNodeCount += getAccessibilityNumberValue(example, ["nodeCount", "node_count", "affectedNodeCount", "affected_node_count"]) ?? 0;
      if (pageUrl) {
        linkNamePages.add(pageUrl);
      }
    }
  }

  return (
    promotionGradeExamples.length > 0 &&
    (hasStrongNameOrLabelRule ||
      linkNameExampleCount >= 2 ||
      linkNamePages.size >= 2 ||
      linkNameNodeCount >= 2)
  );
}

function getObjectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function hasBehaviorReproducedFocusManagementEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const nestedEvidence = (() => {
    const focusManagementEvidence = rawEvidence?.focusManagementEvidence ?? rawEvidence?.focus_management_evidence;
    if (Array.isArray(focusManagementEvidence)) {
      return focusManagementEvidence.find((entry) => Boolean(entry) && typeof entry === "object") as Record<string, unknown> | undefined;
    }
    return getObjectValue(focusManagementEvidence);
  })();
  const hybridRuntimeEvidence =
    getObjectValue(rawEvidence?.hybridRuntimeEvidence) ?? getObjectValue(rawEvidence?.hybrid_runtime_evidence);
  const hybridFocusEvidence = (() => {
    const value = hybridRuntimeEvidence?.focusManagementEvidence ?? hybridRuntimeEvidence?.focus_management_evidence;
    if (Array.isArray(value)) {
      return value.find((entry) => Boolean(entry) && typeof entry === "object") as Record<string, unknown> | undefined;
    }
    return getObjectValue(value);
  })();
  const evidence = nestedEvidence ?? hybridFocusEvidence ?? rawEvidence ?? null;
  if (!evidence) {
    return false;
  }

  const issueType = getAccessibilityStringValue(evidence, ["issueType", "issue_type"]);
  const expected = getAccessibilityStringValue(evidence, ["expected"]);
  const observed = getAccessibilityStringValue(evidence, ["observed"]);
  const evidenceStrength = getAccessibilityStringValue(evidence, ["evidenceStrength", "evidence_strength"]);
  const focusTrace = Array.isArray(evidence.focusTrace)
    ? evidence.focusTrace
    : Array.isArray(evidence.focus_trace)
      ? evidence.focus_trace
      : [];
  const dialogContext = getObjectValue(evidence.dialogContext) ?? getObjectValue(evidence.dialog_context);

  return Boolean(
    issueType &&
      FOCUS_MANAGEMENT_ISSUE_TYPES.has(issueType) &&
      expected &&
      observed &&
      evidenceStrength === "behavior_reproduced" &&
      focusTrace.length > 0 &&
      dialogContext
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
  return examples.map((example) => {
    const representativeNodes = getAccessibilityObjectArrayValue(
      example as unknown as AccessibilityRuleExampleLike,
      ["representative_nodes", "representativeNodes"]
    );

    return {
      description: example.description,
      help: example.help,
      helpUrl: example.help_url,
      impact: example.impact,
      nodeCount: example.node_count,
      pageUrl: example.page_url,
      ...(representativeNodes.length > 0 ? { representativeNodes } : {}),
      representativeSelectors: getAccessibilityStringArrayValue(
        example as unknown as AccessibilityRuleExampleLike,
        ["representative_selectors", "representativeSelectors"]
      ),
      ruleCode: example.rule_code,
      ruleGroup: example.rule_group,
      severity: example.severity
    };
  });
}
