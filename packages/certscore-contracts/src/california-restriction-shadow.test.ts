import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { assessCaliforniaRestrictionShadow, californiaRestrictionShadowSchema } from "./california-restriction-shadow";

const source = "a".repeat(64);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const document = (text: string) => ({ text, textSha256: sha(text), evidenceRef: "policy-text:fixture", url: "https://fixture.test/privacy" });
const analyze = (text: string) => assessCaliforniaRestrictionShadow([document(text)], source, () => 0);
const agent = "Such authorized agent must be registered with the California Secretary of State.";
const verification = "Once we receive and confirm a verifiable consumer request from you, we will stop selling your personal information.";
const frequency = "You may only make a CCPA request twice within a 12-month period.";
const context = "California Privacy Rights. You may delete personal information. Exercising Your Rights under the CCPA. ";

test("narrow affirmative wording yields three source-bound shadow rows, never score effects", () => {
  const text = context + agent + " You may opt-out of sale. " + verification + " " + frequency;
  const result = analyze(text);
  assert.equal(result.status, "evaluated");
  assert.equal(result.scoreEffect, "none");
  assert.deepEqual(result.candidates.map(row => row.kind), ["agent_registration", "opt_out_verification", "blanket_frequency"]);
  for (const row of result.candidates) {
    assert.equal(row.textSha256, sha(text));
    assert.ok(text.slice(row.start, row.end).length > 10);
    assert.ok(row.contextStart <= row.start && row.contextEnd >= row.end);
  }
});

test("lawful, ambiguous, unrelated and hypothetical wording stays out", () => {
  const controls = [
    "If you would like to use an authorized agent registered with the California Secretary of State, provide written authorization.",
    "Your authorized agent is not required to be registered with the California Secretary of State.",
    "No authorized agent must be registered with the California Secretary of State.",
    "Such authorized agent must be registered with the California Secretary of State, except natural persons.",
    "Your request to know may be made twice within a 12-month period.",
    "You may only make a CCPA request for access twice within a 12-month period.",
    "We may decline requests when you previously made two CCPA requests in the prior 12 months, as otherwise permitted by applicable law.",
    "We verify requests to delete and correct. You may opt out of sharing through cookie preferences.",
    "We do not sell personal information. If we begin selling, we will notify you. " + verification,
    "A request to opt-out need not be a verifiable consumer request. We require proof of an agent's authorization.",
    "We do not respond to Do Not Track signals.",
    "The following is example wording: " + agent,
    "We previously required the following: " + agent,
    "Connecticut Consumer Rights. " + agent,
  ];
  for (const text of controls) assert.deepEqual(analyze(context + text).candidates, [], text);
  assert.deepEqual(analyze(agent).candidates, [], "State registration alone supplies no California rights context");
  assert.deepEqual(analyze("CCPA right to know. " + frequency).candidates, [], "No non-access scope");
});

test("only-you-or-person grammar is mandatory while alternatives remain held", () => {
  const text = "Only You, or a person registered with the California Secretary of State that You authorize to act on Your behalf, may make a verifiable request related to Your personal information.";
  assert.equal(analyze(context + text).candidates[0]?.kind, "agent_registration");
  assert.deepEqual(analyze(context + text.replace("Only You", "You may choose")).candidates, []);
});

const consumerAgent = "Only you, or a person registered with the California Secretary of State that you authorize to act on your behalf, may make a verifiable consumer request related to your personal information.";
const pluralAgent = "Authorized agents in California must be registered with the California Secretary of State.";

test("reviewed registration variants require the existing bounded California rights scope", () => {
  for (const clause of [consumerAgent, pluralAgent, consumerAgent.replace("California Secretary", "Secretary")]) {
    const text = context + clause;
    const result = analyze(text);
    assert.equal(result.candidates.length, 1, clause);
    const candidate = result.candidates[0]!;
    assert.equal(candidate.kind, "agent_registration");
    assert.equal(candidate.scope, "authorized_agent");
    assert.equal(candidate.textSha256, sha(text));
    assert.equal(text.slice(candidate.start, candidate.end).trim(), clause);
    assert.deepEqual(analyze(clause).candidates, [], "Registration alone does not establish California rights scope");
    assert.deepEqual(analyze(context + " Rights under the GDPR. " + clause).candidates, []);
    assert.deepEqual(analyze(context + "x".repeat(4_001) + ". " + clause).candidates, [],
      "Distant California context stays outside the unchanged window, including the retained FCP Euro supplement");
  }
});

test("new registration grammar preserves optional, alternative, entity-only and historical exclusions", () => {
  const controls = [
    consumerAgent.replace("Only you", "If you would like to use an agent, you"),
    consumerAgent.replace("that you authorize to act on your behalf", "or any person you authorize in writing"),
    consumerAgent.replace("that you authorize to act on your behalf", "or an unregistered individual you authorize"),
    pluralAgent.replace("must be", "need not be"),
    pluralAgent.replace("must be", "are not required to be"),
    "No " + pluralAgent,
    "Not all " + pluralAgent,
    "We do not require that " + pluralAgent,
    "It is not true that " + pluralAgent,
    pluralAgent + " This requirement applies only to business entities; individuals can act with written authorization.",
    pluralAgent + " This registration condition applies solely to companies.",
    pluralAgent + " Alternatively, you may authorize any natural person without registering.",
    pluralAgent + " Registration is not required for natural persons.",
    "The following is example wording: " + pluralAgent,
    "The following was wording in our previous policy. " + consumerAgent,
    "Virginia Consumer Rights. " + consumerAgent,
    "Appoint an agent to exercise your CCPA rights provided that a notarized power of attorney is presented.",
    "If you would like to use an authorized agent registered with the Secretary of State, provide written authority.",
  ];
  for (const clause of controls) assert.deepEqual(analyze(context + clause).candidates, [], clause);
});

test("independent Astra scope challenges preserve next-sentence exceptions and alternatives", () => {
  const controls = [
    agent + " Alternatively, you may authorize any natural person to act as your agent without registering with the Secretary of State.",
    agent + " This registration condition does not apply to natural persons who are authorized in writing.",
    "The following was wording in our previous policy. " + agent + " Our current policy permits any natural person you authorize.",
    "We do not sell or share personal information. Right to opt out of sale of personal information. " + verification,
    "You may opt out of sale by clicking Reject All without submitting any identity information. " + verification,
    frequency + " The two-request limit applies only to requests for access or copies of personal information.",
    "Right to Know. " + frequency,
    "EU Residents. " + agent,
    "Rights under the GDPR. " + agent,
  ];
  for (const control of controls) assert.deepEqual(analyze(context + control).candidates, [], control);
});

test("offsets remain UTF-16 source offsets across chunk boundaries and unicode", () => {
  const text = "🙂" + "x".repeat(7_850) + ". " + context + agent;
  const result = analyze(text);
  assert.equal(result.candidates.length, 1);
  assert.match(text.slice(result.candidates[0]!.start, result.candidates[0]!.end), /authorized agent must/);
  assert.equal(result.inspectedChars, text.length);
});

test("missing or oversized sources and bounded work never imply absence", () => {
  assert.equal(assessCaliforniaRestrictionShadow([], source, () => 0).status, "no_verified_sources");
  assert.equal(analyze("x".repeat(160_001)).status, "limited");
  const many = assessCaliforniaRestrictionShadow(Array.from({ length: 9 }, () => document(context + agent)), source, () => 0);
  assert.ok(many.limitations.includes("document_limit"));
  assert.equal(many.candidates.length, 1);
  const dense = analyze(context + agent.repeat(40));
  assert.equal(dense.candidateInspections, 32);
  assert.ok(dense.limitations.includes("candidate_limit"));
  let tick = 0;
  const expired = assessCaliforniaRestrictionShadow([document(context + agent)], source, () => (tick += 11));
  assert.equal(expired.status, "limited");
  assert.deepEqual(expired.candidates, []);
  assert.ok(expired.limitations.includes("time_limit"));
});

test("inclusive serialized cap uses UTF-8 bytes, bounds rows and rejects forged states", () => {
  const d = document(context + agent + " You may opt-out of sale. " + verification + " " + frequency);
  d.evidenceRef = "界".repeat(240);
  const result = assessCaliforniaRestrictionShadow([d], source, () => 0);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 2_048);
  assert.ok(result.limitations.includes("output_limit"));
  assert.equal(californiaRestrictionShadowSchema.safeParse({ ...result, scoreEffect: "deduct" }).success, false);
  assert.equal(californiaRestrictionShadowSchema.safeParse({ ...result, status: "evaluated" }).success, false);
});
