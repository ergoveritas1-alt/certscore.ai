export const ADA_ACCESSIBILITY_FIXTURES = {
  scoreOnlySnapshot: {
    pageUrl: "https://example.com/",
    value: 88
  },
  singleModerateAxeExample: {
    accessibilityRuleExamples: [
      {
        help: "Elements must meet minimum color contrast ratio thresholds",
        impact: "moderate",
        nodeCount: 1,
        pageUrl: "https://example.com/",
        representativeSelectors: [".hero-title"],
        ruleCode: "color-contrast",
        ruleGroup: "wcag2aa",
        severity: "medium"
      }
    ],
    pageUrl: "https://example.com/",
    supportingSignals: [
      "color-contrast on https://example.com/ (.hero-title)",
      "Accessibility risk score: 88."
    ],
    value: 88
  },
  seriousAxeExample: {
    accessibilityRuleExamples: [
      {
        help: "Buttons must have discernible text",
        impact: "serious",
        nodeCount: 2,
        pageUrl: "https://example.com/",
        representativeSelectors: ["button[aria-label='']"],
        ruleCode: "button-name",
        ruleGroup: "wcag2a",
        severity: "high"
      }
    ],
    pageUrl: "https://example.com/",
    supportingSignals: [
      "button-name on https://example.com/ (button[aria-label=''])",
      "Accessibility risk score: 88."
    ],
    value: 88
  },
  multiRuleAxeExamples: {
    accessibilityRuleExamples: [
      {
        help: "Elements must meet minimum color contrast ratio thresholds",
        impact: "moderate",
        nodeCount: 2,
        pageUrl: "https://example.com/",
        representativeSelectors: [".hero-title"],
        ruleCode: "color-contrast",
        ruleGroup: "wcag2aa",
        severity: "medium"
      },
      {
        help: "Images must have alternate text",
        impact: "moderate",
        nodeCount: 1,
        pageUrl: "https://example.com/products",
        representativeSelectors: ["img.product-photo"],
        ruleCode: "image-alt",
        ruleGroup: "wcag2a",
        severity: "medium"
      }
    ],
    pageUrl: "https://example.com/",
    supportingSignals: [
      "color-contrast on https://example.com/ (.hero-title)",
      "image-alt on https://example.com/products (img.product-photo)",
      "Accessibility risk score: 88."
    ],
    value: 88
  }
} as const;
