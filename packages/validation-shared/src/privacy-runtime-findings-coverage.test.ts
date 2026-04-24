import assert from "node:assert/strict";
import test from "node:test";
import {
  renderPrivacyRuntimeFindingsCoverageMarkdown,
  summarizePrivacyRuntimeFindingsCoverage
} from "./privacy-runtime-findings-coverage";

test("privacy runtime coverage report has no seed distribution gaps", () => {
  const snapshot = summarizePrivacyRuntimeFindingsCoverage();

  assert.equal(snapshot.currentExampleCount, 180);
  assert.deepEqual(snapshot.gapSummary, []);
});

test("privacy runtime coverage markdown includes target finding families", () => {
  const markdown = renderPrivacyRuntimeFindingsCoverageMarkdown();

  assert.match(markdown, /preconsent_tracking/);
  assert.match(markdown, /fingerprinting/);
  assert.match(markdown, /dark_pattern_consent/);
  assert.match(markdown, /disclosure_runtime_mismatch/);
});
