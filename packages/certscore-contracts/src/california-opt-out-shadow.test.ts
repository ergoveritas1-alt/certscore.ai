import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {assessCaliforniaRestrictionShadow, CALIFORNIA_OPT_OUT_SHADOW_VERSION, californiaRestrictionShadowSchema} from "./california-restriction-shadow";
import {hardenCaliforniaOptOutShadow} from "./california-opt-out-shadow";
import {materializeCaliforniaAgentRegistration} from "./california-agent-registration";

const source = "a".repeat(64);
const context = "California Privacy Rights under the CCPA. You may request deletion. Exercising your rights. ";
const agent = "Such authorized agent must be registered with the California Secretary of State.";
const frequency = "You may only make a CCPA request twice within a 12-month period.";
const once = "Once we receive and confirm a verifiable consumer request from you, we will stop selling your personal information.";
const list = "Right to opt out of sale. You have the right to opt-out of the Sale of your personal information. Right to opt out of sharing. You have the right to opt-out of the Sharing of your personal information. ";
const procedure = "To exercise any of the above rights, please submit a verifiable consumer privacy request to Inspired Taste by: using our online Consumer Privacy Request email at privacy@example.test. For us to fulfill your request, you must provide sufficient information for us to reasonably verify that you are the consumer from whom we collected the personal information.";
const doc = (text: string) => ({text, textSha256: createHash("sha256").update(text).digest("hex"), evidenceRef: "policy-text:fixture", url: "https://example.test/privacy"});
function analyze(text: string) {
  const document = doc(text), basis = assessCaliforniaRestrictionShadow([document], source, () => 0);
  return {document, basis, result: hardenCaliforniaOptOutShadow(basis, [document], 10, () => 0)};
}
const opt = (row: ReturnType<typeof analyze>["result"]) => row.candidates.filter(c => c.kind === "opt_out_verification");

test("reviewed direct and enumerated email-route wording retains exact UTF-16 proof and no score effect", () => {
  for (const text of [context + " You may opt-out of sale. " + once,
    context + list + procedure,
    context + "You must verify your identity before we process your request to opt-out of sale or sharing."]) {
    const {result} = analyze(text);
    assert.equal(result.version, CALIFORNIA_OPT_OUT_SHADOW_VERSION);
    assert.equal(result.scoreEffect, "none"); assert.equal(result.status, "evaluated");
    assert.equal(opt(result).length, 1);
    const proof = opt(result)[0]!;
    assert.ok(text.slice(proof.start, proof.end).includes("verif"));
    assert.ok(proof.end - proof.start <= 600);
    assert.ok(proof.contextEnd - proof.contextStart <= 8000);
    assert.equal(proof.textSha256, doc(text).textSha256);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 2048);
  }
});

test("reverse-worded opt-out exceptions and explicit narrower verification scope stay neutral", () => {
  for (const exception of [
    "No identity verification is required for opt-out requests.",
    "Identity verification is not required for requests to opt out of sale or sharing.",
    "Opting out of sale does not require identity verification.",
    "The identity verification requirement does not apply to opt-out requests.",
    "We never ask you to verify your identity to opt out.",
    "We do not require a verifiable consumer request for opt-out.",
    "The verification requirement above applies only to access and deletion; opt-out requests are exempt.",
  ]) {
    const {basis, result} = analyze(context + "You may opt out of sale. " + once + " " + exception);
    assert.deepEqual(opt(result), [], exception);
    assert.equal(result.status, "evaluated");
    assert.equal(basis.version, "california.request-restriction-shadow.v1");
  }
});

test("explicit contradictions beyond the local quote and across chunk boundaries remain holds", () => {
  const text = context + list + procedure + " ".repeat(8000) + "Identity verification is not required for opt-out requests.";
  assert.equal(opt(analyze(text).result).length, 0);
  for (const offset of [7990, 8001, 15980]) {
    const prefix = context + "You may opt out of sale. " + once;
    const text = prefix + " ".repeat(offset - prefix.length) + "Opting out of sale does not require identity verification.";
    assert.equal(opt(analyze(text).result).length, 0);
  }
});

test("list scope is substantive, current, California-bound and separate from unrelated verification", () => {
  for (const text of [
    context + procedure,
    context + "Right to opt out of sale. Table of contents. " + procedure,
    context + "Previous privacy policy. " + list + " ".repeat(500) + procedure,
    context + list + " Virginia privacy rights. " + procedure,
    context + "x".repeat(4001) + list + procedure,
    context + "You may opt out of sale. We verify access and deletion requests.",
    context + "For example, a different business may say: You must verify your identity before we process your request to opt-out of sale.",
    context + "It is not true that you must verify your identity before we process your request to opt-out of sale.",
    context + "If we have a documented good-faith belief that an opt-out request is fraudulent, you must verify your identity before we process your request to opt-out of sale.",
    context + "Our former vendor required the following: You must verify your identity before we process your request to opt-out of sale.",
    context + "You may opt out of sale. We do not sell personal information. " + once,
  ]) assert.deepEqual(opt(analyze(text).result), [], text);
  assert.equal(opt(analyze(context + "You may opt out of sale. " + once + " Alternatively, use our cookie controls.").result).length, 1,
    "A separate cookie route does not erase a stated contact-route condition; the finding remains route-scoped.");
});

test("deadline, extension failure and dense new anchors cannot change the active registration basis", () => {
  const text = context + list + procedure.repeat(34) + ". " + context + agent + " " + frequency;
  const document = doc(text), basis = assessCaliforniaRestrictionShadow([document], source, () => 0);
  const original = structuredClone(basis), registration = materializeCaliforniaAgentRegistration(basis, [document], "scan", source);
  assert.ok(registration);
  for (const clock of [() => 10, () => 0, () => {throw new Error("observer clock failed");}]) {
    const refined = hardenCaliforniaOptOutShadow(basis, [document], 10, clock);
    assert.equal(refined.status, "limited"); assert.deepEqual(opt(refined), []);
    assert.deepEqual(refined.candidates.filter(c => c.kind !== "opt_out_verification"), basis.candidates.filter(c => c.kind !== "opt_out_verification"));
    assert.ok(refined.candidateInspections <= 32);
    assert.ok(Buffer.byteLength(JSON.stringify(refined)) <= 2048);
    assert.deepEqual(basis, original);
    assert.deepEqual(materializeCaliforniaAgentRegistration(basis, [document], "scan", source), registration);
  }
});

test("an incomplete later document cannot leave a previously found opt-out candidate", () => {
  const documents = [doc(context + "You may opt out of sale. " + once), doc(context + agent + " ".repeat(9000))];
  const basis = assessCaliforniaRestrictionShadow(documents, source, () => 0);
  let calls = 0;
  const result = hardenCaliforniaOptOutShadow(basis, documents, 10, () => ++calls < 4 ? 0 : 10);
  assert.deepEqual(opt(result), []); assert.equal(result.status, "limited");
});

test("output exhaustion preserves non-opt-out facts and never emits a partial opt-out conclusion", () => {
  let document = doc(context + agent + " " + frequency);
  let basis = assessCaliforniaRestrictionShadow([document], source, () => 0);
  for (let n = 1; n <= 240; n++) {
    const candidate = {...document, evidenceRef: "界".repeat(n)};
    const candidateBasis = assessCaliforniaRestrictionShadow([candidate], source, () => 0);
    if (candidateBasis.status === "evaluated" && candidateBasis.candidates.length === 2) {document = candidate; basis = candidateBasis;}
  }
  const result = hardenCaliforniaOptOutShadow(basis, [document], 10, () => 10);
  assert.deepEqual(result.candidates, basis.candidates);
  assert.deepEqual(opt(result), []);
  assert.ok(californiaRestrictionShadowSchema.safeParse(result).success);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 2048);
});
