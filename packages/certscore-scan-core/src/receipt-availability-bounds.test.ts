import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Page } from "playwright";
import { consentReceiptCaptureSchema } from "@certscore/contracts";
import { installConsentReceiptCapture, receiptCaptureToken, retainReceiptCookies, retainTrustArcReceiptCookies, retainReceiptWrites, projectReceiptValue } from "./consent-receipt-capture.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture(action: "accept" | "reject" = "reject", signal?: AbortSignal) {
  const page = new EventEmitter() as EventEmitter & { url: () => string; mainFrame: () => object; context: () => object };
  const frame = {}, context = {};
  page.url = () => "https://fixture.example/";
  page.mainFrame = () => frame;
  page.context = () => context;
  const capture = installConsentReceiptCapture(page as unknown as Page, {
    scanId: "owned-receipt-availability", action, clockOriginAtEpochMs: Date.now() - 100, signal,
  });
  capture.dispatch(Date.now());
  return { page: page as unknown as Page, capture,
    navigate: () => page.emit("framenavigated", frame),
    finish: () => capture.finish({ targetSha256: hash("owned-target"), clickOutcome: "completed" })! };
}

for (const action of ["accept", "reject"] as const) {
  test(`${action}: an oversized already-read cookie stays available without value proof or facts`, () => {
    const f = fixture(action);
    const value = "private-visitor-value:" + "x".repeat(4096);
    retainReceiptCookies(receiptCaptureToken(f.page), [{ name: "cookieyes-consent", value, domain: "fixture.example", path: "/",
      expires: -1, httpOnly: false, secure: true, sameSite: "Lax" }], "cookieyes-consent");
    const result = f.finish();
    assert.ok(consentReceiptCaptureSchema.safeParse(result).success);
    assert.equal(result.observations.length, 1);
    const row = result.observations[0]!;
    assert.equal(row.available, true);
    assert.equal(row.factsLimited, true);
    assert.equal(row.format, "opaque");
    assert.equal(row.valueSha256, undefined);
    assert.equal(row.identitySha256, hash(JSON.stringify(["cookie_name_domain_path_partition", "fixture.example", "/", "", "cookieyes-consent"])));
    assert.deepEqual(row.facts, []);
    assert.equal(result.observationsTruncated, true);
    assert.ok(!JSON.stringify(result).includes("private-visitor-value"));
    assert.ok(!JSON.stringify(result).includes(hash(value)));
  });
}

test("missing, measured empty and oversized receipt reads retain distinct availability states", () => {
  const f = fixture();
  const token = receiptCaptureToken(f.page)!;
  for (const [key, value] of [["missing", undefined], ["empty", ""], ["oversized", "x".repeat(2049)]] as const)
    f.capture.record(token, key, value, { source: "api", provider: "termly" });
  const result = f.finish();
  assert.deepEqual(result.observations.map(row => ({ available: row.available, limited: row.factsLimited,
    hashed: row.valueSha256 !== undefined })), [
    { available: false, limited: false, hashed: false },
    { available: true, limited: false, hashed: true },
    { available: true, limited: true, hashed: false },
  ]);
});

test("availability-only oversized writes do not acquire exact-value or cookie-write proof", () => {
  const f = fixture();
  f.capture.record(receiptCaptureToken(f.page)!, "consent", "x".repeat(2049),
    { source: "write", storageType: "cookie", writeSequence: 1, writeObservedAtEpochMs: Date.now() },
    { assignment: "consent=" + "x".repeat(2049) + ";path=/", url: f.page.url() });
  const row = f.finish().observations[0]!;
  assert.equal(row.available, true);
  assert.equal(row.factsLimited, true);
  assert.equal(row.valueSha256, undefined);
  assert.equal(row.identitySha256, undefined);
});

test("the existing 2048-character interpretation boundary is preserved", () => {
  const f = fixture();
  const token = receiptCaptureToken(f.page)!;
  f.capture.record(token, "at-limit", "x".repeat(2048), { source: "api", provider: "termly" });
  f.capture.record(token, "over-limit", "x".repeat(2049), { source: "api", provider: "termly" });
  const rows = f.finish().observations;
  assert.equal(rows[0]?.valueSha256, hash("x".repeat(2048)));
  assert.equal(rows[1]?.valueSha256, undefined);
  assert.equal(rows[1]?.factsLimited, true);
});

test("oversized inputs preserve deduplication, phase attribution and the eight-row/byte caps", t => {
  const f = fixture();
  let clock = 0;
  t.mock.method(performance, "now", () => clock += 0.01);
  const initial = receiptCaptureToken(f.page)!;
  for (let i = 0; i < 3; i++) f.capture.record(initial, "same", "x".repeat(4096), { source: "api", provider: "termly" });
  f.capture.phase("terminal");
  f.capture.record(receiptCaptureToken(f.page)!, "same", "x".repeat(4096), { source: "api", provider: "termly" });
  for (let i = 0; i < 20; i++) f.capture.record(receiptCaptureToken(f.page)!, `key-${i}`, "x".repeat(4096), { source: "api", provider: "termly" });
  const result = f.finish();
  assert.equal(result.observations.filter(row => row.phase === "initial").length, 1);
  assert.equal(result.observations.filter(row => row.phase === "terminal").length, 7);
  assert.equal(result.observations.length, 8);
  assert.equal(result.observationsTruncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 8192);
});

test("navigation, cancellation and closed captures still discard availability-only rows", () => {
  for (const mode of ["navigation", "cancelled", "closed"]) {
    const controller = new AbortController();
    const f = fixture("reject", controller.signal);
    const token = receiptCaptureToken(f.page)!;
    if (mode === "navigation") f.navigate();
    else if (mode === "cancelled") controller.abort();
    else f.capture.finish();
    f.capture.record(token, "consent", "x".repeat(4096), { source: "api", provider: "termly" });
    const result = f.capture.finish({ targetSha256: hash("owned-target"), clickOutcome: "completed" });
    if (mode === "closed") assert.equal(result, undefined);
    else {
      assert.deepEqual(result?.observations, []);
      assert.equal(result?.cancelled, mode === "cancelled");
    }
  }
});

test("availability-only retention still stops at the existing processing budget", t => {
  const f = fixture("accept");
  const token = receiptCaptureToken(f.page)!;
  let clock = 0;
  t.mock.method(performance, "now", () => clock += 3);
  for (let i = 0; i < 6; i++) f.capture.record(token, `key-${i}`, "x".repeat(4096), { source: "api", provider: "termly" });
  const result = f.finish();
  assert.equal(result.processingLimited, true);
  assert.equal(result.observations.length, 2);
});

test("availability markers yield output capacity to a later bounded receipt value", t => {
  const f = fixture();
  let clock = 0;
  t.mock.method(performance, "now", () => clock += 0.01);
  const token = receiptCaptureToken(f.page)!;
  for (let i = 0; i < 8; i++) f.capture.record(token, `large-${i}`, "x".repeat(4096), { source: "api", provider: "termly" });
  const value = JSON.stringify({ analytics: false });
  f.capture.record(token, "bounded", value, { source: "api", provider: "termly" });
  const result = f.finish();
  assert.equal(result.observations.length, 8);
  assert.ok(result.observations.some(row => row.valueSha256 === hash(value) && row.facts.length === 1));
  assert.equal(result.observations.filter(row => row.valueSha256 === undefined).length, 7);
  assert.equal(result.observationsTruncated, true);
});

test("availability-only rows never replace retained bounded values", t => {
  const f = fixture();
  let clock = 0;
  t.mock.method(performance, "now", () => clock += 0.01);
  const token = receiptCaptureToken(f.page)!;
  const value = JSON.stringify({ analytics: false });
  for (let i = 0; i < 8; i++) f.capture.record(token, `bounded-${i}`, value, { source: "api", provider: "termly" });
  f.capture.record(token, "large", "x".repeat(4096), { source: "api", provider: "termly" });
  const result = f.finish();
  assert.equal(result.observations.length, 8);
  assert.ok(result.observations.every(row => row.valueSha256 === hash(value) && row.facts.length === 1));
  assert.equal(result.observationsTruncated, true);
});

test("a final Reject cookie read survives a full initial inventory and exhausted polling allowance", t => {
  const f = fixture();
  let clock = 0;
  let cost = 0.375;
  t.mock.method(performance, "now", () => clock += cost);
  const token = receiptCaptureToken(f.page)!;
  for (let sequence = 1; sequence <= 8; sequence++) {
    f.capture.record(token, "notice_preferences", "0:", { source: "write", writeSequence: sequence });
  }
  assert.equal(receiptCaptureToken(f.page), undefined);
  f.capture.phase("terminal");
  const terminal = receiptCaptureToken(f.page)!;
  cost = 1;
  f.capture.record(terminal, "noise", "", { source: "write" });
  retainReceiptCookies(terminal, [{ name: "notice_preferences", value: "0:", domain: "fixture.example",
    path: "/", expires: -1, httpOnly: false, secure: true, sameSite: "Lax" }], "notice_preferences");
  assert.equal(receiptCaptureToken(f.page), undefined);
  const result = f.finish();
  assert.equal(result.processingLimited, true);
  assert.equal(result.observationsTruncated, true);
  assert.equal(result.observations.length, 8);
  const last = result.observations.at(-1)!;
  assert.equal(last.phase, "terminal");
  assert.equal(last.cookieMultiplicity, "unique");
  assert.equal(last.valueSha256, hash("0:"));
  assert.deepEqual(last.facts, [{ pathSha256: hash("trustarc.preference_code_zero_colon"), value: true }]);
  assert.equal(last.decision, undefined);
  assert.deepEqual(projectReceiptValue("unrelated", "0:").facts, []);
});

test("same-document cookie_preferences writes retain bounded facts without declaring a choice", () => {
  const f = fixture();
  const write = { name: "cookie_preferences", value: '{"analytics":false,"id":"private-value"}',
    observedAtEpochMs: Date.now(), sequence: 1, documentUrl: f.page.url(), storageType: "cookie" as const };
  retainReceiptWrites(receiptCaptureToken(f.page), [{ ...write, documentUrl: "https://other.example/" },
    { ...write, storageType: "local_storage" }, write]);
  const result = f.finish();
  assert.equal(result.observations.length, 1);
  assert.deepEqual(result.observations[0]!.facts, [{ pathSha256: hash('["analytics"]'), value: false }]);
  assert.equal(result.observations[0]!.decision, undefined);
  assert.ok(!JSON.stringify(result).includes("private-value"));
});


test("TrustArc keeps alternate values and absent cookies in the final bounded receipt", t => {
  const f = fixture();
  let clock = 0;
  t.mock.method(performance, "now", () => clock += 0.01);
  const initial = receiptCaptureToken(f.page)!;
  for (let i = 0; i < 8; i++) {
    f.capture.record(initial, `initial-${i}`, "0:", { source: "write", writeSequence: i });
  }

  f.capture.phase("terminal");
  const cookie = { domain: "fixture.example", path: "/", expires: -1, httpOnly: false, secure: true, sameSite: "Lax" as const };
  const alternate = "unrecognized-preference-encoding";
  retainTrustArcReceiptCookies(receiptCaptureToken(f.page), [
    { ...cookie, name: "notice_gdpr_prefs", value: alternate },
    { ...cookie, name: "cmapi_cookie_privacy", value: "permit 1 required" },
  ]);

  const result = f.finish();
  assert.equal(result.observations.length, 8);
  const terminal = result.observations.filter(row => row.phase === "terminal");
  assert.equal(terminal.length, 3);
  assert.deepEqual(terminal.map(row => row.keySha256),
    ["notice_preferences", "notice_gdpr_prefs", "cmapi_cookie_privacy"].map(hash));
  assert.equal(terminal[0]!.cookieMultiplicity, "none");
  assert.equal(terminal[1]!.valueSha256, hash(alternate));
  assert.equal(terminal[1]!.format, "opaque");
  assert.deepEqual(terminal[2]!.facts, [{ pathSha256: hash("trustarc.permit_1_required_literal"), value: true }]);
  assert(terminal.every(row => row.decision === undefined));
});
