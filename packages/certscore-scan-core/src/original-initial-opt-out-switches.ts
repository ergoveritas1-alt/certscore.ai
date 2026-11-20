import {
  initialOptOutSwitchScope, originalInitialOptOutSwitchesSchema, verifiedInitialOptOutSwitch,
  type OriginalInitialOptOutSwitches,
} from "@certscore/contracts";
import type { Page } from "playwright";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";
import { sameDocumentCaptureBinding, type DocumentBoundCapture, type DocumentCaptureBinding } from "./document-bound-capture.js";

export async function retainOriginalInitialOptOutSwitches(input: {
  page: Page;
  text: DocumentBoundCapture<string>;
  scanStartedAtMs: number;
  budgetMs: number;
  signal?: AbortSignal;
  readBinding: () => DocumentCaptureBinding;
}): Promise<OriginalInitialOptOutSwitches | undefined> {
  const { text, budgetMs } = input;
  if (budgetMs <= 0 || input.signal?.aborted || text.documentIdentity?.source !== "cdp_loader_id" ||
      !sameDocumentCaptureBinding(text, input.readBinding())) return;
  // Modal text schedules one short observation on the open document. Only
  // the actual typed candidates and pointer hits can prove a switch was present.
  const hints = new Set(text.value.split("\n").map(initialOptOutSwitchScope));
  if (!hints.has("sale") || !hints.has("sharing")) return;
  const deadline = Date.now() + budgetMs;
  const geometry = await captureConsentControlGeometry(input.page, {
    documentIdentity: text.documentIdentity, timeoutMs: Math.max(1, deadline - Date.now()),
    avoidOverlappingFrameReads: true,
  }).catch(() => undefined);
  if (!geometry || !sameDocumentCaptureBinding(text, {url: geometry.pageUrl, documentIdentity: geometry.documentIdentity}) ||
      !sameDocumentCaptureBinding(text, input.readBinding()) || input.signal?.aborted || Date.now() > deadline) return;
  const rows = geometry.candidates.flatMap((candidate, ordinal) => {
    const proof = verifiedInitialOptOutSwitch(geometry, ordinal, text.url);
    const box = candidate.boundingBox;
    const label = proof && geometry.candidates.find(row => row.candidateId === proof.labelCandidateId)?.boundingBox;
    return proof && box && label ? [{
      scope: proof.scope, label: proof.label,
      switchCenter: [box.x + box.width / 2, box.y + box.height / 2],
      labelCenter: [label.x + label.width / 2, label.y + label.height / 2],
    }] : [];
  });
  const packet = originalInitialOptOutSwitchesSchema.safeParse({
    version: "original_initial_opt_out_switches.v1", documentUrl: text.url, documentToken: text.documentIdentity.token,
    observedAtMs: Date.parse(geometry.captureTiming?.mainFrameCompletedAt ?? geometry.capturedAt) - input.scanStartedAtMs,
    rows,
  });
  return packet.success ? packet.data : undefined;
}
