import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendBlocksToReviewedPrivacyRuntimeDataset,
  extractPromotablePrivacyRuntimeBlocks,
  promotePrivacyRuntimeExamples
} from "./privacy-runtime-findings-promote";

const REVIEW_SECTION = [
  "## live-preconsent-example",
  "",
  "- approval: approved",
  "- findingId: `preconsent_tracking`",
  "- findingGroup: `preconsent_tracking`",
  "- scenarioType: `positive_high_confidence`",
  "- sourceKind: `live_artifact`",
  "- notes: reviewed live artifact",
  "",
  "```json",
  JSON.stringify(
    {
      evidence: {
        requestUrls: ["https://tracker.example/collect"],
        sequenceEvidence: true,
        vendorCategories: ["advertising_marketing"],
        vendors: ["Example Ads"]
      },
      expected: {
        confidenceBand: "high",
        externalSurfacingEligibility: "eligible",
        presentationState: "confirmed",
        promotionEligibility: "eligible"
      }
    },
    null,
    2
  ),
  "```"
].join("\n");

test("extractPromotablePrivacyRuntimeBlocks reads approved markdown review sections", () => {
  const blocks = extractPromotablePrivacyRuntimeBlocks({
    content: ["# Review", "", REVIEW_SECTION].join("\n"),
    filename: "review.md"
  });

  assert.equal(blocks.length, 1);
  assert.match(blocks[0] ?? "", /live-preconsent-example/);
  assert.match(blocks[0] ?? "", /preconsent_tracking/);
});

test("extractPromotablePrivacyRuntimeBlocks skips pending markdown sections by default", () => {
  const blocks = extractPromotablePrivacyRuntimeBlocks({
    content: REVIEW_SECTION.replace("- approval: approved", "- approval: pending"),
    filename: "review.md"
  });

  assert.equal(blocks.length, 0);
});

test("appendBlocksToReviewedPrivacyRuntimeDataset appends before the reviewed array terminator", () => {
  const source = [
    'import type { PrivacyRuntimeFindingDatasetExample } from "./privacy-runtime-findings.dataset";',
    "",
    "export const PRIVACY_RUNTIME_FINDINGS_REVIEWED_EXAMPLES: PrivacyRuntimeFindingDatasetExample[] = [",
    "];"
  ].join("\n");

  const appended = appendBlocksToReviewedPrivacyRuntimeDataset(source, ['  {\n    id: "promoted-example"\n  }']);

  assert.match(appended, /id: "promoted-example"/);
  assert.match(appended, /\n\];$/);
});

test("promotePrivacyRuntimeExamples supports dry-run duplicate detection", () => {
  const dir = mkdtempSync(join(tmpdir(), "privacy-runtime-promote-"));
  const reviewPath = join(dir, "review.md");
  const datasetPath = join(dir, "reviewed.ts");
  writeFileSync(reviewPath, ["# Review", "", REVIEW_SECTION].join("\n"), "utf8");
  writeFileSync(
    datasetPath,
    [
      'import type { PrivacyRuntimeFindingDatasetExample } from "./privacy-runtime-findings.dataset";',
      "",
      "export const PRIVACY_RUNTIME_FINDINGS_REVIEWED_EXAMPLES: PrivacyRuntimeFindingDatasetExample[] = [",
      '  { id: "live-preconsent-example" } as PrivacyRuntimeFindingDatasetExample',
      "];"
    ].join("\n"),
    "utf8"
  );

  assert.throws(
    () =>
      promotePrivacyRuntimeExamples({
        datasetPath,
        dryRun: true,
        filePath: reviewPath
      }),
    /duplicate privacy runtime dataset id/
  );
});
