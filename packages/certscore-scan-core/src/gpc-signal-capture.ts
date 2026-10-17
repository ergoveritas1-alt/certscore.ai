import {PAIRED_RUNTIME_SETTLE_POLICY,PAIRED_RUNTIME_SETTLE_MAX_MS} from "./runtime-document-settle.js";
import { createHash } from "node:crypto";
import type { BrowserContext, Page, Worker } from "playwright";
import { gpcSignalObservationSchema, type GpcSignalObservation, type BrowserDocumentIdentity } from "@certscore/contracts";
import { chromiumContextOptions } from "./playwright-runtime.js";

export function gpcDocumentHash(value: string): string {
  const url = new URL(value);
  url.hash = "";
  // Hash the complete identity, including query; never retain sensitive values.
  return createHash("sha256").update(url.href).digest("hex");
}

export async function installGpcNavigatorSignal(context: BrowserContext, enabled: boolean) {
  // Both conditions support the same API; only the boolean preference differs.
  await context.addInitScript({ content: `(() => {
    try { Object.defineProperty(Navigator.prototype, "globalPrivacyControl", {
      configurable: false, get: () => ${JSON.stringify(enabled)}
    }); } catch {}
  })();` });
}

export function createGpcSignalCapture(input: {
  context: BrowserContext; page: Page; enabled: boolean; scanStartedAtMs: number;
  waitMode?: string; internalBudgetMs: number;
  prototypeBinding?: { captureId: string; documentIdentity: () => BrowserDocumentIdentity | undefined };
  impactReadback?: { documentIdentity: () => BrowserDocumentIdentity | undefined; bind: (token: string | undefined) => void };
}) {
  const workers = new Set<Worker>();
  const workerSamples: NonNullable<GpcSignalObservation["workerReadback"]>["samples"] = [];
  const observeWorker = (worker: Worker) => {
    if (workers.has(worker)) return;
    workers.add(worker);
    if (workerSamples.length >= 8) return;
    const row: (typeof workerSamples)[number] = { index: workers.size - 1, status: "pending", navigatorValue: null, capturedAtMs: null };
    workerSamples.push(row);
    // Read only, once, alongside existing browser work. Never inject a signal
    // into an already-running worker, await completion, or claim startup proof.
    void worker.evaluate(() => typeof (navigator as unknown as {globalPrivacyControl?: unknown}).globalPrivacyControl === "boolean"
      ? (navigator as unknown as {globalPrivacyControl: boolean}).globalPrivacyControl : null).then(value => {
        row.status = "observed"; row.navigatorValue = value;
        row.capturedAtMs = Math.max(0, Date.now() - input.scanStartedAtMs);
      }, () => { row.status = "unavailable"; });
  };
  input.page.on("worker", observeWorker);
  input.context.on("serviceworker", observeWorker);
  const contextConfigSha256 = createHash("sha256").update(JSON.stringify({
    pairedSettlePolicy:PAIRED_RUNTIME_SETTLE_POLICY,pairedSettleMaxMs:PAIRED_RUNTIME_SETTLE_MAX_MS,
    context: chromiumContextOptions(), waitMode: input.waitMode ?? "default", internalBudgetMs: input.internalBudgetMs,
  })).digest("hex");

  return {
    async snapshot(options?: { budgetMs: number }): Promise<GpcSignalObservation | undefined> {
      const before = input.prototypeBinding?.documentIdentity();
      const impactBefore = input.impactReadback?.documentIdentity();
      const frames = input.page.frames();
      type Sample = { documentUrlSha256: string; mainFrame: boolean; navigatorValue: boolean | null; timeOrigin: number };
      const samples: Array<Sample | null> = frames.slice(0, 32).map(() => null);
      let closed = false;
      const readbacks = Promise.all(frames.slice(0, 32).map(async (frame, index) => {
        try {
          const sample = await frame.evaluate(() => ({
            url: location.href, timeOrigin: performance.timeOrigin,
            value: typeof (navigator as Navigator & { globalPrivacyControl?: unknown }).globalPrivacyControl === "boolean"
              ? (navigator as Navigator & { globalPrivacyControl: boolean }).globalPrivacyControl : null,
          }));
          if (!closed) samples[index] = { documentUrlSha256: gpcDocumentHash(sample.url), mainFrame: frame === input.page.mainFrame(),
            navigatorValue: sample.value, timeOrigin: sample.timeOrigin };
        } catch { /* Retain other completed frames; this one remains unavailable. */ }
      }));
      // Finish inside the caller's existing readback allowance. A hanging child
      // cannot erase a completed main-frame read or mutate the frozen packet.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (options) await Promise.race([readbacks, new Promise<void>(resolve => {
          timer = setTimeout(resolve, Math.max(0, options.budgetMs - 50));
        })]);
        else await readbacks;
      } finally { closed = true; if (timer) clearTimeout(timer); }
      const main = samples.find((sample) => sample?.mainFrame);
      if (!main) return undefined;
      const limitationKeys: string[] = [];
      if (frames.length > 32 || samples.some((sample) => !sample)) limitationKeys.push("frame_signal_readback_incomplete");
      if (samples.some((sample) => sample && sample.navigatorValue !== input.enabled)) limitationKeys.push("navigator_signal_mismatch");
      // Window init scripts do not run in WorkerNavigator. Do not retrofit a
      // running worker and misrepresent that as preference delivery at startup.
      if (workers.size > 0) limitationKeys.push("worker_navigator_delivery_unverified");
      if (gpcDocumentHash(input.page.url()) !== main.documentUrlSha256) limitationKeys.push("document_changed_during_readback");
      const finalFrames = input.page.frames();
      const attached = finalFrames.some((frame) => !frames.includes(frame));
      const detached = frames.some((frame) => !finalFrames.includes(frame));
      const urlChanged = frames.some((frame, index) => finalFrames.includes(frame) &&
        samples[index] && gpcDocumentHash(frame.url()) !== samples[index]!.documentUrlSha256);
      if (attached || detached || urlChanged) {
        limitationKeys.push("frames_changed_during_readback");
        // Explain the failed inventory using existing reads only. These are
        // endpoint differences, not a complete frame-lifecycle event history.
        if (attached) limitationKeys.push("frame_attached_during_readback");
        if (detached) limitationKeys.push("frame_detached_during_readback");
        if (urlChanged) limitationKeys.push("frame_url_changed_during_readback");
      }
      const after = input.prototypeBinding?.documentIdentity();
      const impactAfter = input.impactReadback?.documentIdentity();
      input.impactReadback?.bind(impactBefore?.token && impactBefore.token === impactAfter?.token ? impactAfter.token : undefined);
      const bindingStable = before?.token && before.token === after?.token;
      if (input.prototypeBinding && !bindingStable) limitationKeys.push("prototype_document_identity_unverified");
      return gpcSignalObservationSchema.parse({
        contractVersion: "certscore.gpc-signal-observation.v1", expectedEnabled: input.enabled,
        documentUrlSha256: main.documentUrlSha256, contextConfigSha256,
        ...(input.prototypeBinding && bindingStable ? { prototypeCaptureBinding: {
          captureId: input.prototypeBinding.captureId, documentIdentitySource: after!.source, documentToken: after!.token,
        } } : {}),
        capturedAtMs: Math.max(0, Date.now() - input.scanStartedAtMs),
        documentStartedAtMs: Math.max(0, Math.round(main.timeOrigin - input.scanStartedAtMs)),
        frameCount: frames.length,
        frames: samples.flatMap((sample) => sample ? [{ documentUrlSha256: sample.documentUrlSha256,
          mainFrame: sample.mainFrame, navigatorValue: sample.navigatorValue }] : []),
        workerCount: workers.size, workerReadback: {
          policyVersion: "worker_navigator_readback.v1", scope: "observed_value_only_not_startup_delivery",
          observed: workers.size, samples: workerSamples.map(row => ({...row})), truncated: workers.size > 8,
        }, limitationKeys,
      });
    },
  };
}
