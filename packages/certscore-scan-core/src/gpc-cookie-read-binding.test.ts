import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { canonicalEvidenceBundleSchema, gpcCookieReadBindingSchema } from "@certscore/contracts";
import { gpcCookieReadFixture, gpcCookieReadRetentionFixture, gpcCookieReadOversizedFixture, gpcCookieReadWideDictionaryFixture } from "./test-fixtures/gpc-cookie-read.cases";
import { parseCanonicalEvidenceArtifact, serializeCanonicalEvidenceArtifact } from "@certscore/contracts/dist/canonical-evidence-artifact.js";
import { buildGpcCookieReadBinding, readOriginalGpcCookieReadBinding } from "./gpc-cookie-read-binding";
import { readVerifiedGpcImpactSource } from "./gpc-impact-assessment";
import { buildGpcProductionObservation } from "./gpc-production-observation";
import { compactCanonicalEvidenceBundleForRetention } from "./index";

test("existing read gets private binding without GPP, baseline coverage or raw cookie/URL data", () => {
  const { bundle, input } = gpcCookieReadFixture(), proof = buildGpcCookieReadBinding(input); assert.ok(proof);
  assert.equal(input.session!.semanticObservation!.gppStatus, "unavailable");
  bundle.cookieSnapshots[0]!.gpcReadBinding = proof;
  assert.equal(bundle.cookieSnapshots[0]!.captureCoverage, undefined);
  assert.equal(proof.inventoryCompleteness, "not_assessed"); assert.equal(proof.matchedRequestHorizon, "not_established");
  assert.deepEqual(readOriginalGpcCookieReadBinding(bundle, bundle.cookieSnapshots[0]!), proof);
  assert.doesNotMatch(JSON.stringify(proof), /PRIVATE_COOKIE|example\.test|https?:|value|cookieNames/);
  assert.ok(Buffer.byteLength(JSON.stringify(proof)) <= 2048);
  const source = () => { const bytes = Buffer.from(JSON.stringify(bundle)); return { bytes, pointer: { uri: "fixture-original", sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length } }; };
  const withBinding = buildGpcProductionObservation({ scanId: bundle.scanId, source: source() });
  delete bundle.cookieSnapshots[0]!.gpcReadBinding;
  const withoutBinding = buildGpcProductionObservation({ scanId: bundle.scanId, source: source() });
  const { sourceSha256: _a, ...a } = withBinding, { sourceSha256: _b, ...b } = withoutBinding;
  assert.deepEqual(a, b, "private metadata does not change the canonical GPC observation");
  assert.ok(canonicalEvidenceBundleSchema.safeParse(bundle).success, "legacy originals remain readable");
  bundle.cookieSnapshots[0]!.gpcReadBinding = proof;
  const original = source();
  assert.equal(readVerifiedGpcImpactSource({ ...original, pointer: { ...original.pointer, sizeBytes: 1 } }), null);
  assert.equal(readVerifiedGpcImpactSource({ ...original, pointer: { ...original.pointer, sha256: "0".repeat(64) } }), null);
});

test("lossless representation retains oversized evidence and original cookie proof without changing legacy facts",()=>{
  const f=gpcCookieReadOversizedFixture(),proof=buildGpcCookieReadBinding(f.input)!;
  const legacy=compactCanonicalEvidenceBundleForRetention(f.bundle);
  assert.ok(Buffer.byteLength(JSON.stringify(legacy))>400*1024);
  f.bundle.cookieSnapshots[0]!.gpcReadBinding=proof;
  const original=structuredClone(f.bundle),retained=compactCanonicalEvidenceBundleForRetention(f.bundle);
  assert.deepEqual(retained.cookieSnapshots[0]!.gpcReadBinding,proof);
  const without=structuredClone(retained);delete without.cookieSnapshots[0]!.gpcReadBinding;
  assert.deepEqual(without,legacy,"no evidence or legacy retention decision is changed to fit the proof");
  const stored=Buffer.from(serializeCanonicalEvidenceArtifact(retained));
  assert.ok(stored.length<=400*1024);
  const source={bytes:stored,pointer:{uri:"new-oversized-fixture-original",sha256:createHash("sha256").update(stored).digest("hex"),sizeBytes:stored.length}};
  const verified=readVerifiedGpcImpactSource(source);assert.ok(verified);
  assert.deepEqual(readOriginalGpcCookieReadBinding(verified,verified.cookieSnapshots[0]!),proof);
  assert.deepEqual(parseCanonicalEvidenceArtifact(stored),JSON.parse(JSON.stringify(retained)));
  const observe=(bytes:Buffer)=>{
    const {sourceSha256:_receipt,...observation}=buildGpcProductionObservation({scanId:retained.scanId,
      source:{bytes,pointer:{uri:"new-oversized-fixture-original",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length}}});
    return observation;
  };
  assert.deepEqual(observe(stored),observe(Buffer.from(JSON.stringify(legacy))));
  assert.equal(readVerifiedGpcImpactSource({...source,pointer:{...source.pointer,sha256:"0".repeat(64)}}),null);
  assert.equal(readVerifiedGpcImpactSource({...source,pointer:{...source.pointer,sizeBytes:stored.length+1}}),null);
  assert.deepEqual(f.bundle,original);
});

test("Brotli v2 retains wide original cookie proof without changing canonical facts or source gates",()=>{
  const f=gpcCookieReadWideDictionaryFixture(),proof=buildGpcCookieReadBinding(f.input)!;
  const legacy=compactCanonicalEvidenceBundleForRetention(f.bundle);
  assert.ok(Buffer.byteLength(JSON.stringify(legacy))>400*1024);
  f.bundle.cookieSnapshots[0]!.gpcReadBinding=proof;
  const original=structuredClone(f.bundle),retained=compactCanonicalEvidenceBundleForRetention(f.bundle);
  assert.deepEqual(retained.cookieSnapshots[0]!.gpcReadBinding,proof);
  const without=structuredClone(retained);delete without.cookieSnapshots[0]!.gpcReadBinding;
  assert.deepEqual(without,legacy,"no evidence or legacy retention decision is changed to fit the proof");
  const stored=Buffer.from(serializeCanonicalEvidenceArtifact(retained));
  assert.ok(stored.length<=400*1024);
  assert.equal(JSON.parse(stored.toString()).artifactFormat,"certscore.canonical-evidence-artifact.v2");
  const source={bytes:stored,pointer:{uri:"new-oversized-fixture-original",sha256:createHash("sha256").update(stored).digest("hex"),sizeBytes:stored.length}};
  const verified=readVerifiedGpcImpactSource(source);assert.ok(verified);
  assert.deepEqual(readOriginalGpcCookieReadBinding(verified,verified.cookieSnapshots[0]!),proof);
  assert.deepEqual(parseCanonicalEvidenceArtifact(stored),JSON.parse(JSON.stringify(retained)));
  const observe=(bytes:Buffer)=>{
    const {sourceSha256:_receipt,...observation}=buildGpcProductionObservation({scanId:retained.scanId,
      source:{bytes,pointer:{uri:"new-oversized-fixture-original",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length}}});
    return observation;
  };
  assert.deepEqual(observe(stored),observe(Buffer.from(JSON.stringify(legacy))));
  assert.equal(readVerifiedGpcImpactSource({...source,pointer:{...source.pointer,sha256:"0".repeat(64)}}),null);
  assert.equal(readVerifiedGpcImpactSource({...source,pointer:{...source.pointer,sizeBytes:stored.length+1}}),null);
  assert.deepEqual(f.bundle,original);
});

test("cookie read fails closed on failed reads, cancellation, wrong identity, stale times and delivery", () => {
  const mutations: Array<(v: ReturnType<typeof gpcCookieReadFixture>["input"]) => void> = [
    v => { v.enabled = false; }, v => { v.succeeded = false; }, v => { v.aborted = true; },
    v => { v.before.documentIdentity.token = "foreign"; }, v => { v.after.documentIdentity.token = "foreign"; },
    v => { v.after.url += "#changed"; }, v => { v.before.url = v.after.url = "https://foreign.test/"; },
    v => { v.startedAtMs = 0; }, v => { v.completedAtMs = 699; }, v => { v.completedAtMs = 7001; },
    v => { v.snapshot.capturedAtMs = 6104; }, v => { v.session!.mainDocument!.secGpc = null; },
    v => { v.session!.semanticObservation!.navigatorGpc = false; },
    v => { v.session!.semanticObservation!.captureBinding!.documentToken = "foreign"; },
    v => { v.session!.finalization!.documentUnchanged = false; },
    v => { v.impact!.document!.committedAtMs++; }, v => { v.impact!.readbackDocumentToken = "foreign"; },
    v => { v.signal!.prototypeCaptureBinding!.captureId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; },
    v => { v.signal!.frames[0]!.navigatorValue = false; },
    v => { v.signal!.capturedAtMs = 6101; },
  ];
  for (const mutate of mutations) { const { input } = gpcCookieReadFixture(); mutate(input); assert.equal(buildGpcCookieReadBinding(input), undefined); }
});

test("original cookie binding rejects copied/tampered scan, session, snapshot and source-lane facts", () => {
  const make = () => { const f = gpcCookieReadFixture(); f.bundle.cookieSnapshots[0]!.gpcReadBinding = buildGpcCookieReadBinding(f.input)!; return f.bundle; };
  for (const mutate of [
    (b: ReturnType<typeof make>) => { b.cookieSnapshots[0]!.gpcReadBinding!.scanId = "foreign"; },
    (b: ReturnType<typeof make>) => { b.cookieSnapshots[0]!.capturedAtMs = 6104; },
    (b: ReturnType<typeof make>) => { b.gpcPrototypeSessionBinding!.sessionSha256 = "0".repeat(64); },
    (b: ReturnType<typeof make>) => { b.gpcPrototypeSessionBinding!.documentToken = "foreign"; },
    (b: ReturnType<typeof make>) => { b.scanLaneRuns[0]!.laneId = "runtime_evidence"; },
    (b: ReturnType<typeof make>) => { b.scanLaneRuns[0]!.region = "eu-west-1"; },
  ]) { const b = make(); mutate(b); assert.equal(readOriginalGpcCookieReadBinding(b, b.cookieSnapshots[0]!), undefined); }
  const proof = make().cookieSnapshots[0]!.gpcReadBinding!;
  for (const change of [{ rawCookie: "PRIVATE" }, { matchedRequestHorizon: "matched" }, { inventoryCompleteness: "complete" }, { completedAtMs: 120001 }, { startedAtMs: 0 }])
    assert.equal(gpcCookieReadBindingSchema.safeParse({ ...proof, ...change }).success, false);
});

test("optional cookie metadata is omitted before it can displace existing retention evidence", () => {
  const f = gpcCookieReadFixture(), proof = buildGpcCookieReadBinding(f.input)!;
  const legacyRoomy = compactCanonicalEvidenceBundleForRetention(f.bundle, 1_000_000);
  const justFitsLegacy = Buffer.byteLength(JSON.stringify(legacyRoomy));
  const legacy = compactCanonicalEvidenceBundleForRetention(f.bundle, 1);
  f.bundle.cookieSnapshots[0]!.gpcReadBinding = proof;
  assert.deepEqual(compactCanonicalEvidenceBundleForRetention(f.bundle, justFitsLegacy), legacyRoomy,
    "crossing only the byte threshold drops the optional proof, preserving every legacy observation");
  const bounded = compactCanonicalEvidenceBundleForRetention(f.bundle, 1);
  assert.deepEqual(bounded, legacy);
  assert.deepEqual(f.bundle.cookieSnapshots[0]!.gpcReadBinding, proof, "retention does not mutate its input");
  const roomy = compactCanonicalEvidenceBundleForRetention(f.bundle, 1_000_000);
  assert.deepEqual(roomy.cookieSnapshots[0]!.gpcReadBinding, proof);
});

test("original cookie read proof survives normal compaction only in final unused headroom", () => {
  const f = gpcCookieReadRetentionFixture();
  const cap = 400 * 1024, proof = buildGpcCookieReadBinding(f.input)!;
  assert.ok(proof); assert.ok(Buffer.byteLength(JSON.stringify(f.bundle)) > cap);
  const legacy = compactCanonicalEvidenceBundleForRetention(f.bundle, cap);
  const legacyBytes = Buffer.byteLength(JSON.stringify(legacy));
  assert.ok(legacyBytes + 2048 < cap, "normal event compaction leaves sufficient metadata headroom");
  f.bundle.cookieSnapshots[0]!.gpcReadBinding = proof;
  const original = structuredClone(f.bundle), retained = compactCanonicalEvidenceBundleForRetention(f.bundle, cap);
  assert.deepEqual(readOriginalGpcCookieReadBinding(retained, retained.cookieSnapshots[0]!), proof);
  assert.equal(retained.cookieSnapshots[1]!.gpcReadBinding, undefined, "proof cannot migrate to another snapshot");
  assert.ok(Buffer.byteLength(JSON.stringify(retained)) <= cap);
  const withoutBinding = structuredClone(retained); delete withoutBinding.cookieSnapshots[0]!.gpcReadBinding;
  assert.deepEqual(withoutBinding, legacy, "every legacy fact and retention decision remains identical");
  const observe = (bundle: typeof retained) => {
    const bytes = Buffer.from(JSON.stringify(bundle));
    const source = { bytes, pointer: { uri: "new-retention-fixture-original", sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex") } };
    assert.ok(readVerifiedGpcImpactSource(source));
    const { sourceSha256: _receipt, ...observation } = buildGpcProductionObservation({ scanId: bundle.scanId, source });
    return observation;
  };
  assert.deepEqual(observe(retained), observe(legacy), "restoration cannot change canonical GPC observations");
  assert.deepEqual(f.bundle, original, "source evidence is never mutated");
  const tightCap = legacyBytes + Buffer.byteLength(JSON.stringify(proof)) - 1;
  const legacyAtTightCap = compactCanonicalEvidenceBundleForRetention(withoutBinding, tightCap);
  assert.deepEqual(compactCanonicalEvidenceBundleForRetention(retained, tightCap), legacyAtTightCap,
    "headroom cannot be created by displacing a legacy event or changing a window");
});
