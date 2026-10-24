import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { privacyChoiceInspectionSchema, privacyChoiceDiagnosticsSchema, privacyFrameCheckpointIdentitySchema } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer";
import { capturePassivePrivacyChoiceDiagnostic } from "./scanners/policy-surface-scanner";
import { buildPrivacyChoiceDiagnostics, createPrivacyChoiceDomDiagnostics } from "./privacy-choice-diagnostics";
import { createPrivacyFrameContinuityProof } from "./privacy-frame-continuity";

const modes = ["same", "two-hidden", "ancestor-hidden", "mixed", "replace", "navigate", "second-failure", "serialize-failure", "abort-handle", "abort", "timeout", "overflow"] as const;
for (const mode of modes) test(`frame integration: ${mode}`, {timeout: 15_000}, async () => {
  const qualifies = mode === "same" || mode === "two-hidden";
  const hiddenCount = mode === "overflow" ? 5 : mode === "two-hidden" ? 2 : 1;
  const frames = mode === "ancestor-hidden" ? '<div style="display:none"><iframe srcdoc="<p>frame</p>"></iframe></div>' :
    Array(hiddenCount).fill('<iframe style="display:none" srcdoc="<p>frame</p>"></iframe>').join('') +
    (mode === "mixed" ? '<iframe srcdoc="<p>visible frame</p>"></iframe>' : '');
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<html lang="en"><body><main>${"Local restaurant menus, reservations and opening hours. ".repeat(50)}</main><footer><a href="/privacy">Privacy Policy</a></footer>${frames}</body></html>`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const root = await mkdtemp(path.join(tmpdir(), "certscore-frame-integration-"));
  const browser = await chromium.launch({headless: true});
  const controller = new AbortController();
  const counts = {handles: 0, serializations: 0, second: 0, disposed: 0, contextClosed: 0, externalRequests: 0};
  let release!: () => void;
  const stalled = new Promise<void>(resolve => {release = resolve;});
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await newContext(...args);
    context.on("close", () => counts.contextClosed++);
    await context.route("**/*", async route => {
      if (new URL(route.request().url()).origin !== new URL(url).origin) {counts.externalRequests++; await route.abort();}
      else await route.fallback();
    });
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage(), evaluate = page.evaluate.bind(page), evaluateHandle = page.evaluateHandle.bind(page);
      page.evaluateHandle = (async (fn: unknown, arg: unknown) => {
        counts.handles++;
        const handle = await evaluateHandle(fn as never, arg as never), dispose = handle.dispose.bind(handle);
        handle.dispose = async () => {counts.disposed++; await dispose();};
        if (mode === "abort-handle") controller.abort();
        return handle;
      }) as typeof page.evaluateHandle;
      page.evaluate = (async (fn: unknown, arg: unknown) => {
        if (String(fn).includes("held.data")) {
          counts.serializations++;
          if (mode === "serialize-failure") throw new Error("fixture serialization failure");
          const data = await evaluate(fn as never, arg as never);
          assert.ok(!JSON.stringify(data).includes('"proof"'), "Remote references never enter the serialized packet");
          return data;
        }
        if (String(fn).includes("regionHtml")) {
          counts.second++;
          if (mode === "second-failure") throw new Error("fixture second checkpoint failure");
          if (mode === "abort") {controller.abort(); throw new Error("fixture abort");}
          if (mode === "timeout") {await stalled; throw new Error("fixture late completion");}
          // Fixture-only mutations; scanner never performs these actions.
          if (mode === "replace") await evaluate(() => {const node = document.querySelector("iframe")!; node.replaceWith(node.cloneNode(true));});
          if (mode === "navigate") await evaluate(() => new Promise<void>(resolve => {
            const node = document.querySelector("iframe")!;
            node.onload = () => resolve(); node.srcdoc = "<p>replacement document</p>";
          }));
        }
        return evaluate(fn as never, arg as never);
      }) as typeof page.evaluate;
      return page;
    };
    return context;
  };
  try {
    const start = Date.now();
    const result = await capturePassivePrivacyChoiceDiagnostic({url, normalizedUrl: url, scanStartedAtMs: start,
      internalBudgetMs: 3500, absoluteDeadlineAtMs: start + 3500, discoveryMode: "fast", browser,
      signal: controller.signal, artifactWriter: await createArtifactWriter(root), enableNanoPolicyAssist: false,
      nanoAssistProvider: {async classifyLinks() {throw new Error("No model calls authorized");}}});
    assert.equal(counts.handles, 1); assert.equal(counts.serializations, mode === "abort-handle" ? 0 : 1);
    assert.equal(counts.second, mode === "serialize-failure" || mode === "abort-handle" ? 0 : 1);
    assert.equal(counts.disposed, 1); assert.equal(counts.externalRequests, 0);
    const inspection = result.privacyChoiceInspection;
    if (mode === "serialize-failure" || mode === "abort-handle") assert.equal(inspection, undefined);
    else {
      assert.ok(inspection); assert.ok(privacyChoiceInspectionSchema.safeParse(inspection).success);
      assert.equal(inspection.coverage, qualifies ? "complete" : "limited", "Only the approved self-hidden rule may complete visible-link coverage");
      assert.equal(inspection.uninspectedFrameCount, hiddenCount);
      assert.equal(inspection.contractVersion, qualifies ? "certscore.privacy-choice-inspection.v6" : "certscore.privacy-choice-inspection.v5");
      if (inspection.contractVersion !== "certscore.privacy-choice-inspection.v5" && inspection.contractVersion !== "certscore.privacy-choice-inspection.v6") throw new Error("Expected versioned frame proof");
      if (inspection.contractVersion === "certscore.privacy-choice-inspection.v6") {
        assert.equal(inspection.hiddenUninspectedFrameCount, hiddenCount);
        assert.deepEqual(inspection.frameExclusion.frameSlots, Array.from({length: hiddenCount}, (_, index) => index));
        assert.equal(inspection.frameExclusion.blockingFrameCount, 0);
      }
      const diagnostics = inspection.diagnostics;
      assert.ok(diagnostics); assert.equal(diagnostics.inspectionSourceHash, inspection.sourceHash);
      assert.ok(Buffer.byteLength(JSON.stringify(diagnostics)) <= 4096);
      if (["second-failure", "abort", "timeout"].includes(mode)) {
        assert.equal(diagnostics.checkpointIdentity, undefined);
        assert.equal(diagnostics.secondDocumentHash, null);
        assert.ok(diagnostics.limitations.includes("second_checkpoint_unavailable"));
        assert.equal(inspection.documentStable, false);
      } else {
        const identity = diagnostics.checkpointIdentity;
        assert.ok(identity, JSON.stringify(diagnostics));
        assert.ok(privacyFrameCheckpointIdentitySchema.safeParse(identity).success);
        if (qualifies) assert.equal(identity.status, "matched");
        if (mode === "replace") assert.ok(identity.limitations.includes("node_changed"));
        if (mode === "navigate") assert.ok(identity.limitations.includes("document_changed"));
        if (mode === "overflow") assert.ok(identity.limitations.includes("frame_limit"));
      }
    }
    assert.ok(Date.now() - start < 4500, "No additional deadline or tail wait");
    const frozen = JSON.stringify(result);
    release();
    // Allow fixture-only pending cleanup to settle; not a scanner wait.
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(JSON.stringify(result), frozen, "Late work cannot mutate terminal evidence");
    assert.equal(counts.contextClosed, 1);
  } finally {
    release(); await browser.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, {recursive: true, force: true});
  }
});

test("retained identity contract rejects contradictory proof and unbound second checkpoints", () => {
  const proof = {version: "privacy_frame_checkpoint_identity.v1", scope: "sampled_frame_checkpoint_identity_only",
    identityBasis: "dom_reference_equality", status: "matched", parentDocument: "same",
    frames: [{slot: 0, node: "same", document: "same"}], limitations: []};
  assert.ok(privacyFrameCheckpointIdentitySchema.safeParse(proof).success);
  for (const patch of [{frames: []}, {parentDocument: "different"}, {frames: [{slot: 0, node: "different", document: "same"}]},
    {frames: [{slot: 1, node: "same", document: "same"}]}, {status: "limited"}])
    assert.equal(privacyFrameCheckpointIdentitySchema.safeParse({...proof, ...patch}).success, false);
  const first = {document: "parent", frames: [], unnamedControls: [], limitations: []};
  const diagnostic = buildPrivacyChoiceDiagnostics(first, undefined, "a".repeat(64))!;
  assert.equal(privacyChoiceDiagnosticsSchema.safeParse({...diagnostic, checkpointIdentity: proof}).success, false);
});

test("identity consumes the existing diagnostic remainder rather than another two milliseconds", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.abort());
    await page.setContent('<button></button><iframe style="display:none" srcdoc="<p>fixture</p>"></iframe>');
    const result = await page.evaluate(`(() => {
      const __name = fn => fn;
      let clock = 0, childReads = 0;
      Object.defineProperty(performance, 'now', {value: () => clock});
      const button = document.querySelector('button'), frame = document.querySelector('iframe');
      const getAttribute = button.getAttribute.bind(button);
      button.getAttribute = name => {if(name === 'role') clock += 1.5; return getAttribute(name);};
      const child = frame.contentDocument;
      Object.defineProperty(frame, 'contentDocument', {get() {childReads++; clock += 0.6; return child;}});
      const proof = (${createPrivacyFrameContinuityProof.toString()})();
      const first = (${createPrivacyChoiceDomDiagnostics.toString()})(proof, 'first');
      first.unnamed(button, Array(6).fill(['text', '']), 'main', 20);
      first.frame(frame, 0, 20);
      first.result();
      const firstReads = childReads;
      const second = (${createPrivacyChoiceDomDiagnostics.toString()})(proof, 'second');
      second.frame(frame, 0, 20);
      return {firstReads, result: second.result()};
    })()`);
    assert.equal(result.firstReads, 1, "No identity read after the original diagnostic work consumed its allowance");
    assert.equal(result.result.checkpointIdentity.status, "limited");
    assert.ok(result.result.checkpointIdentity.limitations.includes("time_limit"));
    assert.ok(result.result.limitations.includes("diagnostic_time_limit"));
  } finally {await browser.close();}
});

test("identity shares the existing encoded diagnostic cap and is dropped explicitly when frame rows are evicted", () => {
  const frame = {locator: "frame", locatorLimited: false, frameDocument: "child", reason: "visibility_collapse", depth: 16};
  const first = {document: "parent", frames: Array.from({length: 4}, (_, i) => ({...frame, locator: `frame${i}`})),
    unnamedControls: Array.from({length: 8}, (_, i) => ({locator: `button${i}`, locatorLimited: false, scope: "main" as const,
      tag: "button", role: "button", nameStates: [0,0,0,0,0,0], labelledByTruncated: false})), limitations: []};
  const checkpointIdentity = {version: "privacy_frame_checkpoint_identity.v1" as const, scope: "sampled_frame_checkpoint_identity_only" as const,
    identityBasis: "dom_reference_equality" as const, status: "matched" as const, parentDocument: "same" as const,
    frames: Array.from({length: 4}, (_, slot) => ({slot, node: "same" as const, document: "same" as const})), limitations: []};
  const result = buildPrivacyChoiceDiagnostics(first, {...first, checkpointIdentity}, "a".repeat(64))!;
  assert.ok(result); assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 4096);
  assert.ok(result.limitations.includes("byte_limit"));
  if (result.frames.length < 4) assert.equal(result.checkpointIdentity, undefined);
});
