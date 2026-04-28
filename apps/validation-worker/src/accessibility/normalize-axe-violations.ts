import type {
  NormalizedAccessibilityFinding,
  AxeViolationLike
} from "@website-signal-risk-scanner/shared";
import {
  mapAxeRuleIdToFindingId,
  mapAxeImpactToSeverity,
  mapAxeImpactToConfidence
} from "@website-signal-risk-scanner/shared";

const REMEDIATION_TEMPLATES: Record<string, string> = {
  missing_image_alt_text: "Add meaningful alt text for informative images and empty alt text for decorative images.",
  low_color_contrast: "Adjust foreground/background color pairs to meet WCAG contrast thresholds.",
  form_label_missing: "Associate visible labels or accessible names with each form control.",
  button_accessible_name_missing: "Provide an accessible name using inner text, aria-label, or aria-labelledby.",
  link_accessible_name_missing: "Provide descriptive link text or an aria-label that conveys the link purpose.",
  document_language_missing: "Add a lang attribute to the html element with the correct language code.",
  invalid_aria_attribute_value: "Correct the ARIA attribute value to match the expected format or token.",
  invalid_aria_structure: "Ensure required child roles are present and correctly nested.",
  missing_or_invalid_main_landmark: "Add a single main landmark or ensure the existing one is valid.",
  missing_h1_heading: "Add an h1 heading as the first heading on the page.",
  empty_heading: "Provide text content inside the heading element.",
  incorrect_heading_order: "Restructure headings to follow a logical hierarchical order.",
  missing_frame_title: "Add a title attribute or aria-label to the frame or iframe.",
  invalid_list_structure: "Ensure list elements contain only valid listitem children.",
  invalid_listitem_structure: "Place listitem elements inside a valid list container.",
  meta_viewport_prevents_zoom: "Remove user-scalable=no or set maximum-scale to at least 2.",
  missing_object_alternative_text: "Provide alternative text or accessible content for the object element.",
  scrollable_region_not_focusable: "Ensure scrollable regions are keyboard accessible or have a focusable child.",
  select_accessible_name_missing: "Associate a label or provide an aria-label for the select element.",
  invalid_tabindex_value: 'Use tabindex="0" or remove the attribute; avoid positive tabindex values.',
  missing_video_captions: "Add captions or a transcript for video content.",
  missing_audio_captions: "Add a transcript for audio-only content.",
  invalid_autocomplete_value: "Use a valid autocomplete token for the form field.",
  invalid_definition_list: "Ensure dl elements contain only dt and dd groups.",
  invalid_definition_list_item: "Place dt and dd elements inside a dl container.",
  missing_region_landmark: "Wrap page content in region or section landmarks with labels where appropriate.",
  aria_input_missing_name: "Provide an accessible name for the ARIA input widget.",
  aria_toggle_missing_name: "Provide an accessible name for the ARIA toggle widget.",
  multiple_form_labels: "Ensure each form control has a single label association.",
  empty_link: "Add descriptive link text or an aria-label.",
  empty_button: "Add visible text or an aria-label to the button.",
  nested_interactive_elements: "Avoid nesting interactive elements inside one another."
};

function getRemediation(findingId: string, _axeRuleId: string): string {
  return (
    REMEDIATION_TEMPLATES[findingId] ??
    "Review the element and correct the accessibility issue according to WCAG guidance."
  );
}

function getEvidenceSummary(violation: AxeViolationLike): string {
  const nodeCount = violation.nodes?.length ?? 0;
  const ruleId = violation.id;

  switch (ruleId) {
    case "image-alt":
      return `Detected ${nodeCount} image element${nodeCount === 1 ? "" : "s"} without accessible alternative text.`;
    case "color-contrast":
      return `Detected ${nodeCount} element${nodeCount === 1 ? "" : "s"} with insufficient color contrast.`;
    case "label":
      return `Detected ${nodeCount} unlabeled form control${nodeCount === 1 ? "" : "s"}.`;
    case "button-name":
      return `Detected ${nodeCount} button${nodeCount === 1 ? "" : "s"} without an accessible name.`;
    case "link-name":
      return `Detected ${nodeCount} link${nodeCount === 1 ? "" : "s"} without an accessible name.`;
    case "html-has-lang":
      return "The document is missing a language attribute.";
    case "aria-valid-attr-value":
      return `Detected ${nodeCount} ARIA attribute${nodeCount === 1 ? "" : "s"} with invalid values.`;
    case "aria-required-children":
      return `Detected ${nodeCount} ARIA element${nodeCount === 1 ? "" : "s"} with incorrect child roles.`;
    case "landmark-one-main":
      return "The page is missing a main landmark.";
    case "page-has-heading-one":
      return "The page is missing an h1 heading.";
    default:
      return `Detected ${nodeCount} instance${nodeCount === 1 ? "" : "s"} of ${violation.description ?? violation.id}.`;
  }
}

function extractWcagCriteria(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag) => typeof tag === "string" && /^wcag\d+[a-z]+$/.test(tag))
    .map((tag) => tag.toUpperCase());
}

/**
 * Sanitize selectors to avoid storing raw DOM paths or personal data.
 * Only store a capped count of short, generic selectors.
 */
function sanitizeSelectors(selectors: unknown[]): string[] {
  if (!Array.isArray(selectors)) return [];
  const safe: string[] = [];
  for (const s of selectors.slice(0, 3)) {
    if (typeof s !== "string") continue;
    const trimmed = s.trim();
    // Reject selectors that look like they contain IDs or long paths
    if (trimmed.length > 80) continue;
    if (/\[id=["']/.test(trimmed)) continue;
    if (/\[name=["']/.test(trimmed)) continue;
    safe.push(trimmed);
  }
  return safe;
}

export function normalizeAxeViolations(
  violations: AxeViolationLike[],
  pageUrl: string
): NormalizedAccessibilityFinding[] {
  const findings: NormalizedAccessibilityFinding[] = [];

  for (const violation of violations) {
    const nodeCount = Array.isArray(violation.nodes) ? violation.nodes.length : 0;
    const impact = violation.impact ?? "unknown";
    const findingId = mapAxeRuleIdToFindingId(violation.id);
    const wcag = extractWcagCriteria(violation.tags);

    findings.push({
      id: findingId,
      label: violation.help ?? violation.id,
      pillar: "accessibility",
      section: "ada_accessibility_risk",
      evidenceCategory: "automated_wcag_violation",
      source: "axe_core",
      confidence: mapAxeImpactToConfidence(impact, nodeCount),
      directVsInferred: "direct",
      severity: mapAxeImpactToSeverity(impact),
      axeRuleId: violation.id,
      axeImpact: impact,
      wcag,
      affectedNodeCount: nodeCount,
      pageUrl,
      evidenceSummary: getEvidenceSummary(violation),
      remediation: getRemediation(findingId, violation.id)
    });
  }

  return findings;
}

export { sanitizeSelectors };
