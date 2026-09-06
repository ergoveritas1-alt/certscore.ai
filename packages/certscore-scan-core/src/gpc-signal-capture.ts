import { createHash } from "node:crypto";
import type { BrowserContext, Page, Worker } from "playwright";
import { gpcSignalObservationSchema, type GpcSignalObservation } from "@certscore/contracts";
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
}) {
  const workers = new Set<Worker>();
  input.page.on("worker", (worker) => workers.add(worker));
  input.context.on("serviceworker", (worker) => workers.add(worker));
  const contextConfigSha256 = createHash("sha256").update(JSON.stringify({
    context: chromiumContextOptions(), waitMode: input.waitMode ?? "default", internalBudgetMs: input.internalBudgetMs,
  })).digest("hex");

  return {
    async snapshot(): Promise<GpcSignalObservation | undefined> {
      const frames = input.page.frames();
      const samples = await Promise.all(frames.slice(0, 32).map(async (frame) => {
        try {
          const sample = await frame.evaluate(() => ({
            url: location.href, timeOrigin: performance.timeOrigin,
            value: typeof (navigator as Navigator & { globalPrivacyControl?: unknown }).globalPrivacyControl === "boolean"
              ? (navigator as Navigator & { globalPrivacyControl: boolean }).globalPrivacyControl : null,
          }));
          return { documentUrlSha256: gpcDocumentHash(sample.url), mainFrame: frame === input.page.mainFrame(),
            navigatorValue: sample.value, timeOrigin: sample.timeOrigin };
        } catch { return null; }
      }));
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
      if (finalFrames.length !== frames.length || frames.some((frame, index) =>
        !finalFrames.includes(frame) || (samples[index] && gpcDocumentHash(frame.url()) !== samples[index]!.documentUrlSha256))) {
        limitationKeys.push("frames_changed_during_readback");
      }
      return gpcSignalObservationSchema.parse({
        contractVersion: "certscore.gpc-signal-observation.v1", expectedEnabled: input.enabled,
        documentUrlSha256: main.documentUrlSha256, contextConfigSha256,
        capturedAtMs: Math.max(0, Date.now() - input.scanStartedAtMs),
        documentStartedAtMs: Math.max(0, Math.round(main.timeOrigin - input.scanStartedAtMs)),
        frameCount: frames.length,
        frames: samples.flatMap((sample) => sample ? [{ documentUrlSha256: sample.documentUrlSha256,
          mainFrame: sample.mainFrame, navigatorValue: sample.navigatorValue }] : []),
        workerCount: workers.size, limitationKeys,
      });
    },
  };
}
