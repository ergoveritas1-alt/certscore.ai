export const ADA_ACCESSIBILITY_FIXTURES = {
  scoreOnlySnapshot: {
    pageUrl: "https://example.com/",
    value: 88
  },
  singleModerateAxeExample: {
    accessibilityRuleExamples: [
      {
        impact: "moderate",
        nodeCount: 1,
        pageUrl: "https://example.com/",
        representativeSelectors: [".hero-title"],
        ruleCode: "color-contrast"
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
        impact: "serious",
        nodeCount: 2,
        pageUrl: "https://example.com/",
        representativeSelectors: ["button[aria-label='']"],
        ruleCode: "button-name"
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
        impact: "moderate",
        nodeCount: 2,
        pageUrl: "https://example.com/",
        representativeSelectors: [".hero-title"],
        ruleCode: "color-contrast"
      },
      {
        impact: "moderate",
        nodeCount: 1,
        pageUrl: "https://example.com/products",
        representativeSelectors: ["img.product-photo"],
        ruleCode: "image-alt"
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
