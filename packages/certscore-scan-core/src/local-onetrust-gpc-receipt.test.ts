import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { readLocalOneTrustGpcReceipt, localOneTrustGpcReceiptSchema } from "./local-onetrust-gpc-receipt";

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
function fixture(browser = "1", category = "1") {
  const document = { token: "private-loader", urlSha256: hash("https://fixture.test/") };
  const source = { contractVersion: "certscore.onetrust-receipt-input.local.v1", scanId: "fixture-scan",
    lane: "gpc_observation" as const, sessionId: "private-session", startedAtMs: 120, completedAtMs: 150,
    before: { ...document }, after: { ...document }, cookies: [{ name: "OptanonConsent", domain: ".fixture.test", path: "/",
      secure: true, expires: -1, value: `version=202303.1.0&browserGpcFlag=${browser}&isGpcEnabled=${category}&groups=C0001%3A1%2CC0004%3A1&consentId=PRIVATE_ID&landingPath=https%3A%2F%2Fprivate.test%2Fsecret&geolocation=PRIVATE_LOCATION` }] };
  const expected = { scanId: source.scanId, lane: source.lane, sessionId: source.sessionId, document,
    committedAtMs: 100, frozenAtMs: 200, documentUrl: "https://fixture.test/", observedAtEpochSeconds: 1_800_000_000 };
  return { source, expected };
}
function original(source: unknown) {
  // These are newly created synthetic originals, never modified historical data.
  const bytes = Buffer.from(JSON.stringify(source));
  return { bytes, pointer: { sizeBytes: bytes.length, sha256: hash(bytes) } };
}
function read(f = fixture()) { return readLocalOneTrustGpcReceipt({ ...original(f.source), expected: f.expected }); }

test("documented receipt flags remain independent of category consent and sale/sharing", () => {
  for (const [browser, category] of [["0", "0"], ["1", "0"], ["1", "1"]]) {
    const result = read(fixture(browser, category)); assert.ok(result);
    assert.equal(result.browserGpcFlag, browser === "1"); assert.equal(result.gpcCategoryFlag, category === "1");
    assert.equal(result.sale, "not_assessed"); assert.equal(result.sharing, "not_assessed"); assert.equal(result.honoring, "not_assessed");
    assert.equal(result.productionProjectable, false); assert.equal(result.internalOnly, true); assert.equal(result.scoreEffect, "none");
    assert.equal(result.observedAfterDocumentCommitMs, 50); assert.ok(localOneTrustGpcReceiptSchema.safeParse(result).success);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|private-session|private-loader|groups|consentId|landingPath|geolocation/);
  }
  assert.equal(read(fixture("0", "1")), undefined);
});

test("original-byte length, digest and maximum bounds fail closed", () => {
  const f = fixture(), src = original(f.source);
  for (const changed of [
    { ...src, pointer: { ...src.pointer, sizeBytes: src.bytes.length + 1 } },
    { ...src, pointer: { ...src.pointer, sha256: "0".repeat(64) } },
    { ...src, bytes: Buffer.from(src.bytes.toString().replace("PRIVATE_ID", "TAMPERED")) },
    { bytes: Buffer.alloc(16_385), pointer: { sizeBytes: 16_385, sha256: hash(Buffer.alloc(16_385)) } },
  ]) assert.equal(readLocalOneTrustGpcReceipt({ ...changed, expected: f.expected }), undefined);
});

test("independent scan, lane, session, document, URL and read-window bindings are required", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.expected.scanId = "other"; },
    (f: ReturnType<typeof fixture>) => { f.source.lane = "runtime_evidence" as never; },
    (f: ReturnType<typeof fixture>) => { f.expected.sessionId = "other"; },
    (f: ReturnType<typeof fixture>) => { f.source.before.token = "old"; },
    (f: ReturnType<typeof fixture>) => { f.source.after.token = "navigated"; },
    (f: ReturnType<typeof fixture>) => { f.source.after.urlSha256 = hash("other"); },
    (f: ReturnType<typeof fixture>) => { f.expected.documentUrl = "https://other.test/"; },
    (f: ReturnType<typeof fixture>) => { f.expected.documentUrl = "http://fixture.test/"; },
    (f: ReturnType<typeof fixture>) => { f.expected.committedAtMs = 121; },
    (f: ReturnType<typeof fixture>) => { f.source.completedAtMs = 119; },
    (f: ReturnType<typeof fixture>) => { f.expected.frozenAtMs = 149; },
  ]) { const f = fixture(); change(f); assert.equal(read(f), undefined); }
});

test("unknown versions, malformed/duplicate/ambiguous flag fields cannot produce facts", () => {
  const values = [
    "version=202604.2.0&browserGpcFlag=1&isGpcEnabled=1",
    "version=202303.1.0&browserGpcFlag=1", "version=202303.1.0&isGpcEnabled=1",
    "version=202303.1.0&browserGpcFlag=true&isGpcEnabled=1",
    "version=202303.1.0&browserGpcFlag=2&isGpcEnabled=0",
    "version=202303.1.0&browserGpcFlag=1&browserGpcFlag=0&isGpcEnabled=1",
    "version=202303.1.0&browserGpcFlag=1&%62rowserGpcFlag=0&isGpcEnabled=1",
    "version=202303.1.0&browserGpcFlag=1&BrowserGpcFlag=0&isGpcEnabled=1",
    "version=202303.1.0&browserGpcFlag=1&isGpcEnabled=1&other=%xx",
    "version=202303.1.0&browserGpcFlag=1&isGpcEnabled=1&other=1&other=2",
    "groups=C0001:1,C0004:0", "x".repeat(2049),
  ];
  for (const value of values) { const f = fixture(); f.source.cookies[0]!.value = value; assert.equal(read(f), undefined); }
  const f = fixture(), encoded = JSON.stringify(f.source).replace('"scanId":"fixture-scan"', '"scanId":"bad","scanId":"fixture-scan"');
  const bytes = Buffer.from(encoded);
  assert.equal(readLocalOneTrustGpcReceipt({ bytes, pointer: { sha256: hash(bytes), sizeBytes: bytes.length }, expected: f.expected }), undefined);
});

test("cookie identity, domain/path scope, partition and expiration remain conservative", () => {
  for (const modify of [
    (f: ReturnType<typeof fixture>) => { f.source.cookies = []; },
    (f: ReturnType<typeof fixture>) => { f.source.cookies.push({ ...f.source.cookies[0]! }); },
    (f: ReturnType<typeof fixture>) => { f.source.cookies[0]!.domain = ".other.test"; },
    (f: ReturnType<typeof fixture>) => { f.source.cookies[0]!.domain = ".test"; },
    (f: ReturnType<typeof fixture>) => { f.source.cookies[0]!.path = "/other"; },
    (f: ReturnType<typeof fixture>) => { f.source.cookies[0]!.name = "OptanonConsent "; },
    (f: ReturnType<typeof fixture>) => { f.source.cookies[0]!.secure = false; },
    (f: ReturnType<typeof fixture>) => { f.source.cookies[0]!.expires = 1_799_999_999; },
    (f: ReturnType<typeof fixture>) => { Object.assign(f.source.cookies[0]!, { partitionKey: "https://fixture.test" }); },
  ]) { const f = fixture(); modify(f); assert.equal(read(f), undefined); }
});

test("strict result rejects promotion, stronger interpretations and extra sensitive fields", () => {
  const result = read()!;
  for (const override of [{ productionProjectable: true }, { scoreEffect: "positive" }, { sale: "opted_out" },
    { sharing: "not_opted_out" }, { honoring: "honored" }, { cookie: "PRIVATE_ID" }]) {
    assert.equal(localOneTrustGpcReceiptSchema.safeParse({ ...result, ...override }).success, false);
  }
});

test("maximum identifiers and timing fit the strict serialized output cap", () => {
  const f = fixture(); f.source.scanId = "a".repeat(160); f.expected.scanId = f.source.scanId;
  f.source.completedAtMs = 86_400_000; f.expected.frozenAtMs = 86_400_000;
  const result = read(f); assert.ok(result);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 768);
});

test("local processing and serialized output are bounded without IO", () => {
  const f = fixture(), source = original(f.source), input = { ...source, expected: f.expected };
  const timings: number[] = [];
  for (let i = 0; i < 1100; i++) {
    const start = performance.now(); const result = readLocalOneTrustGpcReceipt(input); assert.ok(result);
    if (i >= 100) timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  console.log("LOCAL_ONETRUST_MEASUREMENT", JSON.stringify({ inputBytes: source.bytes.length,
    outputBytes: Buffer.byteLength(JSON.stringify(readLocalOneTrustGpcReceipt(input))), iterations: timings.length,
    medianMs: timings[500], p95Ms: timings[950] }));
  assert.ok(Buffer.byteLength(JSON.stringify(readLocalOneTrustGpcReceipt(input))) < 1024);
});
