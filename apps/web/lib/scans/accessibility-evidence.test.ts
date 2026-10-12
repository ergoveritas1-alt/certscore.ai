import assert from "node:assert/strict";
import test from "node:test";
import { describeAccessibilityEvidence, describeVisualContrastEvidence, getAccessibilityEvidenceScope } from "./accessibility-evidence";

test("semantic summaries explain each retained rule and count failures without claiming unique elements", () => {
  const examples = ["aria-required-children", "button-name", "link-name"].map(ruleId => ({
    ruleId, nodeCount: 2, pageUrl: "https://example.com/", representativeNodes: [{ selectors: ["#same-node"] }]
  }));
  assert.equal(describeAccessibilityEvidence("semantic_labeling_accessibility_issue", examples),
    "Automated accessibility checks found failures on 1 tested page (6 element failures). ARIA elements were missing required child roles; Buttons lacked discernible accessible names; Links lacked discernible accessible names.");
});

test("accessibility summaries identify a retained CertScore canary page without changing ordinary page scope", () => {
  const canaryPage = "https://example.com/.well-known/certscore-canary/sentinels/privacy-evidence.html";
  assert.equal(describeAccessibilityEvidence("text_alternative_accessibility_issue", [
    { ruleId: "image-alt", nodeCount: 1, pageUrl: canaryPage }
  ]), "Automated accessibility checks found failures on 1 tested CertScore canary page (1 element failure). Images lacked required text alternatives.");
  assert.equal(describeVisualContrastEvidence([
    { ruleId: "color-contrast", nodeCount: 1, pageUrl: canaryPage }
  ]), "Low-contrast text was detected on 1 tested CertScore canary page (1 element failure).");
  assert.equal(describeAccessibilityEvidence("text_alternative_accessibility_issue", [
    { ruleId: "image-alt", nodeCount: 1, pageUrl: canaryPage },
    { ruleId: "image-alt", nodeCount: 1, pageUrl: "https://example.com/" }
  ]), "Automated accessibility checks found failures on 2 tested pages (2 element failures). Images lacked required text alternatives.");
});

test("summaries cover text alternatives, keyboard access, viewport declarations and pointer targets", () => {
  for (const [findingId, ruleId, issue] of [
    ["text_alternative_accessibility_issue", "image-alt", "Images lacked required text alternatives"],
    ["text_alternative_accessibility_issue", "image-redundant-alt", "Image alternative text repeated nearby text"],
    ["keyboard_navigation_accessibility_issue", "scrollable-region-focusable", "Scrollable regions lacked keyboard access"],
    ["zoom_restriction_accessibility_issue", "meta-viewport", "The page viewport declared a restriction on zoom or text scaling"],
    ["target_size_accessibility_issue", "target-size", "Pointer targets failed the size or spacing check"],
  ] as const) {
    assert.equal(describeAccessibilityEvidence(findingId, [{ ruleId, nodeCount: 1 }]),
      `Automated accessibility checks found failures (1 element failure). ${issue}.`);
  }
});

test("a finding summary excludes failures belonging to other accessibility families", () => {
  const examples = [
    { ruleId: "button-name", nodeCount: 2, pageUrl: "https://example.com/" },
    { ruleId: "image-alt", nodeCount: 50, pageUrl: "https://example.com/about" },
    { ruleId: "color-contrast", nodeCount: 13, pageUrl: "https://example.com/" }
  ];
  assert.equal(describeAccessibilityEvidence("semantic_labeling_accessibility_issue", examples),
    "Automated accessibility checks found failures on 1 tested page (2 element failures). Buttons lacked discernible accessible names.");
  assert.equal(describeAccessibilityEvidence("visual_contrast_accessibility_issue", examples),
    "Low-contrast text was detected on 1 tested page (13 element failures).");
  assert.equal(describeAccessibilityEvidence("keyboard_navigation_accessibility_issue", examples), null);
});

test("contrast scope distinguishes rule/node occurrences from retained samples across pages", () => {
  const examples = [
    { ruleCode: "color-contrast", pageUrl: "https://example.com/", nodeCount: 13, representativeNodes: [{}, {}, {}] },
    { ruleCode: "color-contrast", pageUrl: "https://example.com/about", nodeCount: 4, representativeNodes: [{}] }
  ];
  assert.deepEqual(getAccessibilityEvidenceScope(examples), {
    affectedNodes: 17, pageCount: 2, representativeExamplesRetained: 2, representativeNodesRetained: 4
  });
  assert.equal(describeVisualContrastEvidence(examples), "Low-contrast text was detected on 2 tested pages (17 element failures).");
});

test("missing node totals and measurements do not become counts or invented WCAG thresholds", () => {
  const examples = [{ ruleId: "color-contrast", pageUrl: "https://example.com/", representativeNodes: [{}] }];
  assert.equal(getAccessibilityEvidenceScope(examples).affectedNodes, null);
  assert.equal(describeVisualContrastEvidence(examples), "Low-contrast text was detected on 1 tested page.");
  assert.equal(describeVisualContrastEvidence([]), null);
});

test("link distinctions and enhanced contrast keep their recorded rule and threshold scope", () => {
  assert.equal(describeVisualContrastEvidence([{ ruleId: "link-in-text-block", nodeCount: 1 }]),
    "Links were not distinguishable from surrounding text without relying on color (1 element failure).");
  assert.equal(describeVisualContrastEvidence([
    { ruleId: "link-in-text-block", nodeCount: 1 },
    { ruleId: "color-contrast", nodeCount: 2 }
  ]), "Text or links failed visual-contrast checks (3 element failures). Retained checks found both low-contrast text and links that were not distinguishable from surrounding text without relying on color.");
  assert.equal(describeVisualContrastEvidence([{ ruleId: "color-contrast-enhanced", representativeNodes: [
    { colorContrast: { contrastRatio: 5, requiredContrastRatio: 7 } },
    { colorContrast: { contrastRatio: 8, requiredContrastRatio: 7 } },
  ] }]), "Low-contrast text was detected. Retained examples measured 5:1 (required 7:1).");
});
