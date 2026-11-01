import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import f from "./test-fixtures/retained-polish-postal-controller.json";
import {classifyGdprTransparencyTopics, POLISH_CONTROLLER_POSTAL_STATEMENT_PATTERN} from "./gdpr-transparency-topic-classifier";
import {article13DisclosureRejectReason} from "./article13-disclosure-rejection";

test("controller quote preserves a complete same-source postal statement across abbreviations", () => {
  assert.equal(f.section.extractionState, "truncated");
  assert.equal(f.contentCoverage.status, "truncated");
  assert.equal(f.documentTextCoverage.status, "complete");
  assert.equal(createHash("sha256").update(f.section.textExcerpt).digest("hex"), f.section.evidenceTextSha256);
  assert.ok(f.historicalSelectedWitness.selectedPolicySectionExcerpt.endsWith("ul."));
  const match = classifyGdprTransparencyTopics({section: {heading: f.section.heading, body: f.section.textExcerpt}})
    .matches.find(m => m.topic === "controller_contact");
  assert.equal(match?.evidenceExcerpt, f.clause);
  assert.ok(f.section.textExcerpt.includes(match!.evidenceExcerpt));
  assert.ok(match!.evidenceExcerpt.endsWith("Europejska 4"));
  assert.doesNotMatch(match!.evidenceExcerpt, /rodo@|inspektor/i);
  assert.equal(classifyGdprTransparencyTopics({section: {heading: f.topicWindow.heading, body: f.topicWindow.textExcerpt}})
    .matches.find(m => m.topic === "controller_contact")?.evidenceExcerpt, f.clause);
  for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
    assert.equal(article13DisclosureRejectReason(f.clause, "controller_contact", {mode}), null, mode);
});

test("postal preference needs a complete affirmative statement and cannot borrow a route", () => {
  for (const text of [
    f.clause.replace("jest AB", "nie jest AB"),
    `Czy ${f.clause.charAt(0).toLowerCase() + f.clause.slice(1)}?`,
    f.clause.replace("(55-040)", "(kod niedostępny)"),
    f.clause.replace("Europejska 4", "Europejska"),
    f.clause + "?",
    f.clause.replace("ul. Europejska 4", "Kontakt podano w innym dokumencie"),
    f.historicalSelectedWitness.selectedPolicySectionExcerpt,
    f.historicalCandidate.evidenceText,
  ]) assert.equal(POLISH_CONTROLLER_POSTAL_STATEMENT_PATTERN.test(text), false, text);
  const unrelated = classifyGdprTransparencyTopics({section: {body: f.section.textExcerpt}}).matches
    .filter(m => m.topic !== "controller_contact");
  assert.ok(unrelated.every(m => m.evidenceExcerpt !== f.clause));
});

test("identity-or-contact semantics stay intact for the older role-only candidate", () => {
  const role = f.historicalCandidate.evidenceText;
  assert.equal(article13DisclosureRejectReason(role, "controller_contact", {mode: "multilingual_classifier"}), null);
  const match = classifyGdprTransparencyTopics({section: {body: role}}).matches.find(m => m.topic === "controller_contact");
  assert.ok(match);
  assert.equal(match.evidenceExcerpt, role);
});
