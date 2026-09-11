import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  loadAroReplayCorpus,
  replayAroCaptureRegression,
  type AroReplayCorpus,
} from "./aro-capture-regression";

const fixturePath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../packages/certscore-contracts/fixtures/aro-capture/reviewed-corpus.json",
);

test("replays the reviewed non-Ergo A/R/O corpus through the canonical boundary", () => {
  const corpus = loadAroReplayCorpus(fixturePath);
  const report = replayAroCaptureRegression(corpus);

  assert.equal(report.inputCases, corpus.cases.length);
  assert.equal(report.replayedCases, corpus.cases.length);
  assert.deepEqual(report.schemaFailures, []);
  assert.deepEqual(report.compatibilityFailures, []);
  assert.equal(report.unchangedCases, 6);
  assert.deepEqual(
    report.changedConclusions.map(({ scanId, field, stored, replayed }) => ({ scanId, field, stored, replayed })),
    [
      { scanId: "fixture-toast-reject-non-necessary", field: "reject", stored: "not_observed", replayed: "observed" },
      { scanId: "fixture-zeplin-allow", field: "accept", stored: "not_observed", replayed: "observed" },
      { scanId: "fixture-gov-accept-additional", field: "accept", stored: "not_observed", replayed: "observed" },
      { scanId: "fixture-cookiebot-details", field: "options", stored: "not_observed", replayed: "observed" },
    ],
  );
});

test("fails closed when an excluded ErgoVeritas record is supplied", () => {
  const corpus = loadAroReplayCorpus(fixturePath);
  const excludedCase = { ...corpus.cases[0], scanId: "fixture-ergo-excluded", domain: "www.ergoveritas.com" };
  const excludedCorpus: AroReplayCorpus = { ...corpus, cases: [...corpus.cases, excludedCase] };
  const report = replayAroCaptureRegression(excludedCorpus);

  assert.equal(report.replayedCases, corpus.cases.length);
  assert.equal(report.compatibilityFailures.length, 1);
  assert.match(report.compatibilityFailures[0]?.message ?? "", /Excluded domain/);
});

test("fixture is local, bounded, and does not embed retained cohort bundles", () => {
  const stat = fs.statSync(fixturePath);
  assert.ok(stat.size < 100_000, `fixture unexpectedly large: ${stat.size} bytes`);
  const corpus = loadAroReplayCorpus(fixturePath);
  assert.equal(corpus.sourceCohortRecords, 662);
  assert.equal(corpus.attribution, "model_assisted");
  assert.ok(corpus.cases.every((item) => item.attribution === "model_assisted"));
});
