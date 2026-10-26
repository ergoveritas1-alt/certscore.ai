import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { assessCaliforniaRestrictionShadow } from "./california-restriction-shadow";
import { californiaAgentRegistrationSchema, californiaAgentRegistrationProjectionSchema, materializeCaliforniaAgentRegistration } from "./california-agent-registration";

const text = "California Privacy Rights under the CCPA. Such authorized agent must be registered with the California Secretary of State.";
const source = "a".repeat(64);
const documents = [{ evidenceRef: "policy-surface:policy", text, textSha256: createHash("sha256").update(text).digest("hex"), url: "https://example.test/privacy" }];
const analysis = () => assessCaliforniaRestrictionShadow(documents, source, () => 0);

test("registration persists an exact bounded positive passage from the existing analysis", () => {
  const proof = materializeCaliforniaAgentRegistration(analysis(), documents, "scan", source)!;
  assert.ok(proof);
  assert.equal(proof.excerpt, text.slice(proof.start, proof.end));
  assert.equal(proof.sourceDocumentUrl, documents[0]!.url);
  assert.ok(Buffer.byteLength(JSON.stringify(proof)) <= 2048);
  assert.ok(!JSON.stringify(proof).includes("scoreEffect"));
});

test("limited, mismatched, missing and unrelated family analysis cannot produce a score assessment", () => {
  for (const value of [undefined, {...analysis(), status: "limited", limitations: ["time_limit"]},
    {...analysis(), sourceBundleSha256: "b".repeat(64)}, {...analysis(), candidates: []}])
    assert.equal(materializeCaliforniaAgentRegistration(value, documents, "scan", source), undefined);
  assert.equal(materializeCaliforniaAgentRegistration(analysis(), [], "scan", source), undefined);
  assert.equal(materializeCaliforniaAgentRegistration(analysis(), [{...documents[0]!, textSha256: "b".repeat(64)}], "scan", source), undefined);
  assert.equal(materializeCaliforniaAgentRegistration(analysis(), [{...documents[0]!, text: "short"}], "scan", source), undefined);
});

test("invalid UTF-16 ranges, unsupported versions, URLs and oversized UTF-8 payloads fail closed", () => {
  const proof = materializeCaliforniaAgentRegistration(analysis(), documents, "scan", source)!;
  for (const patch of [{end: proof.end + 1}, {contextStart: proof.start + 1}, {contextEnd: text.length + 1},
    {documentChars: 160001}, {policyVersion: "other"}, {sourceDocumentUrl: "javascript:alert(1)"},
    {sourceDocumentUrl: "https://name:secret@example.test"},
    {excerpt: "界".repeat(600), start: 0, end: 600, contextStart: 0, contextEnd: 600, documentChars: 600}])
    assert.equal(californiaAgentRegistrationSchema.safeParse({...proof, ...patch}).success, false);
});

test("the complete canonical detail envelope has an inclusive UTF-8 cap", () => {
  const proof = materializeCaliforniaAgentRegistration(analysis(), documents, "scan", source)!;
  assert.ok(californiaAgentRegistrationProjectionSchema.safeParse({assessment: proof, documentUrl: "https://example.test/"}).success);
  const oversized = {assessment: {...proof, scanId: "s".repeat(200), evidenceRef: "r".repeat(240)}, documentUrl: "https://example.test/" + "界".repeat(770)};
  assert.ok(Buffer.byteLength(JSON.stringify(oversized)) > 3072);
  assert.equal(californiaAgentRegistrationProjectionSchema.safeParse(oversized).success, false);
});

test("optional and alternative agent wording stays excluded by the unchanged matcher", () => {
  for (const suffix of [" Registration is not required for natural persons.",
    " The registration requirement applies only to business entities."]) {
    const t = text + suffix;
    const d = [{...documents[0]!, text: t, textSha256: createHash("sha256").update(t).digest("hex")}];
    assert.equal(materializeCaliforniaAgentRegistration(assessCaliforniaRestrictionShadow(d, source, () => 0), d, "scan", source), undefined);
  }
});

test("direct alternative-agent forms are held by the scoring guard while research matching stays unchanged", () => {
  for (const suffix of [" An unregistered natural person may also act as your agent.",
    " You may instead appoint an individual who is not registered."]) {
    const t = text + suffix;
    const d = [{...documents[0]!, text: t, textSha256: createHash("sha256").update(t).digest("hex")}];
    const shadow = assessCaliforniaRestrictionShadow(d, source, () => 0);
    assert.ok(shadow.candidates.some(row => row.kind === "agent_registration"));
    assert.equal(materializeCaliforniaAgentRegistration(shadow, d, "scan", source), undefined);
  }
});
