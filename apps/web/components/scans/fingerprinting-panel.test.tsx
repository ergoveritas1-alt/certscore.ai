import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FingerprintingPanel } from "./fingerprinting-panel";

test("FingerprintingPanel distinguishes weak retained indicators from probable fingerprinting", () => {
  const html = renderToStaticMarkup(createElement(FingerprintingPanel, {
    categories: [{ count: 1, firstSeenMs: 12, name: "screen_viewport" }],
    confidence: "medium",
    hasProbableFinding: false,
    label: "None detected",
    narrative: "No strong fingerprinting signal surfaced.",
    reasons: ["Observed identifier-like structuring or shaping behavior."]
  }));

  assert.match(html, /No probable fingerprinting detected/);
  assert.match(html, /Minor fingerprinting indicators retained for review/);
  assert.doesNotMatch(html, /Insufficient evidence for a probable fingerprinting finding/);
  assert.match(html, /Observed identifier-like structuring or shaping behavior/);
});

test("FingerprintingPanel keeps probable wording when the projected finding is present", () => {
  const html = renderToStaticMarkup(createElement(FingerprintingPanel, {
    categories: [{ count: 3, firstSeenMs: 12, name: "canvas_webgl" }],
    confidence: "high",
    hasProbableFinding: true,
    label: "Likely",
    narrative: "High-entropy runtime evidence was retained.",
    reasons: ["Canvas and audio primitives were retained."]
  }));

  assert.match(html, /Probable fingerprinting detected/);
  assert.match(html, /High-entropy runtime evidence was retained/);
});

test("FingerprintingPanel has a non-contradictory empty state", () => {
  const html = renderToStaticMarkup(createElement(FingerprintingPanel, {
    categories: [],
    confidence: null,
    hasProbableFinding: false,
    label: "None detected",
    reasons: []
  }));

  assert.match(html, /No probable fingerprinting detected/);
  assert.match(html, /No retained fingerprinting indicators crossed the review threshold/);
});
