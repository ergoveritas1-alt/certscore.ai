import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { privacyChoiceInspectionSchema, PRIVACY_CHOICE_DIAGNOSTIC_BYTES } from "@certscore/contracts";
import { createPrivacyFrameContinuityProof } from "./privacy-frame-continuity";

function fixture() {
  const owner = {} as Document;
  const child = {} as Document;
  Object.assign(child, {defaultView: {document: child}});
  const node = {localName: "iframe", ownerDocument: owner, isConnected: true, contentDocument: child} as unknown as HTMLIFrameElement;
  return {owner, child, node};
}
const deadline = () => performance.now() + 2;

test("exact endpoint references match; the proof contains no URL, label or locator", () => {
  const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
  proof.begin(owner, [node], deadline());
  const result = proof.finish(owner, [node], deadline());
  assert.equal(result.status, "matched");
  assert.deepEqual(result.frames, [{slot: 0, node: "same", document: "same"}]);
  assert.equal(result.scope, "sampled_frame_checkpoint_identity_only");
  assert.equal(result.identityBasis, "dom_reference_equality");
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < PRIVACY_CHOICE_DIAGNOSTIC_BYTES);
});

test("identical-looking replacement nodes cannot match", () => {
  const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
  proof.begin(owner, [node], deadline());
  const result = proof.finish(owner, [{...node} as HTMLIFrameElement], deadline());
  assert.equal(result.status, "limited");
  assert.deepEqual(result.frames, [{slot: 0, node: "different", document: "unavailable"}]);
  assert.ok(result.limitations.includes("node_changed"));
});

test("same node with a replacement document cannot match", () => {
  const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
  proof.begin(owner, [node], deadline());
  Object.assign(node, {contentDocument: fixture().child});
  const result = proof.finish(owner, [node], deadline());
  assert.deepEqual(result.frames, [{slot: 0, node: "same", document: "different"}]);
  assert.ok(result.limitations.includes("document_changed"));
});

test("parent replacement, detachment and adoption stay limited", () => {
  for (const mode of ["parent", "detached", "adopted"] as const) {
    const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
    proof.begin(owner, [node], deadline());
    if (mode === "detached") Object.assign(node, {isConnected: false});
    if (mode === "adopted") Object.assign(node, {ownerDocument: {}});
    const result = proof.finish(mode === "parent" ? {} as Document : owner, [node], deadline());
    assert.equal(result.status, "limited");
    assert.deepEqual(result.frames, [{slot: 0, node: "unavailable", document: "unavailable"}]);
  }
});

test("missing, added, reordered and duplicate frame slots stay limited", () => {
  for (const mode of ["missing", "added", "reordered", "duplicate"] as const) {
    const {owner, node} = fixture(), other = {...node} as HTMLIFrameElement;
    const proof = createPrivacyFrameContinuityProof();
    proof.begin(owner, mode === "reordered" ? [node, other] : [node], deadline());
    const nodes = mode === "missing" ? [] : mode === "added" ? [node, other] : mode === "reordered" ? [other, node] : [node, node];
    const result = proof.finish(owner, nodes, deadline());
    assert.equal(result.status, "limited");
    if (mode === "duplicate") assert.ok(result.limitations.includes("duplicate_frame"));
  }
});

test("opaque, unavailable and throwing child documents never gain identity proof", () => {
  for (const mode of ["opaque", "window", "throw"] as const) {
    const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
    Object.defineProperty(node, "contentDocument", {get() {
      if (mode === "throw") throw new Error("opaque");
      return mode === "opaque" ? null : {defaultView: null};
    }});
    proof.begin(owner, [node], deadline());
    const result = proof.finish(owner, [node], deadline());
    assert.equal(result.status, "limited");
    assert.equal(result.frames[0].document, "unavailable");
    assert.ok(result.limitations.includes("read_unavailable"));
  }
});

test("fifth frame is never read; overflow is explicit and bounded", () => {
  const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
  const fifth = {...node} as HTMLIFrameElement;
  Object.defineProperty(fifth, "contentDocument", {get() {throw new Error("fifth frame was inspected");}});
  const nodes = [...Array.from({length: 4}, () => ({...node} as HTMLIFrameElement)), fifth];
  proof.begin(owner, nodes, deadline());
  const result = proof.finish(owner, nodes, deadline());
  assert.equal(result.frames.length, 4);
  assert.equal(result.status, "limited");
  assert.deepEqual(result.limitations, ["frame_limit"]);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= PRIVACY_CHOICE_DIAGNOSTIC_BYTES);
});

test("expired and invalid shared deadlines prevent reads at either checkpoint", () => {
  for (const invalid of [0, NaN, Infinity]) for (const stage of ["first", "second"] as const) {
    const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
    let reads = 0;
    const child = node.contentDocument;
    Object.defineProperty(node, "contentDocument", {get() {reads++; return child;}});
    proof.begin(owner, [node], stage === "first" ? invalid : deadline());
    const before = reads;
    const result = proof.finish(owner, [node], stage === "second" ? invalid : deadline());
    if (stage === "first") assert.equal(before, 0);
    if (stage === "second") assert.equal(reads, before);
    assert.equal(result.status, "limited");
    assert.ok(result.limitations.includes("time_limit"));
    assert.equal(result.frames[0].document, "unavailable");
  }
});

test("a slow cooperative read is discarded, not promoted after its deadline", t => {
  let clock = 0;
  t.mock.method(performance, "now", () => clock);
  for (const stage of ["first", "second"] as const) {
    clock = 0;
    const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
    const child = node.contentDocument;
    let slow = stage === "first";
    Object.defineProperty(node, "contentDocument", {get() {if (slow) clock += 3; return child;}});
    proof.begin(owner, [node], 2);
    slow = stage === "second";
    const result = proof.finish(owner, [node], clock + 2);
    assert.equal(result.status, "limited");
    assert.ok(result.limitations.includes("time_limit"));
    assert.equal(result.frames[0].document, "unavailable");
  }
});

test("caller remainder is honored and a large deadline cannot enlarge the two-millisecond cap", t => {
  let clock = 0;
  t.mock.method(performance, "now", () => clock);
  for (const cap of [0.25, 1000]) {
    clock = 0;
    const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
    const child = node.contentDocument;
    Object.defineProperty(node, "contentDocument", {get() {clock += cap === 0.25 ? 0.5 : 3; return child;}});
    proof.begin(owner, [node], cap);
    const result = proof.finish(owner, [node], clock + 2);
    assert.equal(result.status, "limited");
    assert.ok(result.limitations.includes("time_limit"));
    assert.equal(result.frames[0].document, "unavailable");
  }
});

test("cancellation is terminal and cannot retry, read or mutate the terminal proof", () => {
  const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
  proof.begin(owner, [node], deadline());
  const result = proof.cancel();
  Object.defineProperty(node, "contentDocument", {get() {throw new Error("read after cancellation");}});
  proof.begin(owner, [node], deadline());
  result.limitations.length = 0;
  const terminal = proof.finish(owner, [node], deadline());
  assert.equal(terminal.status, "limited");
  assert.deepEqual(terminal.limitations, ["cancelled"]);
  assert.deepEqual(terminal.frames, []);
});

test("absent and empty checkpoints cannot establish matched frame identity", () => {
  const {owner, node} = fixture();
  const missing = createPrivacyFrameContinuityProof().finish(owner, [node], deadline());
  assert.equal(missing.status, "limited");
  assert.ok(missing.limitations.includes("checkpoint_missing"));
  const empty = createPrivacyFrameContinuityProof();
  empty.begin(owner, [], deadline());
  assert.equal(empty.finish(owner, [], deadline()).status, "limited");
});

test("successful identity proof changes no existing hidden-frame absence rule", async () => {
  const {owner, node} = fixture(), proof = createPrivacyFrameContinuityProof();
  proof.begin(owner, [node], deadline());
  assert.equal(proof.finish(owner, [node], deadline()).status, "matched");
  const inspection = {
    contractVersion: "certscore.privacy-choice-inspection.v5", documentUrl: "https://example.test/",
    capturedAt: "2026-10-23T00:00:00.000Z", sourceHash: "a".repeat(64),
    scope: "rendered_named_links_and_buttons", coverage: "limited", namedChoiceCandidateCount: 0,
    unnamedControlCount: 0, candidateEnumerationTruncated: false, uninspectedFrameCount: 1,
    uninspectedShadowRootCount: 0, supportedDocumentLanguage: true, representativeDocument: true,
    documentStable: true, hiddenUnnamedControlCount: 0, frameCount: 1, inspectedSameOriginFrameCount: 0,
    hiddenUninspectedFrameCount: 1, inaccessibleFrameCount: 0, unreadyFrameCount: 0,
    unprojectableFrameCount: 0, frameBudgetLimitedCount: 0, namedFrameChoiceCandidateCount: 0,
    frameInspectionWorkMs: 0, frameProofWorkMs: 0, homepageAccessPolicy: "representative_homepage.v1",
    readinessPolicy: "document_bound_dom_inventory.v1", documentReadyState: "complete",
    limitationKeys: ["frame_inventory_incomplete"],
  };
  assert.ok(privacyChoiceInspectionSchema.safeParse(inspection).success);
  assert.equal(privacyChoiceInspectionSchema.safeParse({...inspection, coverage: "complete", limitationKeys: []}).success, false);
  const scanner = await readFile(new URL("./scanners/policy-surface-scanner.ts", import.meta.url), "utf8");
  assert.ok(!scanner.slice(scanner.indexOf("const inventoryComplete ="), scanner.indexOf("const rightsMethods =")).includes("checkpointIdentity"), "Diagnostic identity must not change absence prerequisites");
});

test("real DOM checkpoint fixtures: references survive only in the offline closure", {timeout: 30_000}, async t => {
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext();
  let requests = 0;
  await context.route("**/*", async route => {requests++; await route.abort();});
  try {
    for (const mode of ["unchanged", "replacement", "navigation", "removed", "visibility", "opaque", "cancel"] as const) {
      await t.test(mode, async () => {
        const page = await context.newPage();
        try {
          await page.setContent(`<iframe style="display:none" ${mode === "opaque" ? 'sandbox=""' : ''} srcdoc="<p>fixture</p>"></iframe>`);
          const globals = await page.evaluate(() => Object.getOwnPropertyNames(window).sort());
          const html = await page.content();
          // Test harness only: the remote handle carries the closure. Production
          // currently uses value serialization, so this is not capture wiring.
          const handle = await page.evaluateHandle(`(() => {
            const __name = fn => fn;
            const proof = (${createPrivacyFrameContinuityProof.toString()})();
            proof.begin(document, [document.querySelector('iframe')], performance.now() + 2);
            return proof;
          })()`);
          try {
            if (mode === "replacement") await page.evaluate(() => {const node = document.querySelector("iframe")!; node.replaceWith(node.cloneNode(true));});
            if (mode === "navigation") await page.evaluate(() => new Promise<void>(resolve => {
              const node = document.querySelector("iframe")!;
              node.onload = () => resolve(); node.srcdoc = "<p>second document</p>";
            }));
            if (mode === "removed") await page.evaluate(() => document.querySelector("iframe")!.remove());
            if (mode === "visibility") await page.evaluate(() => {document.querySelector("iframe")!.style.display = "block";});
            const result = await page.evaluate(({proof, cancel}) => cancel ? proof.cancel() : proof.finish(document,
              Array.from(document.querySelectorAll("iframe")), performance.now() + 2),
            {proof: handle as import("playwright").JSHandle<ReturnType<typeof createPrivacyFrameContinuityProof>>, cancel: mode === "cancel"});
            if (mode === "unchanged" || mode === "visibility") {
              assert.equal(result.status, "matched");
              assert.deepEqual(result.frames, [{slot: 0, node: "same", document: "same"}]);
            } else assert.equal(result.status, "limited");
            if (mode === "navigation") assert.ok(result.limitations.includes("document_changed"));
            if (mode === "replacement") assert.ok(result.limitations.includes("node_changed"));
            if (mode === "unchanged") {
              assert.deepEqual(await page.evaluate(() => Object.getOwnPropertyNames(window).sort()), globals);
              assert.equal(await page.content(), html);
            }
            assert.ok(Buffer.byteLength(JSON.stringify(result)) <= PRIVACY_CHOICE_DIAGNOSTIC_BYTES);
          } finally {await handle.dispose();}
        } finally {await page.close();}
      });
    }
    assert.equal(requests, 0, "No public-site or other network requests");
  } finally {await browser.close();}
});
