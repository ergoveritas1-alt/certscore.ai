import type { AfterActionWriteDiagnostics } from "@certscore/contracts";
import type { WriteProbeMetadata } from "./action-main-document-write-coverage.js";

/** Reuses the existing terminal write read. Never establishes absence, active
 * use, exact write identity/value, semantic registration or score eligibility. */
export function afterActionWriteDiagnostics(input: {
  metadata?: WriteProbeMetadata; targetUrl: string; actionAtEpochMs: number;
  observed: number; retained: number; nonEssentialObserved: number; nonEssentialRetained: number; unclassified: number;
}): AfterActionWriteDiagnostics {
  const candidate = input.metadata;
  const valid = candidate && [candidate.observedLifetimeCount,candidate.ringEvictedCount,candidate.readbackOmittedCount]
    .every(v => Number.isSafeInteger(v) && v >= 0) && candidate.ringEvictedCount + candidate.readbackOmittedCount + input.observed <= candidate.observedLifetimeCount &&
    typeof candidate.cookieHookHealthy === "boolean" && typeof candidate.storageHookHealthy === "boolean" &&
    Number.isFinite(candidate.documentTimeOriginMs) && candidate.documentTimeOriginMs >= 0;
  let m = valid ? candidate : undefined, documentMatches = false;
  try {
    if (m) {
      const document = new URL(m.documentUrl), target = new URL(input.targetUrl); document.hash = ""; target.hash = "";
      documentMatches = document.href === target.href && m.documentTimeOriginMs <= input.actionAtEpochMs;
    }
  } catch { m = undefined; }
  return {policyVersion:"after_action_write_diagnostics.v1",scope:"main_document_setter_hooks",diagnosticOnly:true,
    probeAvailable:!!m,documentMatches,cookieHookHealthy:m?.cookieHookHealthy??false,storageHookHealthy:m?.storageHookHealthy??false,
    observedLifetimeCount:m?.observedLifetimeCount??null,ringEvictedCount:m?.ringEvictedCount??null,readbackOmittedCount:m?.readbackOmittedCount??null,
    windowRecordsObserved:input.observed,windowRecordsRetained:input.retained,nonEssentialRecordsObserved:input.nonEssentialObserved,
    nonEssentialRecordsRetained:input.nonEssentialRetained,unclassifiedRecordsObserved:input.unclassified};
}
