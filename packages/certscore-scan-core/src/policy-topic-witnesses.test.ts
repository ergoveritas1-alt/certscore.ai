import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { INFORMAL_GERMAN_POLICY_CLAUSES, INADEQUATE_PURPOSE_WITNESSES, DATA_BOUND_PURPOSE_TABLE } from "../../certscore-contracts/src/test-fixtures/policy-topic-witnesses";
import { extractPolicySections, retainedArticle13SectionEvidenceFromSections, gdprTransparencyTopicCandidatesFromText } from "./scanners/policy-surface-scanner";

const sourceUrl = "https://publisher.example/privacy";
test("source extraction preserves informal German topic witnesses and original offset/hash proof", () => {
  const text = "Datenschutzerklärung. " + INFORMAL_GERMAN_POLICY_CLAUSES.map(c => c.text).join(" ");
  const sections = extractPolicySections({html: "", sourceUrl, visibleText: text});
  const witnesses = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl);
  const hash = createHash("sha256").update(text).digest("hex");
  for (const {topic} of INFORMAL_GERMAN_POLICY_CLAUSES) {
    const witness = witnesses.find(w => w.coverageArea === topic);
    assert.equal(witness?.signalObserved, "observed", `${topic}: ${JSON.stringify(witness)}`);
    assert.equal(witness?.selectedPolicySectionUrl, sourceUrl);
    assert.equal(witness?.sourceDocumentTextSha256, hash);
    assert.ok(text.includes(witness!.selectedPolicySectionExcerpt), topic);
    assert.equal(witness?.evidenceTextSha256, createHash("sha256").update(witness!.selectedPolicySectionExcerpt).digest("hex"));
  }
  assert.equal(new Set(gdprTransparencyTopicCandidatesFromText(text).map(c => c.topic)).size, 4);
});

test("purpose selection rejects a header/withdrawal witness and uses the actual data-bound purpose", () => {
  const text = "Privacy policy. " + INADEQUATE_PURPOSE_WITNESSES.join(" ") + " " + DATA_BOUND_PURPOSE_TABLE;
  const sections = extractPolicySections({html: `<main><h1>Privacy policy</h1><h2>Data table</h2><p>${INADEQUATE_PURPOSE_WITNESSES[0]}</p><h2>How we use your personal information</h2><p>${DATA_BOUND_PURPOSE_TABLE}</p><h2>Your rights</h2><p>${INADEQUATE_PURPOSE_WITNESSES[1]}</p></main>`, sourceUrl, visibleText: text});
  const witness = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl).find(w => w.coverageArea === "processing_purposes");
  assert.equal(witness?.signalObserved, "observed");
  assert.match(witness!.selectedPolicySectionExcerpt, /To send emails/);
  assert.match(witness!.selectedPolicySectionExcerpt, /Data categories:/);
  assert.doesNotMatch(witness!.selectedPolicySectionExcerpt, /withdraw your consent/);
  assert.ok(witness!.selectedPolicySectionExcerpt.length <= 640);
});

test("a concrete data-category purpose after collection-source sentences survives normalized-text extraction", () => {
  const text = "Privacy policy. Contact information such as name, e-mail address, postal address and phone number. Directly from you when you register for a service. Directly from you when you participate in a survey. Directly from you when you report a problem with our website. To provide you with the product or service for which you registered. To address the service problem you identified.";
  const witness = retainedArticle13SectionEvidenceFromSections(extractPolicySections({html: "", sourceUrl, visibleText: text}), sourceUrl).find(w => w.coverageArea === "processing_purposes");
  assert.equal(witness?.signalObserved, "observed", JSON.stringify(witness));
  assert.match(witness!.selectedPolicySectionExcerpt, /Contact information/);
  assert.match(witness!.selectedPolicySectionExcerpt, /To provide you with/);
  assert.ok(text.includes(witness!.selectedPolicySectionExcerpt));
});
