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
  assert.match(copy, /1 priority issue for review/i);
  assert.match(copy, /visitor choice/i);
});

test("executive overview names a confirmed Reject-path failure", () => {
  const copy = buildExecutiveOverview({
    ...baseInput,
    findings: [
      { summary: "Non-essential activity persisted after confirmed Reject.", title: "Post-choice tracking reduction" },
      { summary: "Cookies were retained before consent.", title: "Pre-consent cookies/storage" },
    ],
    rejectPath: {
      observationWindowMs: 8_000,
      state: "issue_observed",
    },
  });

  assertBounded(copy);
  assert.match(copy, /confirmed Reject path did not stop qualifying non-essential activity/i);
  assert.match(copy, /retained post-Reject capture/i);
  assert.doesNotMatch(copy, /8-second|8s|8 second/i);
});

test("executive overview includes the confirmed Accept-path comparison result", () => {
  const copy = buildExecutiveOverview({
    ...baseInput,
    acceptPath: {
      observationWindowMs: 3_000,
      state: "activity_observed",
    },
    findings: [{ summary: "Consent-dependent activity followed Accept.", title: "Post-Accept activity" }],
  });

  assertBounded(copy);
  assert.match(copy, /confirmed Accept path retained consent-dependent activity/i);
  assert.match(copy, /post-Accept comparison baseline/i);
  assert.doesNotMatch(copy, /score-neutral|affect(?:s|ed)? (?:the )?score/i);
});

test("executive overview names a contradictory retained Accept state", () => {
  const copy = buildExecutiveOverview({
    ...baseInput,
    acceptPath: {
      observationWindowMs: 3_000,
      state: "review_signal",
    },
    findings: [{ summary: "The retained state contradicted Accept.", title: "Consent-state review" }],
  });

  assertBounded(copy);
  assert.match(copy, /consent record saved afterward still showed analytics and advertising as denied/i);
});

test("executive overview describes Reject outcomes without disclosing scoring treatment", () => {
  const reviewCopy = buildExecutiveOverview({
    ...baseInput,
    findings: [{ summary: "Storage remained after Reject.", title: "Post-choice storage review" }],
    rejectPath: {
      observationWindowMs: 8_000,
      state: "review_signal",
    },
  });
  const incompleteCopy = buildExecutiveOverview({
    ...baseInput,
    findings: [{ summary: "Reject testing was incomplete.", title: "Post-choice review" }],
    rejectPath: {
      note: "The deterministic control could not be verified.",
      observationWindowMs: null,
      state: "incomplete",
    },
  });

  assert.match(reviewCopy, /Reject path retained evidence requiring review/i);
  assert.match(incompleteCopy, /The deterministic control could not be verified/i);
  assert.doesNotMatch(`${reviewCopy} ${incompleteCopy}`, /score-neutral|affect(?:s|ed)? (?:the )?score|score effect|deduct|partial credit/i);
});

test("executive overview summarizes a focused mixed review without creating new findings", () => {
  const copy = buildExecutiveOverview({
    ...baseInput,
    preConsentConcerns: { tracking: true, storage: true },
    findings: [
      { summary: "Reject was not observed.", title: "Decline consent control" },
      { summary: "Third-party activity was retained before consent.", title: "Pre-consent tracking" },
      { summary: "Cookies were retained before consent.", title: "Pre-consent cookies/storage" },
    ],
  });
  assertBounded(copy);
  assert.match(copy, /3 priority issues for review/i);
  assert.match(copy, /tracking activity and cookies\/storage/i);
  assert.doesNotMatch(copy, /3\.9s|before the first consent surface/);
  assert.match(copy, /device identification \/ fingerprinting signal/i);
});

test("executive overview scales to a broader review while preserving the length contract", () => {
  const findings = Array.from({ length: 6 }, (_, index) => ({
    summary: "Third-party activity was retained before consent.",
    title: `Tracking review ${index + 1}`,
  }));
  const copy = buildExecutiveOverview({ ...baseInput, findings });
  assertBounded(copy);
  assert.match(copy, /6 priority issues for review/i);
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
  assert.match(copy, /post-choice tracking assessment has limited evidence/i);
  assert.match(copy, /see the Reject-path result/i);
  assert.doesNotMatch(copy, /verify that row manually/i);
});


test("observed after-click facts are not described as an unperformed Reject test", () => {
  const copy = buildExecutiveOverview({
    ...baseInput,
    findings: [{ title: "After-Reject observations", summary: "Two requests were recorded after Reject." }],
    limitedItems: ["Post-choice tracking reduction"],
    rejectPath: { state: "incomplete", observationWindowMs: 3000, afterClickCoverage: "complete", note: "Two requests were recorded after Reject." },
  });
  assert.match(copy, /Two requests were recorded after Reject/);
  assert.doesNotMatch(copy, /testing did not complete|tracking was not tested/);
});

test("the complete assessment cap includes a projected CMS introduction", () => {
  const copy = buildExecutiveOverview({
    ...baseInput,
    findings: Array.from({ length: 5 }, () => ({ title: "Decline consent control", summary: "Reject was not observed." })),
    priorityIntroduction: {
      title: "Unsupported CMS branch",
      summary: "WordPress declares 4.5.33: WordPress 4.1–4.6 security updates ended (>= 4.1.0 < 4.7.0). The version is declared, not runtime-confirmed; verify the installed release and any backported fixes.",
    },
    acceptPath: {
      state: "incomplete",
      observationWindowMs: 3_000,
      afterClickCoverage: "complete",
      note: "The Accept control was clicked. During 3.01s of after-click observation, 3 requests were retained and 1 main-document storage write was observed. A post-click storage snapshot was retained.",
    },
  });
  assertBounded(copy);
  assert.match(copy, /^Unsupported CMS branch: WordPress declares 4\.5\.33/);
  assert.match(copy, /not runtime-confirmed/);
  assert.match(copy, /The Accept control was clicked\.$/);
  assert.doesNotMatch(copy, /confirmed Accept path|During 3\.01s/);
});

test("oversized projected introductions are not cut into a partial assertion", () => {
  const copy = buildExecutiveOverview({
    ...baseInput,
    findings: [{ title: "Review", summary: "A projected issue needs review." }],
    priorityIntroduction: { title: "Review", summary: `${"Retained context ".repeat(50)}requires verification.` },
  });
  assert.ok(copy.length <= EXECUTIVE_OVERVIEW_MAX_LENGTH);
  assert.equal(copy, "See Regulatory Risk Review for the retained assessment details.");
});


test("Reject findings mentioning cookies do not invent a pre-consent storage concern", () => {
  const copy = buildExecutiveOverview({ ...baseInput,
    controls: { accept: "Observed", reject: "Observed", options: "Observed" },
    findings: [{ title: "Non-essential activity after confirmed Reject",
      summary: "After the cookie banner Reject control was confirmed, requests or storage writes were retained." }],
    preConsentConcerns: { tracking: false, storage: false },
    rejectPath: { observationWindowMs: 8000, state: "issue_observed" },
  });
  assert.match(copy, /confirmed Reject path did not stop/);
  assert.doesNotMatch(copy, /pre-consent storage|Cookies\/storage also|first consent surface|3\.9s/);
});

test("pre-consent overview timing claims require their own canonical concern and do not compare browser lanes", () => {
  const copy = buildExecutiveOverview({ ...baseInput,
    findings: [{ title: "Pre-consent cookies/storage", summary: "Canonical storage concern retained." }],
    preConsentConcerns: { tracking: false, storage: true },
  });
  assert.match(copy, /Cookies\/storage was retained in the pre-consent observations/);
  assert.doesNotMatch(copy, /3\.9s|before the first consent surface/);
});
