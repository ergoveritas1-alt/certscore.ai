import { createHash } from "node:crypto";
import { setTimeout, clearTimeout } from "node:timers";
import { writeFile, unlink } from "node:fs/promises";
import { RUNTIME_VIEWPORT_ID, runtimeViewportCandidate, type DomSnapshotArtifact, type ScreenshotArtifact } from "@certscore/contracts";
import type { CDPSession } from "playwright";
import { sameDocumentCaptureBinding, type DocumentCaptureBinding } from "./document-bound-capture";

export async function captureRuntimeViewport(input: {
  snapshot: DomSnapshotArtifact;
  targetUrl: string;
  binding: DocumentCaptureBinding;
  readBinding: () => DocumentCaptureBinding;
  remainingMs: number;
  signal?: AbortSignal;
  scanStartedAtMs: number;
  session: Pick<CDPSession, "send">;
  path: string;
}) {
  const { snapshot, binding } = input;
  const deadline = Date.now() + input.remainingMs;
  const active = () => !input.signal?.aborted && Date.now() < deadline;
  if (!active() || !runtimeViewportCandidate(snapshot, input.targetUrl) || snapshot.url !== binding.url ||
      snapshot.documentIdentity?.token !== binding.documentIdentity?.token ||
      !sameDocumentCaptureBinding(binding, input.readBinding())) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // The raced operation only computes in memory. A late CDP/decode result cannot publish a file.
    const result = await Promise.race([
      (async () => {
        const { data } = await input.session.send("Page.captureScreenshot", {
          format: "jpeg", quality: 75, captureBeyondViewport: false, fromSurface: true,
        });
        const capturedAtMs = Date.now() - input.scanStartedAtMs;
        if (!active() || !sameDocumentCaptureBinding(binding, input.readBinding()) ||
            data.length > 4 * Math.ceil(524288 / 3)) return;
        const bytes = Buffer.from(data, "base64");
        if (bytes.length > 524288 || bytes.length < 30_000) return;
        const sharp = (await import("sharp")).default;
        if (!active()) return;
        const img = sharp(bytes, { limitInputPixels: 4_000_000 });
        const { width, height, format } = await img.metadata();
        if (format !== "jpeg" || !width || !height || width < 640 || height < 400 ||
            bytes.length / (width * height) < 0.045) return;
        // Decode the viewport too. File size alone can mistake a padded blank image for content.
        const sample = await img.flatten({ background: "white" }).resize(96, 64).greyscale().raw().toBuffer();
        let edges = 0;
        for (let i = 0; i < sample.length; i++) {
          if ((i % 96 && Math.abs(sample[i]! - sample[i - 1]!) >= 12) ||
              (i >= 96 && Math.abs(sample[i]! - sample[i - 96]!) >= 12)) edges++;
        }
        return edges >= sample.length * 0.04 ? { bytes, capturedAtMs } : undefined;
      })(),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), input.remainingMs); }),
    ]);
    if (!result || !active() || !sameDocumentCaptureBinding(binding, input.readBinding())) return;
    const shot: ScreenshotArtifact = {
      artifactId: RUNTIME_VIEWPORT_ID, path: input.path, captureMethod: "primary_viewport_fallback",
      url: snapshot.url, documentIdentity: snapshot.documentIdentity, capturedAtMs: result.capturedAtMs,
      pagePhase: snapshot.pagePhase, consentStateAtTime: "pre_consent",
    };
    try {
      await writeFile(input.path, result.bytes);
      if (!active()) { await unlink(input.path); return; }
    } catch { await unlink(input.path).catch(() => undefined); return; }
    return { shot, viewport: { sha256: createHash("sha256").update(result.bytes).digest("hex"), sizeBytes: result.bytes.length } };
  } catch { return; } finally { if (timer) clearTimeout(timer); }
}
