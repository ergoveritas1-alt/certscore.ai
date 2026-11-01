import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import retained from "./test-fixtures/retained-competition-retention.json";
import {classifyGdprTransparencyTopics} from "./gdpr-transparency-topic-classifier";
import {article13DisclosureRejectReason, hasSubstantiveRetentionEvidence} from "./article13-disclosure-rejection";

test("retained entrant-data criterion keeps its precise source and unresolved duration", () => {
  assert.equal(retained.historicalSelectedWitness.signalObserved, "not_confirmed");
  assert.equal(retained.section.extractionState, "complete");
  assert.equal(retained.documentTextCoverage.status, "complete");
  assert.equal(retained.contentCoverage.status, "truncated");
  assert.equal(retained.historicalCoverageDiagnostic.coverageState, "limited");
  assert.equal(createHash("sha256").update(retained.section.textExcerpt).digest("hex"), retained.section.evidenceTextSha256);
  for (const text of [retained.clause, retained.section.textExcerpt, retained.historicalSelectedWitness.selectedPolicySectionExcerpt]) {
    const match = classifyGdprTransparencyTopics({section: {body: text}}).matches.find(m => m.topic === "data_retention");
    assert.equal(match?.evidenceExcerpt, retained.clause);
    assert.ok(match!.evidenceExcerpt.includes("reasonable period"));
    assert.equal(hasSubstantiveRetentionEvidence(text), true);
    for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
      assert.equal(article13DisclosureRejectReason(text, "data_retention", {mode}), null, mode);
  }
});

test("entrant recognition needs the same affirmative data, event, purpose and removal sequence", () => {
  const c = retained.clause;
  for (const text of [
    c.replace("will be retained", "will not be retained"),
    c.replace("Data relating to competition entrants", "Files relating to competition results"),
    c.replace("after the competition closes", "at an unspecified time"),
    c.replace("to assist us to operate competitions in a consistent manner and to deal with any queries", "for general purposes"),
    c.split(" Data will then")[0]!,
    c.replace("Data will then be removed", "Data might then be removed"),
    c.replace("queries.", "queries?"),
    c.replace(/\.$/, "?"),
    `How ${c.charAt(0).toLowerCase() + c.slice(1)}`,
  ]) {
    assert.equal(hasSubstantiveRetentionEvidence(text), false, text);
    assert.ok(!classifyGdprTransparencyTopics({section: {heading: "Competition Entries", body: text}}).matches.some(m => m.topic === "data_retention"), text);
    for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
      assert.notEqual(article13DisclosureRejectReason(text, "data_retention", {mode}), null, mode);
  }
});
