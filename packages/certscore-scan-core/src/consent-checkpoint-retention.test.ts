import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { consentUiObservationSchema } from "@certscore/contracts";
import { createConsentCheckpointRetention, detectConsentUi } from "./scanners/pre-consent-runtime-scanner.js";

const identity = { source: "cdp_loader_id" as const, token: "loader-a" };
const url = "https://checkpoint-fixture.test/";
const empty = () => consentUiObservationSchema.parse({ observationId: "initial", observedAtMs: 0,
  documentUrl: url, documentIdentity: identity, likelyPresent: false, basis: [],
  captureStatus: "incomplete", inventoryOutcome: "partial", confidence: 0.4 });
const positive = () => consentUiObservationSchema.parse({ ...empty(), observationId: "completed-ax-channel", observedAtMs: 100,
  likelyPresent: true, captureStatus: "observed", inventoryOutcome: "complete_with_controls",
  captureDiagnostics: { completedChannels: ["accessibility_tree"] },
  controls: [{ label: "Accept all", actionType: "accept_all", visible: true }], acceptControlObserved: true });

test("a timed-out aggregate retains completed positive channels without claiming complete coverage", () => {
  const current = empty(), before = structuredClone(current);
  const retention = createConsentCheckpointRetention({ current, deadlineAtMs: Date.now() + 1000, scanStartedAtMs: Date.now(),
    readBinding: () => ({ url, documentIdentity: identity }) });
  retention.observe(positive());
  const result = retention.fallback(); retention.close();
  assert.equal(result.controls.length, 1);
  assert.equal(result.acceptControlObserved, true);
  assert.equal(result.rejectControlObserved, false);
  assert.equal(result.inventoryOutcome, "partial");
  assert.equal(result.captureStatus, "incomplete");
  assert.ok(result.captureDiagnostics?.completedChannels.includes("accessibility_tree"));
  assert.deepEqual(current, before, "retention cannot rewrite the earlier observation");
  consentUiObservationSchema.parse(result);
});

test("unbound, hidden, negative, late and wrong-document channels cannot create retained positives", () => {
  const variants = [
    { ...positive(), documentIdentity: undefined },
    { ...positive(), documentIdentity: { ...identity, token: "loader-b" } },
    { ...positive(), documentUrl: url + "next" },
    { ...positive(), controls: positive().controls.map(control => ({ ...control, visible: false })) },
    { ...empty(), captureStatus: "no_evidence" as const, inventoryOutcome: "complete_empty" as const },
  ];
  for (const observation of variants) {
    const current = empty();
    const retention = createConsentCheckpointRetention({ current, deadlineAtMs: Date.now() + 1000, scanStartedAtMs: Date.now(),
      readBinding: () => ({ url, documentIdentity: identity }) });
    retention.observe(observation);
    assert.equal(retention.fallback(), current);
    retention.close();
  }
  for (const closed of [false, true]) {
    const current = empty();
    const retention = createConsentCheckpointRetention({ current, deadlineAtMs: Date.now() + (closed ? 1000 : -1), scanStartedAtMs: Date.now(),
      readBinding: () => ({ url, documentIdentity: identity }) });
    if (closed) retention.close();
    retention.observe(positive());
    assert.equal(retention.fallback(), current);
  }
});

test("same-URL reload after a completed channel invalidates its fallback", () => {
  const current = empty(); let binding = { url, documentIdentity: identity };
  const retention = createConsentCheckpointRetention({ current, deadlineAtMs: Date.now() + 1000, scanStartedAtMs: Date.now(), readBinding: () => binding });
  retention.observe(positive());
  binding = { url, documentIdentity: { ...identity, token: "loader-b" } };
  assert.equal(retention.fallback().inventoryOutcome, "document_mismatch");
  assert.equal(retention.fallback().controls.length, 0);
  retention.close();
});

test("a mixed channel retains only positively visible controls and their typed flags", () => {
  const observation = positive();
  observation.controls.push({ label: "Reject all", actionType: "reject_all", visible: false });
  observation.controls.push({ label: "Cookie settings", actionType: "manage_preferences", visible: true });
  Reflect.deleteProperty(observation.controls[2]!, "visible");
  observation.rejectControlObserved = true;
  observation.managePreferencesControlObserved = true;
  observation.visibleChoiceLabels = observation.controls.map(control => control.label);
  const original = structuredClone(observation);
  const retention = createConsentCheckpointRetention({ current: empty(), scanStartedAtMs: Date.now(),
    deadlineAtMs: Date.now() + 1000, readBinding: () => ({ url, documentIdentity: identity }) });
  retention.observe(observation);
  const result = retention.fallback(); retention.close();
  assert.equal(result.controls.length, 1);
  assert.equal(result.acceptControlObserved, true);
  assert.equal(result.rejectControlObserved, false);
  assert.equal(result.managePreferencesControlObserved, false);
  assert.deepEqual(result.visibleChoiceLabels, ["Accept all"]);
  assert.deepEqual(observation, original);
});

test("an initially stale current observation is cleared on URL or loader drift", () => {
  for (const binding of [{ url: url + "next", documentIdentity: identity },
    { url, documentIdentity: { ...identity, token: "loader-b" } }]) {
    const retention = createConsentCheckpointRetention({ current: positive(), deadlineAtMs: Date.now() + 1000,
      scanStartedAtMs: Date.now(), readBinding: () => binding });
    const result = retention.fallback();
    assert.equal(result.inventoryOutcome, "document_mismatch");
    assert.equal(result.controls.length, 0);
    assert.equal(result.acceptControlObserved, false);
    assert.equal(result.documentUrl, binding.url);
    retention.close();
  }
});

test("real browser publishes its completed inventory before stalled later enrichment finishes", { timeout: 5000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<section role='dialog' aria-label='Cookie consent'><p>We use optional cookies.</p><button>Accept all</button></section>");
    const evaluate = page.evaluate.bind(page);
    let release: (() => void) | undefined;
    let stalled = false;
    page.evaluate = ((expression: unknown, arg: unknown) => {
      if (!stalled && typeof expression === "function" && expression.toString().includes("document.body")) {
        stalled = true;
        return new Promise(resolve => { release = () => resolve(evaluate(expression as Parameters<typeof evaluate>[0], arg)); });
      }
      return evaluate(expression as Parameters<typeof evaluate>[0], arg);
    }) as typeof page.evaluate;
    const captured: ReturnType<typeof empty>[] = [];
    let completed = false;
    const pending = detectConsentUi(page, Date.now(), 0, { accessibilityTimeoutMs: 150, rapidInventoryTimeoutMs: 100,
      onEarlyInventory: observation => captured.push(observation) }).then(() => { completed = true; });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(completed, false, "the deliberately stalled full read must remain unfinished");
    assert.ok(captured.some(observation => observation.acceptControlObserved && observation.controls.some(control => control.visible)),
      "a finished canonical channel must be available before the aggregate times out");
    assert.ok(release, "the later DOM enrichment was reached"); release();
    await pending.catch(() => undefined);
  } finally { await browser.close(); }
});

test("completed native inventory preserves control and toggle results with the callback enabled", { timeout: 5000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<section role='dialog' aria-label='Cookie consent'><p>Choose optional cookies.</p><label><input type='checkbox' checked>Analytics</label><button>Accept all</button><button>Reject all</button></section>");
    const before = await detectConsentUi(page, Date.now(), 0);
    const after = await detectConsentUi(page, Date.now(), 0, { onEarlyInventory: () => undefined });
    const comparable = (row: typeof before) => ({ controls: row.controls, accept: row.acceptControlObserved,
      reject: row.rejectControlObserved, options: row.managePreferencesControlObserved, captureStatus: row.captureStatus,
      inventoryOutcome: row.inventoryOutcome, defaultToggleStatesObserved: row.defaultToggleStatesObserved,
      nonEssentialDefaultsOff: row.nonEssentialDefaultsOff, precheckedOptionalPurposeCount: row.precheckedOptionalPurposeCount });
    assert.deepEqual(comparable(after), comparable(before));
    assert.equal(after.acceptControlObserved, true);
    assert.equal(after.rejectControlObserved, true);
  } finally { await browser.close(); }
});
