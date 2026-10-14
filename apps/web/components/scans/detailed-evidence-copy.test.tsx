import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { detailedEvidenceCopy, policyFindingSummary } from "./detailed-evidence-copy";
import { DetailedEvidenceFinding } from "./detailed-evidence-finding";

test("plain-language copy preserves incomplete and review results", () => {
  for (const status of ["Limited", "Not assessed", "Review recommended", "Potential gap"]) {
    const input = { id: "evidence-row-pre_consent_third_party_tracking", status,
      title: "Tracking", summary: "Inspection incomplete — timed out" };
    const before = structuredClone(input);
    assert.equal(detailedEvidenceCopy(input).summary, input.summary);
    assert.deepEqual(input, before);
  }
  assert.equal(detailedEvidenceCopy({ id: "cmp-criterion-services", title: "Individual services can be disabled separately",
    status: "Not assessed", summary: "Inspection incomplete — timed out" }).title, "Individual services can be disabled separately");
});

test("policy copy preserves the quoted source passage verbatim", () => {
  const quote = '"Data remains until the purpose ends...[more evidence available]"';
  assert.equal(detailedEvidenceCopy({ title: "Retention disclosure", status: "Observed",
    summary: `Policy text included matching disclosure evidence: ${quote}` }).summary, `Privacy policy: ${quote}`);
});

test("policy previews summarize observed topics only when supporting passages remain available", () => {
  const input = { id: "retention_disclosure_observed", status: "Observed", hasSupportingEvidence: true,
    summary: 'Policy text included matching disclosure evidence: "Data remains until the purpose ends...[more evidence available]"' };
  const before = structuredClone(input);
  assert.equal(policyFindingSummary(input), "Describes when personal data is kept or deleted.");
  assert.deepEqual(input, before);
  assert.equal(policyFindingSummary({ ...input, hasSupportingEvidence: false }), input.summary);
  assert.equal(policyFindingSummary({ ...input, id: "unknown" }), input.summary);
  for (const status of ["Limited", "Not assessed", "Review recommended", "Potential gap", "Not observed"]) {
    assert.equal(policyFindingSummary({ ...input, status }), input.summary);
  }
  assert.equal(policyFindingSummary({ ...input, summary: "Inspection incomplete — timed out" }), "Inspection incomplete — timed out");
  assert.equal(policyFindingSummary({ ...input, id: "automated_decision_making_profiling_disclosure",
    summary: 'Profiling disclosed: individual interest tracking: "Pages visited..."' }),
    "Describes tracking pages visited to understand individual interests.");
});

test("simplified finding text does not rewrite JSON evidence", () => {
  const original = "No eligible cookie or browser-storage write was observed before a recorded consent action.";
  const html = renderToStaticMarkup(<DetailedEvidenceFinding id="evidence-row-pre_consent_cookies_storage"
    title="Non-essential pre-consent cookies/storage" summary={original} assessmentStatus="Not observed"
    evidenceJson={{ summary: original, status: "Not observed" }} correctionSteps={[]} />);
  assert.match(html, /No non-essential cookie or storage writes were detected before a consent choice/);
  assert.ok(html.includes(original));
  assert.doesNotMatch(html, /Correction steps/);
});


test("short titles retain scope and incomplete inspection reasons", () => {
  const cases = [
    ["cmp-criterion-prominence", "Accept / Reject prominence comparison", "Accept / Reject prominence"],
    ["cmp-criterion-consent_record", "Consent choices saved in the browser", "Browser consent record"],
    ["storage", "Non-essential pre-consent cookies/storage", "Non-essential storage before consent"],
  ];
  for (const [id, title, expected] of cases) {
    const input = { id, title: title!, summary: "Inspection incomplete — timed out", status: "Not assessed" };
    const before = structuredClone(input);
    assert.deepEqual(detailedEvidenceCopy(input), { title: expected, summary: input.summary });
    assert.deepEqual(input, before);
  }
});

test("expiry copy combines identical choices but preserves different durations", () => {
  const base = { id: "cmp-criterion-duration", title: "Consent-cookie expiry", status: "Observed" };
  assert.equal(detailedEvidenceCopy({ ...base, summary: "After Accept: consent, approximately 60 days; After Reject: consent, approximately 60 days. Expiry was checked; long-term behavior was not tested." }).summary,
    "Accept and Reject: consent, approximately 60 days. Expiry was checked; long-term behavior was not tested.");
  const different = "After Accept: consent, approximately 60 days; After Reject: consent, approximately 30 days.";
  assert.equal(detailedEvidenceCopy({ ...base, summary: different }).summary, different);
});
