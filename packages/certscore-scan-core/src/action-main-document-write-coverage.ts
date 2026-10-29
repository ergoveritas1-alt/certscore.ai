import { cmpPassiveReadToken, recordCmpPassiveRead } from "./cmp-passive-diagnostics.js";
import { createHash } from "node:crypto";
import type { Page } from "playwright";
import type { ActionMainDocumentWriteCoverage } from "@certscore/contracts";

export type WriteProbeMetadata = {
  observedLifetimeCount: number; ringEvictedCount: number; readbackOmittedCount: number;
  cookieHookHealthy: boolean; storageHookHealthy: boolean; documentUrl: string; documentTimeOriginMs: number; hookInstalledAtMs?: number;
};
/** Replaces the existing terminal write read; adds no browser round trip. */
export async function readActionWriteCapture<T>(page: Page, readerName: string): Promise<{ writes: T[]; metadata?: WriteProbeMetadata }> {
  const token = cmpPassiveReadToken(page);
  const result = await page.evaluate((name) => {
    const reader = (window as unknown as Record<string, unknown>)[name] as
      ((() => unknown[]) & { coverage?: () => WriteProbeMetadata }) | undefined;
    if (typeof reader !== "function") return { writes: [] };
    const writes = reader();
    let passive:unknown;try { passive=(window as unknown as {__certscoreReadCmpPassiveEvents?:()=>unknown}).__certscoreReadCmpPassiveEvents?.(); } catch { /* Preserve the independent writes. */ }
    // Optional diagnostics must never discard independently retained write evidence.
    try { return { writes, passive, ...(reader.coverage ? { metadata: reader.coverage() } : {}) }; }
    catch { return { writes }; }
  }, readerName).catch(() => ({ writes: [] })) as { writes: T[]; metadata?: WriteProbeMetadata; passive?:unknown };
  recordCmpPassiveRead(token,result.passive);
  return {writes:result.writes,...(result.metadata?{metadata:result.metadata}:{})};
}
export function buildActionWriteCoverage(input: {
  metadata?: WriteProbeMetadata; targetUrl: string; windowStartedAtMs: number; windowEndedAtMs: number;
  windowCompleted: boolean; retainedWindowCount: number; eligibleWindowCount: number;
  retainedEligibleCount: number; deduplicatedEligibleCount?: number; unresolvedWindowCount: number;
}): ActionMainDocumentWriteCoverage {
  const candidate = input.metadata;
  const validMetadata = candidate && [candidate.observedLifetimeCount, candidate.ringEvictedCount, candidate.readbackOmittedCount]
    .every(value => Number.isSafeInteger(value) && value >= 0) &&
    Number.isFinite(candidate.documentTimeOriginMs) && candidate.documentTimeOriginMs >= 0 &&
    typeof candidate.cookieHookHealthy === "boolean" && typeof candidate.storageHookHealthy === "boolean" &&
    candidate.ringEvictedCount + candidate.readbackOmittedCount + input.retainedWindowCount <= candidate.observedLifetimeCount;
  let m = validMetadata ? candidate : undefined;
  let documentUrl: URL | undefined;
  try { if (m) { documentUrl = new URL(m.documentUrl); documentUrl.hash = ""; } }
  catch { m = undefined; }

  const target = new URL(input.targetUrl); target.hash = "";
  const normalizedTarget = target.href;

  const documentMatches = !!m && documentUrl?.href === normalizedTarget &&
    Number.isFinite(m.documentTimeOriginMs) && m.documentTimeOriginMs <= input.windowStartedAtMs;
  const deduplicatedEligibleCount = input.deduplicatedEligibleCount ?? 0;
  const finalCapOmittedCount = Math.max(0, input.eligibleWindowCount - input.retainedEligibleCount - deduplicatedEligibleCount);
  const complete = !!m && m.cookieHookHealthy && m.storageHookHealthy && documentMatches && input.windowCompleted &&
    m.ringEvictedCount === 0 && m.readbackOmittedCount === 0 && finalCapOmittedCount === 0 && deduplicatedEligibleCount === 0 && input.unresolvedWindowCount === 0 &&
    input.retainedWindowCount <= m.observedLifetimeCount && input.eligibleWindowCount <= input.retainedWindowCount;
  return { policyVersion: "action_main_document_write_coverage.v1", scope: "main_document_setter_hooks",
    status: complete ? "complete_within_scope" : "limited", targetUrlSha256: createHash("sha256").update(normalizedTarget).digest("hex"),
    documentTimeOriginMs: m?.documentTimeOriginMs ?? null,
    windowStartedAtMs: input.windowStartedAtMs, windowEndedAtMs: input.windowEndedAtMs,
    probeAvailable: !!m, cookieHookHealthy: m?.cookieHookHealthy ?? false, storageHookHealthy: m?.storageHookHealthy ?? false,
    documentMatches, windowCompleted: input.windowCompleted,
    observedLifetimeCount: m?.observedLifetimeCount ?? 0, ringEvictedCount: m?.ringEvictedCount ?? 0,
    readbackOmittedCount: m?.readbackOmittedCount ?? 0, retainedWindowCount: input.retainedWindowCount,
    eligibleWindowCount: input.eligibleWindowCount, retainedEligibleCount: input.retainedEligibleCount,
    finalCapOmittedCount, deduplicatedEligibleCount, unresolvedWindowCount: input.unresolvedWindowCount };
}
