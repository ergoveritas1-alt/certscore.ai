import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalRejectRecipeCmpName,
  sanitizeExactPublicTargetUrl,
  selectCaliforniaRejectCandidates,
  type CaliforniaRejectSourceRow,
} from "./select-prod-california-reject-candidates.js";

function row(overrides: Partial<CaliforniaRejectSourceRow> = {}): CaliforniaRejectSourceRow {
  return {
    assessment_source_hash: "fnv1a-0123abcd",
    assessment_version: "2.0",
    cmp_vendor_name: "OneTrust",
    completed_at: "2026-08-25T12:00:00.000Z",
    consent_first_observed_at_ms: 900,
    cooldown_until: "2026-09-22T12:00:00.000Z",
    effective_state: "cooldown",
    egress_id: "us-west-1-egress",
    egress_provider: "aws",
    final_url: "https://www.example.com/",
    last_contact_at: "2026-08-25T12:00:00.000Z",
    last_outcome: "completed",
    last_source: "production",
    normalized_domain: "example.com",
    reject_evidence_count: 1,
    reject_first_observed_at_ms: 1_200,
    reject_reason_codes: ["same_document_first_layer_control_observed"],
    scan_id: "scan-1",
    scanner_region: "us-west-1",
    ...overrides,
  };
}

test("canonical recipe lookup accepts registered CMPs with a deterministic Reject contract", () => {
  assert.equal(canonicalRejectRecipeCmpName("OneTrust"), "OneTrust");
  assert.equal(canonicalRejectRecipeCmpName("OneTrust CMP"), "OneTrust");
  assert.equal(canonicalRejectRecipeCmpName("CookiePro"), "OneTrust");
  assert.equal(canonicalRejectRecipeCmpName("Cookiebot"), "Cookiebot");
  assert.equal(canonicalRejectRecipeCmpName("Cookiebot CMP"), "Cookiebot");
  assert.equal(canonicalRejectRecipeCmpName("TrustArc"), "TrustArc");
  assert.equal(canonicalRejectRecipeCmpName("Unknown CMP"), null);
  assert.equal(canonicalRejectRecipeCmpName(null), null);
});

test("exact target sanitization strips query and fragment but rejects risky paths", () => {
  assert.deepEqual(sanitizeExactPublicTargetUrl("https://WWW.EXAMPLE.COM/privacy/?a=1#top"), {
    reason: null,
    url: "https://www.example.com/privacy/",
  });
  assert.equal(sanitizeExactPublicTargetUrl("https://example.com/checkout/").reason, "high_risk_path");
  assert.equal(sanitizeExactPublicTargetUrl("http://example.com/").reason, "invalid_or_unsupported_url");
});

test("selection fails closed for holds, blocked rows, unsupported recipes, and disallowed domains", () => {
  const result = selectCaliforniaRejectCandidates([
    row(),
    row({ normalized_domain: "blocked.test", final_url: "https://blocked.test/", effective_state: "blocked", scan_id: "scan-2" }),
    row({ normalized_domain: "sits.com", final_url: "https://www.sits.com/", scan_id: "scan-3" }),
    row({ normalized_domain: "unknown.test", final_url: "https://unknown.test/", cmp_vendor_name: "Unknown CMP", scan_id: "scan-4" }),
    row({ normalized_domain: "vercel.com", final_url: "https://vercel.com/", scan_id: "scan-5" }),
    row({ normalized_domain: "redirect.test", final_url: "https://other.test/", scan_id: "scan-6" }),
  ], 20);
  assert.deepEqual(result.selected.map((candidate) => candidate.normalizedDomain), ["example.com"]);
  assert.deepEqual(new Set(result.exclusions.map((entry) => entry.reason)), new Set([
    "blocked_or_do_not_calibrate",
    "repository_contact_hold",
    "unsupported_cmp_recipe",
    "disallowed_domain",
    "final_url_domain_mismatch",
  ]));
});

test("selection round-robins canonical CMPs while retaining recency within each CMP", () => {
  const result = selectCaliforniaRejectCandidates([
    row({ normalized_domain: "one.test", final_url: "https://one.test/", scan_id: "scan-1" }),
    row({ normalized_domain: "two.test", final_url: "https://two.test/", scan_id: "scan-2", completed_at: "2026-08-24T12:00:00.000Z" }),
    row({ normalized_domain: "cookiebot.test", final_url: "https://cookiebot.test/", scan_id: "scan-3", cmp_vendor_name: "Cookiebot" }),
    row({ normalized_domain: "uc.test", final_url: "https://uc.test/", scan_id: "scan-4", cmp_vendor_name: "Usercentrics" }),
  ], 4);
  assert.deepEqual(result.selected.map((candidate) => candidate.canonicalCmpName), [
    "Cookiebot",
    "OneTrust",
    "Usercentrics",
    "OneTrust",
  ]);
  assert.equal(result.selected[1]?.normalizedDomain, "one.test");
  assert.equal(result.selected[3]?.normalizedDomain, "two.test");
});

test("selection excludes every prior-cohort domain before filling the new cohort", () => {
  const result = selectCaliforniaRejectCandidates([
    row({ normalized_domain: "prior.test", final_url: "https://prior.test/", scan_id: "scan-1" }),
    row({ normalized_domain: "new.test", final_url: "https://new.test/", scan_id: "scan-2" }),
  ], 1, new Set(["prior.test"]));

  assert.deepEqual(result.selected.map((candidate) => candidate.normalizedDomain), ["new.test"]);
  assert.deepEqual(result.exclusions, [{
    normalizedDomain: "prior.test",
    reason: "excluded_previous_cohort",
  }]);
});

test("selection can fill the explicitly authorized fifty-target diagnostic cohort", () => {
  const rows = Array.from({ length: 50 }, (_, index) => row({
    normalized_domain: `target-${index}.test`,
    final_url: `https://target-${index}.test/`,
    scan_id: `scan-${index}`,
  }));

  assert.equal(selectCaliforniaRejectCandidates(rows, 50).selected.length, 50);
});
