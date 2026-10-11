import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { hasMaterialAcceptVisualProminence, consentControlVisualComparisonSchema } from "@certscore/contracts";
import { measureConsentControlVisualComparison, retainPairedConsentVisualCapture } from "./consent-control-visual-comparison.js";
import { consentVisualFixture, visualFixtureStartMs } from "./test-fixtures/consent-visual-comparison.js";

async function retentionFixture() {
  const fixture = await consentVisualFixture();
  const previous = { ...fixture.geometry, visualComparison: (await measureConsentControlVisualComparison(fixture))! };
  assert.ok(previous.visualComparison);
  const current = structuredClone(fixture.geometry);
  current.capturedAt = new Date(fixture.screenshotCapturedAtMs + 8862).toISOString();
  current.screenshotArtifactRef = "late-proof.png";
  current.candidates.forEach(row => { row.screenshotArtifactRef = current.screenshotArtifactRef; });
  return { previous, current, scanStartedAtMs: visualFixtureStartMs,
    previousState: { frameRevision: 2, framesStable: true }, currentState: { frameRevision: 2, framesStable: true },
    screenshots: [{ artifactId: "screenshot_pre_consent_settled", path: previous.screenshotArtifactRef!,
      capturedAtMs: 1000, url: previous.pageUrl, documentIdentity: previous.documentIdentity,
      captureMethod: "primary_viewport_fallback" as const, pagePhase: "network_idle" as const,
      consentStateAtTime: "pre_consent" as const, retentionStatus: "available" as const, displayStatus: "available" as const }] };
}

test("later duplicate inspection preserves the complete early pair without relabeling its timing or references", async () => {
  const input = await retentionFixture(), before = structuredClone(input);
  const retained = retainPairedConsentVisualCapture(input);
  assert.equal(retained, input.previous);
  assert.equal(retained.visualComparison!.captureSkewMs, 0);
  assert.notEqual(retained.capturedAt, input.current.capturedAt);
  assert.notEqual(retained.screenshotArtifactRef, input.current.screenshotArtifactRef);
  assert.ok(hasMaterialAcceptVisualProminence(retained.visualComparison!));
  assert.deepEqual(input, before, "selection must not transplant evidence or mutate either capture");
});

test("frame drift, changed controls, incomplete inspection and withheld early visuals forbid pair retention", async () => {
  const fixture = await retentionFixture();
  for (const mutate of [
    (v: typeof fixture) => { v.currentState.frameRevision++; },
    (v: typeof fixture) => { v.currentState.framesStable = false; },
    (v: typeof fixture) => { v.current.documentIdentity!.token = "other-loader"; },
    (v: typeof fixture) => { v.current.pageUrl += "other"; },
    (v: typeof fixture) => { v.current.candidates[0]!.boundingBox.x++; },
    (v: typeof fixture) => { v.current.candidates[1]!.enabled = false; },
    (v: typeof fixture) => { v.current.candidates[1]!.actionType = "other"; },
    (v: typeof fixture) => { v.current.candidates.push({ ...v.current.candidates[1]!, candidateId: "new-control" }); },
    (v: typeof fixture) => { v.current.containers[0]!.htmlExcerpt += " changed"; },
    (v: typeof fixture) => { v.current.controlInspection!.captureCoverage.documentAndFramesStable = false; },
    (v: typeof fixture) => { v.previous.controlInspection!.retainedCandidateCount++; v.current.controlInspection = structuredClone(v.previous.controlInspection); },
    (v: typeof fixture) => { v.previous.visualComparison!.documentToken = "other"; },
    (v: typeof fixture) => { v.previous.visualComparison!.accept.bounds[0]++; },
    (v: typeof fixture) => { v.screenshots[0]!.capturedAtMs -= 501; },
    (v: typeof fixture) => { Object.assign(v.screenshots[0]!, { displayStatus: "withheld" }); },
    (v: typeof fixture) => { Object.assign(v.screenshots[0]!, { retentionStatus: "withheld" }); },
    (v: typeof fixture) => { v.current.capturedAt = new Date(visualFixtureStartMs).toISOString(); },
    (v: typeof fixture) => { v.current.visualComparison = structuredClone(v.previous.visualComparison); },
  ]) {
    const input = structuredClone(fixture); mutate(input);
    assert.equal(retainPairedConsentVisualCapture(input), input.current);
  }
});

test("retained pixels distinguish fill and outline emphasis from equal or Reject-emphasized controls", async () => {
  for (const style of ["filled", "outline", "equal", "reject_filled"] as const) {
    const evidence = await measureConsentControlVisualComparison(await consentVisualFixture(style));
    assert.ok(evidence, style);
    assert.equal(hasMaterialAcceptVisualProminence(evidence), style === "filled" || style === "outline", style);
  }
});

test("ambiguous pairs, incomplete inventory, child frames, stale or scaled images cannot create visual evidence", async () => {
  const fixture = await consentVisualFixture();
  for (const mutate of [
    (g: typeof fixture.geometry) => { g.controlInspection!.structuralCoverage = "limited"; },
    (g: typeof fixture.geometry) => { g.documentIdentity = undefined; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.enabled = false; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.frameContext.frameKind = "child_frame"; },
    (g: typeof fixture.geometry) => { g.candidates[0]!.boundingBox.x = 0; },
    (g: typeof fixture.geometry) => { g.candidates.push({ ...g.candidates[0]!, candidateId: "duplicate-accept" }); },
  ]) {
    const geometry = structuredClone(fixture.geometry); mutate(geometry);
    assert.equal(await measureConsentControlVisualComparison({ ...fixture, geometry }), undefined);
  }
  assert.equal(await measureConsentControlVisualComparison({ ...fixture, screenshotCapturedAtMs: fixture.screenshotCapturedAtMs - 501 }), undefined);
  assert.equal(await measureConsentControlVisualComparison({ ...fixture, deadlineAtMs: Date.now() - 1 }), undefined);
  assert.equal(await measureConsentControlVisualComparison({ ...fixture, screenshotBytes: Buffer.from("not an image") }), undefined);
  assert.equal(await measureConsentControlVisualComparison({ ...fixture, screenshotBytes: await sharp(fixture.screenshotBytes).resize(320, 150).png().toBuffer() }), undefined);
});

test("comparison contract rejects missing surrounding coverage, nonfinite metrics and unbounded evidence", async () => {
  const evidence = (await measureConsentControlVisualComparison(await consentVisualFixture()))!;
  for (const candidate of [ { ...evidence, captureSkewMs: 501 }, { ...evidence, screenshotSha256: "bad" },
    { ...evidence, accept: { ...evidence.accept, backgroundUniformity: 0.59 } },
    { ...evidence, accept: { ...evidence.accept, fillContrast: NaN } },
    { ...evidence, reject: { ...evidence.reject, candidateId: evidence.accept.candidateId } } ]) {
    assert.equal(consentControlVisualComparisonSchema.safeParse(candidate).success, false);
  }
});

test("producer file binding rejects stale, withheld and document-mismatched images without changing geometry", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { withConsentControlVisualComparison, createConsentVisualComparisonCollector } = await import("./consent-control-visual-comparison.js");
  const { visualFixtureStartMs } = await import("./test-fixtures/consent-visual-comparison.js");
  const directory = await mkdtemp(join(tmpdir(), "consent-visual-"));
  try {
    const fixture = await consentVisualFixture();
    const path = join(directory, "proof.png");
    await writeFile(path, fixture.screenshotBytes);
    const geometry = { ...fixture.geometry, screenshotArtifactRef: path };
    const screenshot = { artifactId: "proof", path, url: geometry.pageUrl, capturedAtMs: 1000,
      consentStateAtTime: "pre_consent" as const, pagePhase: "settled" as const, documentIdentity: geometry.documentIdentity };
    const result = await withConsentControlVisualComparison(geometry, [screenshot], Date.now() + 1000, visualFixtureStartMs);
    assert.ok(result.visualComparison);
    assert.equal(geometry.visualComparison, undefined, "late completion cannot mutate an existing packet");
    for (const changed of [{ ...screenshot, displayStatus: "withheld" as const },
      { ...screenshot, documentIdentity: { source: "cdp_loader_id" as const, token: "wrong-document" } },
      { ...screenshot, capturedAtMs: 0 }, { ...screenshot, consentStateAtTime: "post_accept" as const }]) {
      assert.equal((await withConsentControlVisualComparison(geometry, [changed], Date.now() + 1000, visualFixtureStartMs)).visualComparison, undefined);
    }
    const noBudget = createConsentVisualComparisonCollector([screenshot], visualFixtureStartMs, () => 0);
    assert.equal(await noBudget(geometry), geometry);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
