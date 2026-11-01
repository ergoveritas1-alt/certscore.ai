import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import fixtures from "./test-fixtures/retained-policy-recognition-five.json";
import {classifyGdprTransparencyTopics} from "./gdpr-transparency-topic-classifier";
import {article13DisclosureRejectReason} from "./article13-disclosure-rejection";

for (const f of fixtures) {
  test(`source-bound substantive disclosure: ${f.id}`, () => {
    const before = JSON.stringify(f);
    const match = classifyGdprTransparencyTopics({section: {body: f.context}}).matches.find(m => m.topic === f.topic);
    assert.ok(match, f.id);
    // Existing quotation decoding normalizes apostrophes; original source bytes
    // and their independent hash remain in the retained fixture provenance.
    const expected = f.expectedExcerpt.replace(/’/g, "'");
    assert.equal(match.evidenceExcerpt, expected);
    assert.equal(match.matchedLocale, f.locale);
    assert.ok(f.context.replace(/’/g, "'").includes(match.evidenceExcerpt));
    assert.equal(createHash("sha256").update(f.expectedExcerpt).digest("hex"), f.excerptSha256);
    for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
      assert.equal(article13DisclosureRejectReason(match.evidenceExcerpt, f.topic, {mode}), null, mode);
    assert.equal(JSON.stringify(f), before);
  });
}

const [transfer, rights, retention, basis, destination] = fixtures;
const negativeGroups = [
  {f: transfer!, variants: [
    transfer!.expectedExcerpt.replace("Include", "We do not include"),
    transfer!.expectedExcerpt.replace("personal data", "parcels"),
    transfer!.expectedExcerpt.replace("outside the UK and EEA", "within our team"),
    transfer!.expectedExcerpt.replace(/\.$/, "?"),
  ]},
  {f: destination!, variants: [
    destination!.expectedExcerpt.replace("[Singapore]", "[Country]"),
    destination!.expectedExcerpt.replaceAll("Singapore", "Your Country"),
    destination!.expectedExcerpt.replaceAll("Singapore", "Insert Country"),
    destination!.expectedExcerpt.replace("[Singapore’s]", "[Canada’s]"),
    destination!.expectedExcerpt.replace("may be transferred", "will not be transferred"),
    destination!.expectedExcerpt.replace("outside of Your", "inside Your"),
    destination!.expectedExcerpt.replace(/\.$/, "?"),
  ]},
  {f: rights!, variants: [
    rights!.expectedExcerpt.replace("You have rights", "You do not have rights"),
    rights!.expectedExcerpt.replace("You have rights", "Requests received"),
    rights!.expectedExcerpt.replace("data use", "product use"),
    rights!.expectedExcerpt.replace(/\.$/, "?"),
    "Rights: access, correction, deletion, restriction, objection.",
  ]},
  {f: retention!, variants: [
    retention!.expectedExcerpt.replace("retains detailed", "does not retain detailed"),
    retention!.expectedExcerpt.replace("detailed data", "anonymous data"),
    retention!.expectedExcerpt.replace("120 days", "0 days"),
    retention!.expectedExcerpt.replace("retains detailed data collected", "responds to customer requests"),
    retention!.expectedExcerpt.replace(/\.$/, "?"),
    "We keep aggregate anonymous data for two years.",
  ]},
  {f: basis!, variants: [
    "Nicht " + basis!.expectedExcerpt,
    basis!.expectedExcerpt.replace("unseres", "eines anderen Unternehmens"),
    basis!.expectedExcerpt.replace("Art. 6 Abs. 1 lit. f", "Art. 6"),
    basis!.expectedExcerpt.replace("Daten gesammelt und gespeichert", "Daten nicht gesammelt und gespeichert"),
    basis!.expectedExcerpt.replace(/\.$/, "?"),
    "Art. 6 Abs. 1 lit. f DSGVO bezeichnet berechtigte Interessen.",
  ]},
];
for (const {f, variants} of negativeGroups) {
  test(`new recognition rejects unsupported or negated source clauses: ${f.id}`, () => {
    const positive = classifyGdprTransparencyTopics({section: {body: f.context}}).matches.find(m => m.topic === f.topic)!;
    for (const text of variants) {
      const matches = classifyGdprTransparencyTopics({section: {body: text}}).matches;
      assert.ok(!matches.some(m => m.matchedTerm === positive.matchedTerm), text);
    }
  });
}

test("clause recognition is independent of the reviewed company and destination", () => {
  const inputs = [retention!.expectedExcerpt.replace("Resonate", "Example Research Ltd").replace("120 days", "90 days"),
    destination!.expectedExcerpt.replaceAll("Singapore", "Canada"),
    rights!.expectedExcerpt.replace("or object", "and object")];
  for (const text of inputs) assert.ok(classifyGdprTransparencyTopics({section: {body: text}}).matches.length);
});
