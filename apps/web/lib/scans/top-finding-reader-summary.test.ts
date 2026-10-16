import assert from "node:assert/strict";
import test from "node:test";
import { topFindingReaderSummary } from "./top-finding-reader-summary";

test("specific post-Reject activity stays specific and unchanged", () => {
  const summary = "9 non-essential HubSpot and LinkedIn requests were observed 0.16–1.23 s after confirmed Reject.";
  assert.equal(topFindingReaderSummary({ id: "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction", title: "HubSpot and LinkedIn activity after Reject", summary }), summary);
});

test("a partial transfer finding leads with the observed fact and keeps its qualification", () => {
  const copy = topFindingReaderSummary({
    id: "regulatory_gap__gdpr_eprivacy__international_transfers_disclosure",
    title: "Outdated transfer framework referenced",
    summary: "Partial support from scan evidence; An obsolete EU-US Privacy Shield reference was observed. Privacy Shield was invalidated on 16 July 2020; the current transfer basis was not established by this scan. Review the policy wording and the safeguards actually in use.",
  });
  assert.match(copy, /^An obsolete EU-US Privacy Shield reference was observed\. Scan evidence only partially supports this finding\./);
  assert.match(copy, /current transfer basis was not established by this scan/);
});

test("a limited policy discovery finding states the tested scope and limitation without extraction internals", () => {
  const copy = topFindingReaderSummary({
    id: "regulatory_gap__gdpr_eprivacy__privacy_notice_availability",
    title: "Privacy policy not found",
    summary: "Coverage was limited by policy-surface evidence; The completed policy-surface inspection did not observe a reachable privacy notice or privacy policy in the tested context; policy text extraction not_attempted; 0 characters retained; 500 required; policy surface retained; 0 policy-text characters retained.",
  });
  assert.match(copy, /^The completed policy-surface inspection did not observe a reachable privacy notice or privacy policy in the tested context\./);
  assert.match(copy, /Policy-surface evidence was limited; verify the result manually\./);
  assert.doesNotMatch(copy, /not_attempted|characters retained|500 required/);
});

test("a generic preface yields to the projected fact without changing its scope", () => {
  const copy = topFindingReaderSummary({
    id: "regulatory_gap__gdpr_eprivacy__cookie_notice_policy_availability",
    title: "Cookie notice availability",
    summary: "Potential issue based on scan evidence; Pre-consent cookie evidence was retained, but no cookie notice was identified in the tested context.",
  });
  assert.equal(copy, "Pre-consent cookie evidence was retained, but no cookie notice was identified in the tested context.");
});

test("generic or unexpected wording never becomes an invented observation", () => {
  assert.equal(topFindingReaderSummary({ id: "unmapped", title: "Non-essential activity after confirmed Reject", summary: "Potential issue based on scan evidence." }),
    "Review the supporting evidence for “Non-essential activity after confirmed Reject”.");
  const unexpected = "Coverage was limited by policy-surface evidence; The source changed during retrieval; check source binding.";
  const copy = topFindingReaderSummary({ id: "regulatory_gap__gdpr_eprivacy__privacy_notice_availability", title: "Privacy policy not found", summary: unexpected });
  assert.match(copy, /^The source changed during retrieval; check source binding\. Policy-surface evidence was limited\./);
  assert.match(copy, /check source binding/);
});

test("unconfirmed consent and policy rows explain the limit without asserting absence", () => {
  const consent = topFindingReaderSummary({
    id: "regulatory_gap__gdpr_eprivacy__consent_surface_observed",
    title: "Consent surface",
    summary: "Not confirmed by scan evidence; The canonical pre-interaction consent assessment was limited, so consent-surface presence was not confirmed from retained evidence.",
  });
  assert.equal(consent, "The scan could not confirm whether a consent surface was present because the pre-interaction assessment was limited.");
  const policy = topFindingReaderSummary({
    id: "regulatory_gap__gdpr_eprivacy__legal_basis_disclosure_observed",
    title: "Legal basis disclosure",
    summary: "Not confirmed by scan evidence; Legal basis disclosure was not observed in a verified, complete, target-owned policy retained with sufficient row-specific absence coverage.",
  });
  assert.equal(policy, "The scan could not confirm legal basis disclosure from retained policy evidence; it did not establish that the disclosure is absent.");
});

test("reader punctuation removes a repeated terminal period without changing the canonical summary", () => {
  assert.equal(topFindingReaderSummary({ id: "preferences", title: "Preferences", summary: "A preferences control was retained.." }), "A preferences control was retained.");
  assert.equal(topFindingReaderSummary({ id: "other", title: "Other", summary: "Capture ended..." }), "Capture ended...");
});
