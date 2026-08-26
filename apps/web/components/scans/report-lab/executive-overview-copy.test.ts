import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutiveOverview,
  EXECUTIVE_OVERVIEW_MAX_LENGTH,
  EXECUTIVE_OVERVIEW_MIN_LENGTH,
} from "./executive-overview-copy";

const baseInput = {
  controls: {
    accept: "Observed",
    options: "Not observed",
    reject: "Not observed",
  },
  limitedCount: 1,
  limitedItems: ["Device identification / fingerprinting signal"],
  positiveCount: 5,
  timeline: [{ at: "3.9s", label: "Consent banner" }],
  transportPositiveCount: 5,
};

function assertBounded(copy: string) {
  assert.ok(copy.length >= EXECUTIVE_OVERVIEW_MIN_LENGTH, `${copy.length} is below the minimum`);
  assert.ok(copy.length <= EXECUTIVE_OVERVIEW_MAX_LENGTH, `${copy.length} exceeds the maximum`);
}

test("executive overview remains bounded and sensible when no priority findings are projected", () => {
  const copy = buildExecutiveOverview({ ...baseInput, findings: [] });
  assertBounded(copy);
  assert.match(copy, /did not surface a priority issue/i);
  assert.match(copy, /not a legal conclusion/i);
});

test("executive overview explains a narrow consent review in plain language", () => {
  const copy = buildExecutiveOverview({
    ...baseInput,
    findings: [{ summary: "Reject was not observed.", title: "Decline consent control" }],
  });
  assertBounded(copy);
  assert.match(copy, /narrow review/i);
  assert.match(copy, /visitor choice/i);
});

test("executive overview summarizes a focused mixed review without creating new findings", () => {
  const copy = buildExecutiveOverview({
    ...baseInput,
    findings: [
      { summary: "Reject was not observed.", title: "Decline consent control" },
      { summary: "Third-party activity was retained before consent.", title: "Pre-consent tracking" },
      { summary: "Cookies were retained before consent.", title: "Pre-consent cookies/storage" },
    ],
  });
  assertBounded(copy);
  assert.match(copy, /focused review/i);
  assert.match(copy, /tracking activity and cookies\/storage/i);
  assert.match(copy, /3\.9s/);
  assert.match(copy, /device identification \/ fingerprinting signal/i);
});

test("executive overview scales to a broader review while preserving the length contract", () => {
  const findings = Array.from({ length: 6 }, (_, index) => ({
    summary: "Third-party activity was retained before consent.",
    title: `Tracking review ${index + 1}`,
  }));
  const copy = buildExecutiveOverview({ ...baseInput, findings });
  assertBounded(copy);
  assert.match(copy, /coordinated review/i);
});

test("executive overview explains the deferred post-choice check without implying a finding", () => {
  const copy = buildExecutiveOverview({
    ...baseInput,
    findings: [
      { summary: "Reject was not observed.", title: "Decline consent control" },
      { summary: "Third-party activity was retained before consent.", title: "Pre-consent tracking" },
      { summary: "Cookies were retained before consent.", title: "Pre-consent cookies/storage" },
    ],
    limitedItems: ["Post-choice tracking reduction"],
  });

  assertBounded(copy);
  assert.match(copy, /post-choice tracking was not tested/i);
  assert.match(copy, /remains unassessed/i);
  assert.doesNotMatch(copy, /verify that row manually/i);
});
