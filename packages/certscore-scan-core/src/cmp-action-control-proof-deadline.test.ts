import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { Frame, Locator, Page } from "playwright";
import type { ConsentActionControlProof } from "@certscore/contracts";
import { assertReviewedRejectDispatchAllowed, buildConsentActionControlProof } from "./cmp-action-control-proof.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {resolve = done;});
  return {promise, resolve};
}

const customHandler = "function grantConsent() {}";
function proofFixture(input: { hold?: "scope" | "labels" | "uniqueness" | "geometry" | "custom"; pending?: Promise<void>; label?: string; page?: Page } = {}) {
  const commands: string[] = [];
  const label = input.label ?? "Accept all";
  const frame = {url: () => "https://example.test/"} as Frame;
  const read = async <T>(stage: string, value: T) => {
    commands.push(stage);
    if (input.hold === stage) await input.pending;
    return value;
  };
  let calls = 0;
  const control = {
    evaluate: async () => ++calls === 1 ? read("scope", "interactive")
      : calls === 2 ? read("labels", {visibleText: label}) : read("custom", {tagName: "div", source: customHandler}),
    elementHandle: async () => {
      commands.push("handle");
      return {isVisible: async () => true, isEnabled: async () => true,
        evaluate: async () => read("geometry", {scopeInteractive: true, boundingBoxInViewport: true, centerHitTargetRelation: "control_or_descendant"}),
        dispose: async () => {}};
    },
  } as unknown as Locator;
  const page = input.page ?? {url: () => "https://example.test/", mainFrame: () => frame, frames: () => [frame],
    locator: () => ({evaluateAll: async () => read("uniqueness", [{visibleText: label}])})} as unknown as Page;
  let callbacks = 0;
  const request: Parameters<typeof buildConsentActionControlProof>[0] & {deadlineAtMs?: number} = {
    action: "accept", control, page, observedAtMs: 1, recipeId: "canonical-fixture", selectorHint: "#choice",
    onLabelInspection: () => {callbacks++;},
  };
  return {request, commands, callbacks: () => callbacks};
}

test("final proof cannot promote a uniqueness result received after the absolute deadline", async () => {
  const pending = deferred<void>(), f = proofFixture({hold: "uniqueness", pending: pending.promise});
  const timer = setTimeout(() => pending.resolve(), 100);
  try {
    const result = await buildConsentActionControlProof({...f.request, deadlineAtMs: Date.now() + 20});
    assert.equal(result.status, "label_unverifiable");
  } finally {clearTimeout(timer); pending.resolve();}
});

test("final proof deadline returns while a label read is pending and emits no late callback", async () => {
  const pending = deferred<void>(), f = proofFixture({hold: "labels", pending: pending.promise});
  const result = buildConsentActionControlProof({...f.request, deadlineAtMs: Date.now() + 20});
  let timer: NodeJS.Timeout | undefined;
  try {
    const first = await Promise.race([result, new Promise<string>(resolve => {timer = setTimeout(() => resolve("still_waiting"), 100);})]);
    assert.notEqual(first, "still_waiting");
    pending.resolve(); await result; await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.callbacks(), 0);
    assert.equal(f.commands.includes("uniqueness"), false);
  } finally {if (timer) clearTimeout(timer); pending.resolve(); await result;}
});

test("aborted final proof stops before follow-up DOM reads after a pending scope check", async () => {
  const pending = deferred<void>(), f = proofFixture({hold: "scope", pending: pending.promise});
  const stop = new AbortController();
  const result = buildConsentActionControlProof({...f.request, signal: stop.signal, deadlineAtMs: Date.now() + 2_000});
  await new Promise(resolve => setImmediate(resolve)); stop.abort();
  let timer: NodeJS.Timeout | undefined;
  try {
    const first = await Promise.race([result, new Promise<string>(resolve => {timer = setTimeout(() => resolve("still_waiting"), 100);})]);
    assert.notEqual(first, "still_waiting");
    pending.resolve(); await result; await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.commands, ["scope"]);
    assert.equal(f.callbacks(), 0);
  } finally {if (timer) clearTimeout(timer); pending.resolve(); await result;}
});

test("same-frame proof retries cannot queue or reuse a timed-out proof", async () => {
  const pending = deferred<void>(), first = proofFixture({hold: "scope", pending: pending.promise});
  const second = proofFixture({page: first.request.page});
  await buildConsentActionControlProof({...first.request, deadlineAtMs: Date.now() + 20});
  try {
    assert.equal((await buildConsentActionControlProof({...second.request, deadlineAtMs: Date.now() + 100})).status, "label_unverifiable");
    assert.deepEqual(second.commands, []);
  } finally {pending.resolve(); await new Promise(resolve => setImmediate(resolve));}
  assert.equal((await buildConsentActionControlProof({...second.request, deadlineAtMs: Date.now() + 1_000})).status, "verified");
});

test("in-budget proof preserves valid, opposite, absent and conflicting label semantics", async () => {
  for (const label of ["Accept all", "Reject all", "OK", "Do not accept cookies"]) {
    const f = proofFixture({label});
    const result = await buildConsentActionControlProof({...f.request, deadlineAtMs: Date.now() + 1_000});
    assert.equal(result.status === "verified", label === "Accept all", label);
  }
  const expired = proofFixture();
  assert.equal((await buildConsentActionControlProof({...expired.request, deadlineAtMs: Date.now() - 1})).status, "label_unverifiable");
  assert.deepEqual(expired.commands, []);
});

test("a timed-out actionability read holds the enclosing proof slot until its actual browser reply settles", async () => {
  const pending = deferred<void>(), first = proofFixture({hold: "geometry", pending: pending.promise});
  const second = proofFixture({page: first.request.page});
  await buildConsentActionControlProof({...first.request, deadlineAtMs: Date.now() + 20});
  try {
    assert.equal((await buildConsentActionControlProof({...second.request, deadlineAtMs: Date.now() + 1_000})).status, "label_unverifiable");
    assert.deepEqual(second.commands, []);
    assert.equal(first.callbacks(), 0);
  } finally {pending.resolve(); await new Promise(resolve => setImmediate(resolve));}
  assert.equal((await buildConsentActionControlProof({...second.request, deadlineAtMs: Date.now() + 1_000})).status, "verified");
});

test("custom inspection's internal timeout cannot hide a still-pending browser read from proof backpressure", async () => {
  const pending = deferred<void>(), first = proofFixture({hold: "custom", pending: pending.promise});
  const second = proofFixture({page: first.request.page});
  const custom = {policyVersion: "custom_accept_control.v1", kind: "direct_onclick", tagName: "div",
    bannerSelector: "#banner", nonTransactional: true,
    handlerSha256: createHash("sha256").update(customHandler).digest("hex")} as const;
  const result = await buildConsentActionControlProof({...first.request, deadlineAtMs: Date.now() + 1_000,
    authorizedTargetSha256: createHash("sha256").update(first.request.page.url()).digest("hex"), expectedCustomControlBinding: custom});
  assert.equal(result.status, "label_unverifiable");
  try {
    assert.equal((await buildConsentActionControlProof({...second.request, deadlineAtMs: Date.now() + 1_000})).status, "label_unverifiable");
    assert.deepEqual(second.commands, []);
  } finally {pending.resolve(); await new Promise(resolve => setImmediate(resolve));}
  assert.equal((await buildConsentActionControlProof({...second.request, deadlineAtMs: Date.now() + 1_000})).status, "verified");
});

for (const held of ["session", "DOM.enable"] as const) {
  test(`closed-shadow proof stops follow-up CDP reads after a late ${held} reply and still cleans up`, async () => {
    const pending = deferred<void>(), commands: string[] = [];
    let detached = 0;
    const frame = {url: () => "https://example.test/"} as Frame;
    const session = {send: async (method: string) => {commands.push(method); if (held === method) await pending.promise; return {};},
      detach: async () => {detached++;}};
    const page = {url: () => frame.url(), mainFrame: () => frame, frames: () => [frame],
      context: () => ({newCDPSession: async () => {commands.push("session"); if (held === "session") await pending.promise; return session;}})} as unknown as Page;
    const f = proofFixture({page});
    const result = await buildConsentActionControlProof({...f.request, deadlineAtMs: Date.now() + 20,
      expectedAccessibleControl: {kind: "closed_shadow_accessible_control", scopeSelector: "#cmp", intent: "accept"}});
    assert.equal(result.status, "label_unverifiable");
    const atStop = [...commands];
    pending.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(commands, atStop, "late replies must not start another DOM or Accessibility command");
    assert.equal(detached, 1);
    assert.equal(f.callbacks(), 0);
  });
}

test("unavailable frames and cancellation from the label callback fail closed without another read", async () => {
  const missing = proofFixture();
  assert.equal((await buildConsentActionControlProof({...missing.request, controlFrameUrl: "https://other.test/", deadlineAtMs: Date.now() + 1_000})).status, "label_unverifiable");
  assert.deepEqual(missing.commands, []);
  const f = proofFixture(), stop = new AbortController();
  const result = await buildConsentActionControlProof({...f.request, signal: stop.signal, deadlineAtMs: Date.now() + 1_000,
    onLabelInspection: () => stop.abort()});
  assert.equal(result.status, "label_unverifiable");
  assert.equal(f.commands.includes("uniqueness"), false);
});

test("reviewed Reject's extra scope guard shares the deadline and cannot continue into a proof after cancellation", async () => {
  const pending = deferred<void>(), f = proofFixture({hold: "scope", pending: pending.promise});
  const proof = {cmpId: "OneTrust", authorizedTargetSha256: createHash("sha256").update(f.request.page.url()).digest("hex"),
    labelBoundNecessaryOnly: {contextText: "Use only necessary cookies"}} as ConsentActionControlProof;
  await assert.rejects(assertReviewedRejectDispatchAllowed({page: f.request.page, control: f.request.control, proof,
    deadlineAtMs: Date.now() + 20}), /control_proof_deadline_exhausted/);
  pending.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.commands, ["scope"]);
});

test("a custom proof that completes in budget retains its exact handler binding, and other frames remain independent", async () => {
  const pending = deferred<void>(), stalled = proofFixture({hold: "scope", pending: pending.promise});
  await buildConsentActionControlProof({...stalled.request, deadlineAtMs: Date.now() + 20});
  try {
    const f = proofFixture();
    const custom = {policyVersion: "custom_accept_control.v1", kind: "direct_onclick", tagName: "div",
      bannerSelector: "#banner", nonTransactional: true,
      handlerSha256: createHash("sha256").update(customHandler).digest("hex")} as const;
    const result = await buildConsentActionControlProof({...f.request, deadlineAtMs: Date.now() + 1_000,
      authorizedTargetSha256: createHash("sha256").update(f.request.page.url()).digest("hex"), expectedCustomControlBinding: custom});
    assert.equal(result.status, "verified");
    if (result.status === "verified") assert.deepEqual(result.proof.customControlBinding, custom);
  } finally {pending.resolve();}
});


test("expired proof timer stays stopped when the wall clock has not advanced", async t => {
  const pending = deferred<void>(), f = proofFixture({hold: "labels", pending: pending.promise});
  const now = Date.now(); t.mock.method(Date, "now", () => now);
  const result = await buildConsentActionControlProof({...f.request, deadlineAtMs: now + 10});
  assert.deepEqual(result, {status:"label_unverifiable",reason:"control_proof_deadline_exhausted"});
  pending.resolve(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.callbacks(),0); assert.equal(f.commands.includes("uniqueness"),false);
});
