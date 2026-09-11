/** Playwright 1.58.2 Chromium forwards loadingFailed.errorText || blockedReason
 * to the same public Request.failure() object. Only these two fixed reasons
 * establish a pre-transmission enforcement block; generic network errors do not. */
export function verifiedGpcPreTransmissionBlock(input: {
  failureText: string | undefined; secGpc: string | null;
  timing: { startTime: number; requestStart: number; responseStart: number };
  responseReceived: boolean; serviceWorker: boolean; mainFrame: boolean;
  requestLoader: string | undefined; committedLoader: string | undefined;
}): "csp" | "mixed-content" | null {
  return (input.failureText === "csp" || input.failureText === "mixed-content") && input.secGpc === null &&
    input.timing.startTime === 0 && input.timing.requestStart === -1 && input.timing.responseStart === -1 &&
    !input.responseReceived && !input.serviceWorker && input.mainFrame && Boolean(input.committedLoader) &&
    input.requestLoader === input.committedLoader ? input.failureText : null;
}
