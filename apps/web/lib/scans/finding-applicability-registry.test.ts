import assert from "node:assert/strict";
import test from "node:test";
import { FINDING_APPLICABILITY_REGISTRY, APPLICABILITY_REVIEWED_AT } from "./finding-applicability-registry";
import { findingApplicabilityContext } from "./finding-applicability-context";
import { REGULATORY_REVIEW_TOPICS, selectRegulatoryReview } from "./regulatory-review-catalog";

const modes = ["gdpr_eprivacy", "ccpa_cpra"] as const;
test("registry covers every existing regulatory identity/mode without ambiguous mappings", () => {
  const mappings = new Set<string>();
  const keys = new Set<string>();
  for (const entry of FINDING_APPLICABILITY_REGISTRY) {
    assert.ok(!keys.has(entry.key)); keys.add(entry.key);
    assert.ok(entry.when.length && entry.checks.length >= 2);
    for (const mode of entry.modes) for (const id of entry.findingIds) {
      const key = `${mode}:${id}`;
      assert.ok(!mappings.has(key), key); mappings.add(key);
      assert.equal(findingApplicabilityContext(id, mode).key, entry.key);
    }
  }
  for (const topic of REGULATORY_REVIEW_TOPICS) for (const mode of modes) {
    if (!topic.contexts[mode]) continue;
    for (const id of topic.findingIds) assert.ok(mappings.has(`${mode}:${id}`), `${topic.id}:${mode}:${id}`);
  }
});

test("unknown or wrong-mode identities never borrow a legal obligation from a name or prefix", () => {
  for (const id of ["california_new_unknown", "regulatory_gap__gdpr_eprivacy__unknown", "unknown_dpo_contact", "site_integrity_new"]) {
    for (const mode of modes) assert.equal(findingApplicabilityContext(id, mode).key, null);
  }
  assert.equal(findingApplicabilityContext("gpc_response", "gdpr_eprivacy").key, null);
  assert.equal(findingApplicabilityContext("regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage", "ccpa_cpra").key, null);
  assert.notEqual(findingApplicabilityContext("regulatory_gap__gdpr_eprivacy__privacy_notice_availability", modes[0]).key,
    findingApplicabilityContext("regulatory_gap__gdpr_eprivacy__privacy_notice_availability", modes[1]).key);
});

test("specialized projected findings have scope-specific guidance without regulatory promotion", () => {
  for (const id of ["california_collection_review", "california_post_reject_collection", "gpp_propagation_inconsistency"]) {
    assert.ok(findingApplicabilityContext(id, "ccpa_cpra").key);
    assert.equal(findingApplicabilityContext(id, "gdpr_eprivacy").key, null);
  }
  for (const id of ["site_integrity_cms_security", "site_integrity_hidden_outbound_links", "form_data_unexpected_destination"]) {
    for (const mode of modes) assert.match(findingApplicabilityContext(id, mode).scopeCheck, /technical evidence/);
  }
  assert.match(findingApplicabilityContext("california_collection_review", "ccpa_cpra").checks.join(" "), /does not establish sale\/sharing/);
  assert.match(findingApplicabilityContext("regulatory_gap__gdpr_eprivacy__dpo_contact_point_disclosure", modes[0]).when, /not every website/);
  assert.match(findingApplicabilityContext("regulatory_gap__gdpr_eprivacy__automated_decision_making_profiling_disclosure", modes[0]).when, /solely automated/);
});

test("guidance links remain primary sources with explicit editorial review date", () => {
  assert.equal(APPLICABILITY_REVIEWED_AT, "2026-10-24");
  const domains = new Set(["eur-lex.europa.eu", "www.edpb.europa.eu", "commission.europa.eu", "cppa.ca.gov", "www.cppa.ca.gov", "www.w3.org", "www.ada.gov"]);
  for (const entry of FINDING_APPLICABILITY_REGISTRY) for (const mode of entry.modes) {
    for (const source of findingApplicabilityContext(entry.findingIds[0]!, mode).sources) {
      const url = new URL(source.url);
      assert.equal(url.protocol, "https:"); assert.ok(domains.has(url.hostname)); assert.ok(source.label);
    }
  }
});

test("render-context resolution leaves finding order, scores and evidence unchanged", () => {
  const findings = FINDING_APPLICABILITY_REGISTRY.map((row, index) => Object.freeze({
    id: row.findingIds[0]!, rank: index + 1, status: "Partial concern", score: 83,
    evidenceJson: Object.freeze({ observation: "unchanged", scoreEffect: "deduction" }),
  }));
  const before = structuredClone(findings);
  for (const mode of modes) {
    const selectedBefore = selectRegulatoryReview(findings, mode);
    findings.forEach(finding => findingApplicabilityContext(finding.id, mode));
    assert.deepEqual(selectRegulatoryReview(findings, mode), selectedBefore);
  }
  assert.deepEqual(findings, before);
});
