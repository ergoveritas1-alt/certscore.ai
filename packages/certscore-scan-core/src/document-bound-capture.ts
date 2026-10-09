import type { BrowserDocumentIdentity } from "@certscore/contracts";

export type DocumentCaptureBinding = {
  url: string;
  documentIdentity?: BrowserDocumentIdentity;
};
export type DocumentBoundCapture<T> = DocumentCaptureBinding & {
  value: T;
  capturedAtMs: number;
};

export function sameDocumentCaptureBinding(left: DocumentCaptureBinding, right: DocumentCaptureBinding): boolean {
  return Boolean(left.url === right.url && left.documentIdentity?.token &&
    left.documentIdentity.source === right.documentIdentity?.source &&
    left.documentIdentity.token === right.documentIdentity.token);
}

/** Bind an existing read at completion, never when its result is later awaited.
 * readBinding reads cached browser metadata only; this adds no browser work. */
export async function captureDocumentBoundValue<T>(input: {
  capture: () => Promise<T>;
  readBinding: () => DocumentCaptureBinding;
  scanStartedAtMs: number;
  now?: () => number;
}): Promise<DocumentBoundCapture<T>> {
  const binding = input.readBinding();
  const before = { ...binding, documentIdentity: binding.documentIdentity ? { ...binding.documentIdentity } : undefined };
  const value = await input.capture();
  const after = input.readBinding();
  const stable = sameDocumentCaptureBinding(before, after);
  return {
    value,
    url: before.url,
    ...(stable ? { documentIdentity: { ...after.documentIdentity! } } : {}),
    capturedAtMs: Math.max(0, (input.now ?? Date.now)() - input.scanStartedAtMs),
  };
}
