import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { hasMaterialAcceptVisualProminence, consentControlVisualComparisonSchema } from "@certscore/contracts";
import { dominantQuantizedRgb, comparisonPair, measureConsentControlVisualComparison, retainPairedConsentVisualCapture } from "./consent-control-visual-comparison.js";
import { consentVisualFixture, separatedConsentVisualFixture, visualFixtureStartMs } from "./test-fixtures/consent-visual-comparison.js";

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
    (g: typeof fixture.geometry) => { (g as unknown as {captureTiming: unknown}).captureTiming = null; },
    (g: typeof fixture.geometry) => { g.captureTiming = {version:"consent_geometry_capture_timing.v1",mainFrameCompletedAt:"2026-01-01T00:00:00.000Z",completedAt:g.capturedAt}; },
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


test("stacked Accept/Reject controls retain measured prominence with the same ambiguity and coverage gates", async () => {
  for (const style of ["filled", "outline", "equal", "reject_filled"] as const) {
    const fixture = await consentVisualFixture(style, true);
    const comparison = await measureConsentControlVisualComparison(fixture);
    assert.ok(comparison, style);
    assert.equal(hasMaterialAcceptVisualProminence(comparison), style === "filled" || style === "outline");
    fixture.geometry.candidates.push({ ...fixture.geometry.candidates[1]!, candidateId: "duplicate-reject" });
    assert.equal(await measureConsentControlVisualComparison(fixture), undefined);
  }
});


test("separated Streamable, Witt and Qobuz layouts pair without weakening image/inspection gates", async () => {
  for (const layout of ["streamable", "witt", "qobuz"] as const) {
    const fixture = await separatedConsentVisualFixture(layout);
    assert.ok(comparisonPair(fixture.geometry), layout);
    assert.ok(await measureConsentControlVisualComparison(fixture), layout);
    const incomplete = structuredClone(fixture.geometry); delete incomplete.controlInspection;
    assert.equal(await measureConsentControlVisualComparison({ ...fixture, geometry: incomplete }), undefined);
    assert.equal(await measureConsentControlVisualComparison({ ...fixture, screenshotCapturedAtMs: fixture.screenshotCapturedAtMs - 501 }), undefined);
    assert.equal(await measureConsentControlVisualComparison({ ...fixture, deadlineAtMs: Date.now() - 1 }), undefined);
  }
});

test("separated pairing excludes scoped, ambiguous, cross-surface, dismiss and container candidates", async () => {
  const fixture = await separatedConsentVisualFixture("streamable");
  for (const mutate of [
    (g: typeof fixture.geometry) => { g.candidates[1]!.label = "jetzt ablehnen"; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.label = "Reject analytics"; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.label = "Reject Utiq"; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.label = "Close"; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.ariaLabel = "Accept all"; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.tagName = "a"; g.candidates[1]!.role = "button"; g.candidates[1]!.linkDestination = "other_document"; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.frameContext.frameKind = "child_frame"; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.frameContext.frameUrl += "different"; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.containerId = "unretained"; },
    (g: typeof fixture.geometry) => { g.containers[0]!.layer = "page_body"; },
    (g: typeof fixture.geometry) => { g.containers[0]!.boundingBox = { x: 0, y: 0, left: 0, top: 0, width: 1366, height: 900, right: 1366, bottom: 900 }; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.consentContextConfirmed = false; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.clippedByScrollableAncestor = true; },
    (g: typeof fixture.geometry) => { g.candidates[1]!.tagName = "div"; },
    (g: typeof fixture.geometry) => { g.candidates.push({ ...g.candidates[1]!, candidateId: "other-reject" }); },
    (g: typeof fixture.geometry) => { g.candidates.push({ ...g.candidates[0]!, candidateId: "other-accept" }); },
  ]) {
    const geometry = structuredClone(fixture.geometry); mutate(geometry);
    assert.equal(comparisonPair(geometry), undefined, mutate.toString());
  }
  const link = structuredClone(fixture.geometry);
  link.candidates[1]!.tagName = "a"; link.candidates[1]!.linkDestination = "same_document";
  assert.ok(comparisonPair(link), "a global refusal link with retained same-document destination remains eligible");
});

test("interim images never consume the single authoritative 80 ms allowance", async t => {
  const { createConsentVisualComparisonCollector } = await import("./consent-control-visual-comparison.js");
  const fixture = await consentVisualFixture();
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const early = { artifactId: "screenshot_pre_consent_settled", path: "early.png", url: fixture.geometry.pageUrl,
    documentIdentity: fixture.geometry.documentIdentity, capturedAtMs: 1000, consentStateAtTime: "pre_consent" as const, pagePhase: "network_idle" as const };
  const proof = { ...early, artifactId: "screenshot_pre_consent_geometry_proof", path: "proof.png" };
  const allowances: number[] = [];
  // Deterministic slow/inconclusive analysis; existing pixel-analysis fixtures
  // separately verify image binding, metrics, geometry and materiality.
  const collector = createConsentVisualComparisonCollector([early, proof], visualFixtureStartMs, () => 1000,
    async (geometry, _images, deadline) => { allowances.push(deadline - now); now = deadline; return geometry; });
  const geometry = { ...fixture.geometry, screenshotArtifactRef: early.path };
  await collector(geometry);
  await collector(geometry);
  await collector({ ...geometry, screenshotArtifactRef: proof.path });
  await collector({ ...geometry, screenshotArtifactRef: proof.path });
  assert.deepEqual(allowances, [80], "Interim frames cannot starve the final image or launch duplicate decodes");
  assert.equal(now, 1080, "No additional pixel-analysis allowance");
  assert.equal(geometry.visualComparison, undefined, "Budget priority cannot invent a measurement");
});

test("authoritative-only analysis avoids an interim timer overrun and cannot publish late or duplicate results", async t => {
  const {createConsentVisualComparisonCollector}=await import("./consent-control-visual-comparison.js");
  const fixture=await consentVisualFixture();
  let now=1000, calls=0;
  t.mock.method(Date,"now",()=>now);
  const diagnostics:any[]=[];
  const early={artifactId:"screenshot_pre_consent_settled",path:"early.png",url:fixture.geometry.pageUrl,documentIdentity:fixture.geometry.documentIdentity,capturedAtMs:1000,consentStateAtTime:"pre_consent" as const,pagePhase:"network_idle" as const};
  const proof={...early,artifactId:"screenshot_pre_consent_geometry_proof",path:"proof.png"};
  const collector=createConsentVisualComparisonCollector([early,proof],visualFixtureStartMs,()=>1000,
    async (geometry,_images,deadline)=>{calls++; assert.equal(deadline-now,80);now+=81;return geometry;},d=>diagnostics.push(d));
  await collector({...fixture.geometry,screenshotArtifactRef:early.path});
  assert.equal(calls,0,"No native decode or delayed timer on interim images");
  const geometry={...fixture.geometry,screenshotArtifactRef:proof.path};
  assert.equal(await collector(geometry),geometry);
  await collector(geometry);
  assert.equal(calls,1,"No retry or overlapping decoder after the shared allowance");
  assert.deepEqual(diagnostics.map(d=>d.status),["deferred","timed_out","no_budget"]);
  assert.equal(geometry.visualComparison,undefined);
});

test("an unbound or unstable proof cannot spend the allowance reserved for an eligible recovery", async () => {
  const {createConsentVisualComparisonCollector}=await import("./consent-control-visual-comparison.js");
  const fixture=await consentVisualFixture();
  const image={artifactId:"screenshot_pre_consent_geometry_proof",path:"proof.png",url:fixture.geometry.pageUrl,documentIdentity:fixture.geometry.documentIdentity,capturedAtMs:1000,consentStateAtTime:"pre_consent" as const,pagePhase:"network_idle" as const};
  let calls=0;
  const reasons: Array<string | undefined> = [];
  const collector=createConsentVisualComparisonCollector([image],visualFixtureStartMs,()=>1000,async geometry=>{calls++;return geometry;},diagnostic=>reasons.push(diagnostic.reason));
  const geometry={...fixture.geometry,screenshotArtifactRef:image.path};
  await collector({...geometry,documentIdentity:{source:"cdp_loader_id",token:"wrong-loader"}});
  await collector(geometry,{framesStable:false,frameRevision:2});
  assert.equal(calls,0);
  assert.deepEqual(reasons,["image_binding_incomplete","capture_frames_changed"]);
  await collector(geometry,{framesStable:true,frameRevision:2});
  assert.equal(calls,1);
});


test("a terminal settled pair gets the existing single allowance; ineligible settled images cannot consume it",async()=>{
  const {createConsentVisualComparisonCollector}=await import("./consent-control-visual-comparison.js");
  const fixture=await consentVisualFixture();
  const image={artifactId:"screenshot_pre_consent_settled",path:"settled.png",url:fixture.geometry.pageUrl,documentIdentity:fixture.geometry.documentIdentity,capturedAtMs:1000,consentStateAtTime:"pre_consent" as const,pagePhase:"network_idle" as const};
  let calls=0;
  const reasons:Array<string|undefined>=[];
  const collector=createConsentVisualComparisonCollector([image],visualFixtureStartMs,()=>1000,async geometry=>{calls++;return geometry;},d=>reasons.push(d.reason));
  const geometry={...fixture.geometry,screenshotArtifactRef:image.path};
  await collector(geometry);assert.equal(calls,0,"An interim settled frame remains deferred");
  const covered=structuredClone(geometry);covered.candidates[1]!.decisionStatus="covered";
  await collector(covered,{terminalPair:true,framesStable:true,frameRevision:1});assert.equal(calls,0);assert.ok(reasons.includes("pair_occluded"));
  await collector(geometry,{terminalPair:true,framesStable:false,frameRevision:1});assert.equal(calls,0);
  await collector(geometry,{terminalPair:true,framesStable:true,frameRevision:1});assert.equal(calls,1);
  await collector(geometry,{terminalPair:true,framesStable:true,frameRevision:1});assert.equal(calls,1);
});


test("fixed histogram preserves the original colour-bin averages, fractions and first-seen tie decisions", () => {
  const reference = (pixels: Array<[number,number,number]>) => {
    const groups = new Map<string,{count:number;sum:[number,number,number]}>();
    for (const rgb of pixels) {
      const key=rgb.map(v=>Math.floor(v/16)).join(":");const group=groups.get(key)??{count:0,sum:[0,0,0]};
      group.count++;rgb.forEach((v,i)=>{group.sum[i]!+=v});groups.set(key,group);
    }
    const winner=[...groups.values()].sort((a,b)=>b.count-a.count)[0];
    return winner?{rgb:winner.sum.map(v=>v/winner.count),fraction:winner.count/pixels.length}:undefined;
  };
  const tie: Array<[number,number,number]>=[[255,255,255],[0,0,0],[254,253,252],[1,2,3]];
  const uniform: Array<[number,number,number]>=Array.from({length:20000},(_,i)=>[240+i%16,240+(i*3)%16,240+(i*7)%16]);
  const varied: Array<[number,number,number]>=Array.from({length:40000},(_,i)=>[i%256,(i*7)%256,(i*31)%256]);
  for (const pixels of [[],tie,tie.toReversed(),uniform,varied]) assert.deepEqual(dominantQuantizedRgb(pixels),reference(pixels));
});

test("exact analysis rectangle and streaming samples match full-frame measurements without losing surrounding pixels", async () => {
  const reference = async (fixture: Awaited<ReturnType<typeof consentVisualFixture>>) => {
    const {data, info} = await sharp(fixture.screenshotBytes).removeAlpha().toColourspace("srgb").raw().toBuffer({resolveWithObject: true});
    const round = (n: number) => Math.round(n * 1000) / 1000;
    const luminance = (rgb: number[]) => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i]!, 0);
    const pixel = (x: number, y: number): [number, number, number] => {
      const at = (y * info.width + x) * 3; return [data[at]!, data[at + 1]!, data[at + 2]!];
    };
    const measure = (index: number) => {
      const candidate = fixture.geometry.candidates[index]!;
      const {x, y, width, height} = candidate.boundingBox;
      const left = Math.floor(x), top = Math.floor(y), right = Math.ceil(x + width), bottom = Math.ceil(y + height);
      const interior: Array<[number, number, number]> = [], background: Array<[number, number, number]> = [], emphasis: Array<[number, number, number]> = [];
      const stride = Math.max(1, Math.ceil(Math.sqrt(width * height / 20_000)));
      for (let py = top - 12; py < bottom + 12; py++) for (let px = left - 12; px < right + 12; px++) {
        if (px >= left + 4 && px < right - 4 && py >= top + 4 && py < bottom - 4) {
          if ((px - left) % stride === 0 && (py - top) % stride === 0) interior.push(pixel(px, py));
        } else if (px < left - 9 || px >= right + 9 || py < top - 9 || py >= bottom + 9) background.push(pixel(px, py));
        else if (px < left || px >= right || py < top || py >= bottom) emphasis.push(pixel(px, py));
      }
      const fill = dominantQuantizedRgb(interior), surrounding = dominantQuantizedRgb(background);
      if (!fill || !surrounding || fill.fraction < 0.6 || surrounding.fraction < 0.6 || !emphasis.length) return undefined;
      const a = luminance(fill.rgb), b = luminance(surrounding.rgb);
      const changed = emphasis.filter(rgb => Math.hypot(...rgb.map((v, i) => v - surrounding.rgb[i]!)) >= 60).length;
      return {candidateId: candidate.candidateId, bounds: [x, y, width, height],
        fillContrast: round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)), outerEmphasisFraction: round(changed / emphasis.length),
        backgroundUniformity: round(surrounding.fraction), interiorUniformity: round(fill.fraction)};
    };
    return {accept: measure(0), reject: measure(1)};
  };
  for (const mode of ["row", "stacked", "fractional", "edge", "textured", "nonuniform", "large", "rgba", "jpeg"]) {
    const fixture = await consentVisualFixture("outline", mode === "stacked");
    if (mode === "fractional" || mode === "edge") {
      for (const [index, candidate] of fixture.geometry.candidates.slice(0, 2).entries()) {
        const b = candidate.boundingBox;
        const x = mode === "edge" ? 12 + index * 220 : b.x + 0.35, y = mode === "edge" ? 12 : b.y + 0.6;
        Object.assign(b, {x, y, left: x, top: y, right: x + b.width, bottom: y + b.height});
      }
      if (mode === "edge") Object.assign(fixture.geometry.containers[0]!.boundingBox, {x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 300, width: 640, height: 300});
    }
    if (mode === "textured" || mode === "nonuniform") {
      const {data, info} = await sharp(fixture.screenshotBytes).removeAlpha().raw().toBuffer({resolveWithObject: true});
      for (let i = 0; i < data.length; i++) if (mode === "nonuniform" || i % 7 === 0) data[i] = mode === "nonuniform" ? (i * 31) % 256 : Math.min(255, data[i]! + i % 8);
      fixture.screenshotBytes = await sharp(data, {raw: {width: info.width, height: info.height, channels: 3}}).png().toBuffer();
    }
    if (mode === "large") {
      for (const [index, candidate] of fixture.geometry.candidates.slice(0, 2).entries()) {
        const b = candidate.boundingBox, x = index === 0 ? 60 : 380, width = index === 0 ? 300 : 220;
        Object.assign(b, {x, left: x, width, height: 80, right: x + width, bottom: b.y + 80});
      }
    }
    if (mode === "rgba") fixture.screenshotBytes = await sharp(fixture.screenshotBytes).ensureAlpha(0.4).png().toBuffer();
    if (mode === "jpeg") fixture.screenshotBytes = await sharp(fixture.screenshotBytes).jpeg({quality: 90, chromaSubsampling: "4:4:4"}).toBuffer();
    const expected = await reference(fixture);
    const actual = await measureConsentControlVisualComparison(fixture);
    if (!expected.accept || !expected.reject) assert.equal(actual, undefined, mode);
    else {
      assert.ok(actual, mode);
      assert.deepEqual(actual.accept, expected.accept, mode);
      assert.deepEqual(actual.reject, expected.reject, mode);
      assert.equal(actual.imageWidth, fixture.geometry.viewport.width, "report original full-image dimensions");
      assert.equal(actual.imageHeight, fixture.geometry.viewport.height);
    }
  }
});

test("the final synchronized CMP capture uses the remaining single comparison allowance", async () => {
  const { createConsentVisualComparisonCollector } = await import('./consent-control-visual-comparison.js');
  const fixture = await consentVisualFixture();
  const image = {artifactId:'screenshot_pre_consent_cmp_controls',path:fixture.geometry.screenshotArtifactRef!,url:fixture.geometry.pageUrl,
    documentIdentity:fixture.geometry.documentIdentity,capturedAtMs:1000,consentStateAtTime:'pre_consent' as const};
  let calls=0;
  const diagnostics:string[]=[];
  const collector=createConsentVisualComparisonCollector([image],visualFixtureStartMs,()=>1000,
    async geometry=>{calls++;return geometry;},d=>diagnostics.push(d.status));
  await collector(fixture.geometry);
  await collector(fixture.geometry,{terminalPair:true,frameRevision:1,framesStable:false});
  assert.equal(calls,0);
  await collector(fixture.geometry,{terminalPair:true,frameRevision:1,framesStable:true});
  await collector(fixture.geometry,{terminalPair:true,frameRevision:1,framesStable:true});
  assert.equal(calls,1);
  assert.deepEqual(diagnostics,['deferred','deferred','unavailable','no_budget']);
});
