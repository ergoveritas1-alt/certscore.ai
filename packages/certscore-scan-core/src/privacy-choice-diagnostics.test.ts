import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { privacyChoiceDiagnosticsSchema, privacyChoiceInspectionSchema } from "@certscore/contracts";
import { buildPrivacyChoiceDiagnostics, createPrivacyChoiceDomDiagnostics } from "./privacy-choice-diagnostics";

type Raw = ReturnType<ReturnType<typeof createPrivacyChoiceDomDiagnostics>["result"]>;
const sourceHash = "a".repeat(64);
const raw = (): Raw => ({ document: 'https://private.test/?secret=redacted,1', unnamedControls: [], frames: [], limitations: [] });
const frame = (locator = "html/body/iframe:0") => ({ locator, locatorLimited: false, frameDocument: "private-frame,1", reason: "display_none", depth: 0 });
const unnamed = (locator = "html/body/button:0") => ({ locator, locatorLimited: false, scope: "main" as const, tag: "button", role: "none", nameStates: [0, 0, 1, 0, 0, 0], labelledByTruncated: false });

test("diagnostics redact raw document and structural identifiers and bind the inspection", () => {
  const first = { ...raw(), frames: [frame()], unnamedControls: [unnamed()] };
  const result = buildPrivacyChoiceDiagnostics(first, first, sourceHash)!;
  assert.equal(result.status, "captured");
  assert.equal(result.inspectionSourceHash, sourceHash);
  assert.equal(result.identityBasis, "document_and_structural_locator_only");
  assert.equal(result.frames[0].first.locatorHash, result.frames[0].second?.locatorHash);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(result).includes("html/body"));
  assert.ok(privacyChoiceDiagnosticsSchema.safeParse(result).success);
});

test("missing and replaced documents cannot acquire matching frame checkpoints", () => {
  const first = { ...raw(), frames: [frame()] };
  for (const second of [undefined, { ...first, document: "replacement-document" }]) {
    const result = buildPrivacyChoiceDiagnostics(first, second, sourceHash)!;
    assert.equal(result.status, "limited");
    assert.equal(result.frames[0].second, null);
    assert.ok(result.limitations.includes(second ? "document_changed" : "second_checkpoint_unavailable"));
  }
});

test("frame navigation, state changes, missing and duplicate locators remain explicit", () => {
  const first = { ...raw(), frames: [frame()] };
  for (const [frames, limitation] of [
    [[{ ...frame(), frameDocument: "new-document" }], "frame_document_changed"],
    [[{ ...frame(), reason: "aria_hidden" }], "frame_state_changed"],
    [[], "frame_set_changed"],
    [[frame(), frame()], "frame_set_changed"],
  ] as const) {
    const result = buildPrivacyChoiceDiagnostics(first, { ...raw(), frames: [...frames] }, sourceHash)!;
    assert.equal(result.status, "limited");
    assert.ok(result.limitations.includes(limitation));
  }
});

test("contract rejects suppressed truncation and checkpoint limitations", () => {
  const first = {...raw(), frames:[frame()]};
  const result = buildPrivacyChoiceDiagnostics(first, first, sourceHash)!;
  for (const patch of [
    {frames:[{first:result.frames[0].first,second:null}]},
    {frames:[{...result.frames[0], first:{...result.frames[0].first,locatorLimited:true}}]},
    {frames:[{...result.frames[0], first:{...result.frames[0].first,reason:"time_limit"}}]},
    {frames:[{...result.frames[0], second:{...result.frames[0].second,frameDocumentHash:"f".repeat(64)}}]},
  ]) assert.equal(privacyChoiceDiagnosticsSchema.safeParse({...result,...patch}).success, false);
});

test("shared encoded cap trims samples and retains an explicit limitation", () => {
  const first = { ...raw(), limitations: ["unnamed_sample_truncated", "frame_sample_truncated", "diagnostic_time_limit", "diagnostic_unavailable", "locator_limited", "second_checkpoint_unavailable", "document_changed", "frame_set_changed", "frame_document_changed", "frame_state_changed"], frames: Array.from({length: 4}, (_, i) => ({...frame(`frame:${i}`), reason: "visibility_collapse", depth: 16})), unnamedControls: Array.from({length: 8}, (_, i) => ({...unnamed(`button:${i}`), role: "button", scope: "frame" as const})) };
  const result = buildPrivacyChoiceDiagnostics(first, first, sourceHash)!;
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 4096);
  assert.ok(result.limitations.includes("byte_limit"));
  assert.equal(result.status, "limited");
  assert.ok(result.unnamedControls.length < 8 || result.frames.length < 4);
  assert.equal(privacyChoiceDiagnosticsSchema.safeParse({...result, frames: Array(5).fill(result.frames[0])}).success, false);
  assert.equal(privacyChoiceDiagnosticsSchema.safeParse({...result, unnamedControls: Array(9).fill({...unnamed(), locatorHash: sourceHash})}).success, false);
});

const inspection = {
  contractVersion: "certscore.privacy-choice-inspection.v5", documentUrl: "https://example.test/", capturedAt: "2026-10-23T00:00:00.000Z", sourceHash,
  scope: "rendered_named_links_and_buttons", coverage: "limited", namedChoiceCandidateCount: 0, unnamedControlCount: 1,
  candidateEnumerationTruncated: false, uninspectedFrameCount: 1, uninspectedShadowRootCount: 0,
  supportedDocumentLanguage: true, representativeDocument: true, documentStable: true, hiddenUnnamedControlCount: 0,
  frameCount: 1, inspectedSameOriginFrameCount: 0, hiddenUninspectedFrameCount: 1, inaccessibleFrameCount: 0,
  unreadyFrameCount: 0, unprojectableFrameCount: 0, frameBudgetLimitedCount: 0, namedFrameChoiceCandidateCount: 0, frameInspectionWorkMs: 0, frameProofWorkMs: 0,
  homepageAccessPolicy: "representative_homepage.v1", readinessPolicy: "document_bound_dom_inventory.v1", documentReadyState: "complete",
  limitationKeys: ["unnamed_controls", "frame_inventory_incomplete"],
};
test("diagnostic success cannot promote unnamed or hidden-frame absence; historical records remain valid", () => {
  const diagnostics = buildPrivacyChoiceDiagnostics(raw(), raw(), sourceHash)!;
  assert.ok(privacyChoiceInspectionSchema.safeParse(inspection).success);
  assert.ok(privacyChoiceInspectionSchema.safeParse({...inspection, diagnostics}).success);
  assert.equal(privacyChoiceInspectionSchema.safeParse({...inspection, diagnostics, coverage: "complete", limitationKeys: []}).success, false);
  assert.equal(privacyChoiceInspectionSchema.safeParse({...inspection, diagnostics: {...diagnostics, inspectionSourceHash: "b".repeat(64)}}).success, false);
});

test("offline DOM fixtures distinguish hidden reasons, naming sources, frame scopes and caps", {timeout: 20_000}, async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.abort());
    // Deterministic clock tests the structural caps independently of host load.
    const read = (body: string) => page.evaluate<Raw>(`(() => { const __name = (fn) => fn; Object.defineProperty(performance, 'now', {configurable:true,value:()=>0}); const diagnostics=(${createPrivacyChoiceDomDiagnostics.toString()})(); ${body}; return diagnostics.result(); })()`);
    for (const [attrs, parentAttrs, reason, depth] of [
      ['style="display:none"', '', 'display_none', 0],
      ['style="visibility:hidden"', '', 'visibility_hidden', 0],
      ['style="visibility:collapse"', '', 'visibility_collapse', 0],
      ['style="opacity:0"', '', 'opacity_zero', 0],
      ['aria-hidden="true"', '', 'aria_hidden', 0],
      ['inert', '', 'inert', 0],
      ['', 'style="opacity:0"', 'opacity_zero', 1],
      ['', '', 'visible', 3],
    ] as const) {
      await page.setContent(`<div ${parentAttrs}><iframe ${attrs}></iframe></div>`);
      const result = await read('diagnostics.frame(document.querySelector("iframe"),0,20)');
      assert.equal(result.frames[0].reason, reason);
      // Visible traversal exhausts the ancestors; hidden reasons record their first depth.
      if (reason !== "visible") assert.equal(result.frames[0].depth, depth);
    }
    await page.setContent('<button aria-label="" aria-labelledby="a b c d e"></button><iframe srcdoc="<button></button>"></iframe>');
    const result = await read(`const names=[['aria_label',''],['aria_labelledby',''],['text',''],['image_alt',null],['svg_title',null],['title',null]];
      diagnostics.unnamed(document.querySelector('button'), names, 'main');
      diagnostics.unnamed(document.querySelector('iframe').contentDocument.querySelector('button'), names, 'frame');`);
    assert.deepEqual(result.unnamedControls[0].nameStates, [1,1,1,0,0,0]);
    assert.equal(result.unnamedControls[0].labelledByTruncated, true);
    assert.equal(result.unnamedControls[1].scope, 'frame');
    assert.ok(result.unnamedControls[1].locator.includes('frame-document'));
    assert.notEqual(result.unnamedControls[0].locator, result.unnamedControls[1].locator);
    const capped = await read(`for(let i=0;i<9;i++) diagnostics.unnamed(document.querySelector('button'),Array(6).fill(['text','']), 'main');
      for(let i=0;i<5;i++) diagnostics.frame(document.querySelector('iframe'),i,20);`);
    assert.equal(capped.unnamedControls.length, 8); assert.equal(capped.frames.length, 4);
    assert.ok(capped.limitations.includes('unnamed_sample_truncated')); assert.ok(capped.limitations.includes('frame_sample_truncated'));
    const timeout = await read("diagnostics.frame(document.querySelector('iframe'),0,0)");
    assert.equal(timeout.frames.length, 0); assert.ok(timeout.limitations.includes('diagnostic_time_limit'));
    const internalTimeout = await read("let tick=0; Object.defineProperty(performance,'now',{value:()=>++tick}); diagnostics.frame(document.querySelector('iframe'),0,20)");
    assert.ok(internalTimeout.limitations.includes('diagnostic_time_limit'));
    assert.equal(internalTimeout.frames[0].locatorLimited, true);
    const failure = await read("diagnostics.unnamed(null,[], 'main')");
    assert.ok(failure.limitations.includes('diagnostic_unavailable'));
    const noRects = await read("const frame=document.querySelector('iframe'); frame.getClientRects=()=>[]; diagnostics.frame(frame,0,20)");
    assert.equal(noRects.frames[0].reason, 'no_rect');
    await page.setContent('<div>'+Array(65).fill('<span></span>').join('')+'<button></button></div>');
    const truncated = await read("diagnostics.unnamed(document.querySelector('button'),Array(6).fill(['text','']), 'main')");
    assert.equal(truncated.unnamedControls[0].locatorLimited, true);
    assert.ok(truncated.limitations.includes('locator_limited'));
  } finally { await browser.close(); }
});

test('identity precedes expensive optional locators without resetting the shared allowance', {timeout:15_000}, async()=>{
  const {createPrivacyFrameContinuityProof}=await import('./privacy-frame-continuity');
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.route('**/*',route=>route.abort());
    await page.setContent('<button></button><iframe style="display:none"></iframe>');
    const result=await page.evaluate<{first:Raw;second:Raw;proofCalls:string[];slowReads:number}>(`(()=>{
      const __name=fn=>fn;let clock=0,slowReads=0;const proofCalls=[];
      Object.defineProperty(performance,'now',{value:()=>clock});
      const button=document.querySelector('button');
      Object.defineProperty(button,'previousElementSibling',{get(){slowReads++;clock+=3;return null;}});
      const original=(${createPrivacyFrameContinuityProof.toString()})();
      const proof={begin(...args){proofCalls.push('begin:'+clock);return original.begin(...args);},finish(...args){proofCalls.push('finish:'+clock);return original.finish(...args);}};
      function read(checkpoint){const d=(${createPrivacyChoiceDomDiagnostics.toString()})(proof,checkpoint);
        for(let n=0;n<8;n++)d.unnamed(button,Array(6).fill(['text','']),'main');
        d.frame(document.querySelector('iframe'),0,clock+20);return d.result();}
      const first=read('first'),second=read('second');return {first,second,proofCalls,slowReads};
    })()`);
    assert.deepEqual(result.proofCalls,['begin:0','finish:3']);
    assert.equal(result.second.checkpointIdentity?.status,'matched');
    assert.equal(result.slowReads,2,'one expensive locator consumes each cooperative allowance; later samples are skipped');
    assert.ok(result.first.limitations.includes('diagnostic_time_limit'));
    const built=buildPrivacyChoiceDiagnostics(result.first,result.second,sourceHash)!;
    assert.equal(built.status,'limited');assert.ok(Buffer.byteLength(JSON.stringify(built))<=4096);
    assert.equal(privacyChoiceInspectionSchema.safeParse({...inspection,diagnostics:built,coverage:'complete',limitationKeys:[]}).success,false);
  }finally{await browser.close();}
});
