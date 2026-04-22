import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendBlocksToLegacyDataset,
  extractPromotableExampleBlocks,
  promoteFinancialClaimsExamples
} from "./financial-commercial-claims-promote";

test("extractPromotableExampleBlocks reads example blocks from markdown review files", () => {
  const markdown = [
    "# Financial Claims Draft Review",
    "",
    "## example-one",
    "",
    "- approval: approved",
    "",
    "```ts",
    'example({\n  id: "example-one"\n})',
    "```",
    "",
    "## example-two",
    "",
    "- approval: pending",
    "",
    "```ts",
    'example({\n  id: "example-two"\n})',
    "```"
  ].join("\n");

  const blocks = extractPromotableExampleBlocks({
    content: markdown,
    filename: "review.md"
  });

  assert.equal(blocks.length, 1);
  assert.match(blocks[0] ?? "", /example-one/);
});

test("extractPromotableExampleBlocks can include pending markdown entries when requested", () => {
  const markdown = [
    "# Financial Claims Draft Review",
    "",
    "## example-one",
    "",
    "- approval: approved",
    "",
    "```ts",
    'example({\n  id: "example-one"\n})',
    "```",
    "",
    "## example-two",
    "",
    "- approval: pending",
    "",
    "```ts",
    'example({\n  id: "example-two"\n})',
    "```"
  ].join("\n");

  const blocks = extractPromotableExampleBlocks({
    content: markdown,
    filename: "review.md",
    includePending: true
  });

  assert.equal(blocks.length, 2);
  assert.match(blocks[0] ?? "", /example-one/);
  assert.match(blocks[1] ?? "", /example-two/);
});

test("extractPromotableExampleBlocks renders blocks from JSON draft arrays", () => {
  const json = JSON.stringify([
    {
      id: "example-json",
      bucket: "positive_high_confidence",
      split: "eval",
      notes: "json draft",
      sourceUrl: "https://example.com",
      input: {
        adjacentAfter: null,
        adjacentBefore: "example.com",
        blockHeading: null,
        blockText: "Guaranteed returns.",
        candidateSignals: ["guarantee", "investment_context"],
        pageType: "homepage",
        pageUrl: "https://example.com",
        sourceType: "page_evidence"
      },
      expected: {
        claimPresent: true,
        claimType: "guaranteed_outcome_claim",
        claimText: "Guaranteed returns.",
        commercialContext: true,
        contextType: "financial_offer",
        adjacentDisclosurePresent: false,
        adjacentDisclosureType: null,
        adjacentDisclosureText: null,
        guaranteeLanguage: true,
        superlativeLanguage: false,
        simulatedPerformanceLanguage: false,
        urgencyPresent: false,
        urgencyTiedToConversion: false,
        pricingPresent: false,
        feeDisclosurePresent: false,
        confidence: 0.9,
        rationaleShort: "json draft"
      },
      pageExpectation: {
        expectedFindingIds: ["guaranteed_outcome_claim_detected"],
        expectedCardMode: "findings",
        shouldShowFinancialCard: true
      }
    }
  ]);

  const blocks = extractPromotableExampleBlocks({
    content: json,
    filename: "drafts.json"
  });

  assert.equal(blocks.length, 1);
  assert.match(blocks[0] ?? "", /example-json/);
});

test("promoteFinancialClaimsExamples supports dry-run duplicate detection", () => {
  const dir = mkdtempSync(join(tmpdir(), "financial-claims-promote-"));
  const filePath = join(dir, "review.md");
  writeFileSync(
    filePath,
    ["## duplicate-example", "", "- approval: approved", "", "```ts", 'example({\n  id: "earnings-claim-no-disclosure"\n})', "```"].join("\n"),
    "utf8"
  );

  assert.throws(
    () =>
      promoteFinancialClaimsExamples({
        datasetPath: "/Users/benmasek/WC01/packages/validation-shared/legacy/financial-commercial-claims.dataset.js",
        dryRun: true,
        filePath
      }),
    /duplicate dataset id/
  );
});

test("appendBlocksToLegacyDataset appends before a summary function that immediately follows the array", () => {
  const source = [
    "const example = (value) => value;",
    "exports.FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED = [",
    "    example({",
    '        id: "seed-example"',
    "    })",
    "];",
    "function summarizeFinancialCommercialClaimsDataset() {",
    "  return null;",
    "}"
  ].join("\n");

  const appended = appendBlocksToLegacyDataset(source, ['example({\n  id: "promoted-example"\n})']);

  assert.match(appended, /id: "seed-example"/);
  assert.match(appended, /id: "promoted-example"/);
  assert.match(appended, /\n    example\(\{\n      id: "promoted-example"\n    \}\)\n\];\nfunction summarizeFinancialCommercialClaimsDataset\(/);
});
