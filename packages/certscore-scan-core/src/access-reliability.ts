import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import type { CDPSession, Frame, Page } from "playwright";

/** Diagnostics only: never upgrades access, findings, scoring or GPC completion. */
export function describeAccessReliability(bundle: CanonicalEvidenceBundle | null) {
  const lane = bundle?.scanLaneRuns.find(l => l.laneId === "gpc_observation") ?? bundle?.scanLaneRuns.find(l => l.laneId === "runtime_evidence");
  const module = bundle?.modulesRun.find(m => m.moduleName === "preConsentRuntimeScanner");
  const errors = (module?.errors ?? []).join("\n");
  const reasons = bundle?.scanNoGoAssessment?.reasonCodes ?? [];
  const signals = bundle?.scanNoGoAssessment?.supportingSignals;
  const positiveAccess = Boolean(bundle && lane?.accessOutcome === "representative_page" &&
    bundle.runtimeCoverage?.coverageStatus === "usable" && bundle.scanNoGoAssessment?.decision !== "no_go" &&
    bundle.scanEvidenceLaneAssessment?.outcome !== "no_go");
  const contradictoryAccessLabels = Boolean(lane?.accessOutcome === "representative_page" &&
    (bundle?.runtimeCoverage?.coverageStatus === "limited_none" || bundle?.scanNoGoAssessment?.decision === "no_go"));
  const reason = !bundle ? "source_unverified" : positiveAccess ? "representative_page" :
    /renderer crash/i.test(errors) ? "renderer_crash" :
    /interrupted by another navigation to ["']about:blank|Navigation to ["']about:blank["'] is interrupted by another navigation to ["']chrome-error:\/\/chromewebdata\//.test(errors) ? "navigation_reset_interruption" :
    /ERR_BLOCKED_BY_CLIENT/.test(errors) ? "client_or_safety_block" :
    /ERR_NETWORK_CHANGED/.test(errors) ? "network_changed" :
    /ERR_HTTP2_PROTOCOL_ERROR/.test(errors) ? "http2_transport_failure" :
    /ERR_(NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED)/.test(errors) ? "dns_failure" :
    /ERR_(CERT_|SSL_)/.test(errors) ? "tls_failure" :
    /ERR_EMPTY_RESPONSE/.test(errors) ? "empty_transport_response" :
    /Download is starting/.test(errors) ? "download_target" :
    /module budget|Timeout|ERR_TIMED_OUT/i.test(errors) ? "navigation_or_capture_deadline" :
    lane?.accessOutcome === "bot_challenge" || signals?.challengeSignalsDetected === true ? "bot_challenge" :
    lane?.accessOutcome === "access_denied" || signals?.documentStatusBlocked === true ? "http_access_denied" :
    reasons.includes("navigation_transport_failure") || lane?.accessOutcome === "navigation_failed" ? "navigation_failure" :
    lane?.accessOutcome === "blank_or_unusable" || reasons.includes("loading_or_stalled") ? "blank_or_stalled" : "unresolved_access";
  return { contractVersion: "certscore.access-reliability-diagnostic.v1" as const,
    mode: "internal_only" as const, productionProjectable: false as const, scoreEffect: "none" as const,
    positiveAccess, contradictoryAccessLabels, reason,
    laneOutcome: lane?.accessOutcome ?? "unknown", canonicalNoGo: bundle?.scanNoGoAssessment?.decision === "no_go",
    navigationAttempts: lane?.navigationCount ?? module?.recoveryDiagnostics?.attempts?.length ?? 0,
    semanticStatus: bundle?.gpcObservationSession?.semanticObservation?.gppStatus ?? "missing",
    semanticDiagnosticCodes: bundle?.gpcObservationSession?.semanticObservation?.gppDiagnostics?.diagnosticCodes ?? [],
    requestGaps: bundle?.gpcObservationSession?.requests.filter(r => r.secGpc !== "1" && !r.preTransmissionBlock).length ?? null,
  };
}

/** Leave capture time inside the existing module budget. Never start an
 * alternate navigation after cancellation or with a fabricated 1s minimum. */
export function recoveryNavigationTimeout(remainingMs: number, configuredMaxMs: number): number {
  return Math.max(0, Math.min(configuredMaxMs, Math.floor(remainingMs) - 1000));
}

/** Commit and readiness share one navigation allowance, rather than each
 * receiving a full timeout. Zero means capture now, not an unbounded wait. */
export function passiveReadinessTimeout(navigationAllowanceMs: number, navigationElapsedMs: number, remainingModuleMs: number): number {
  if (![navigationAllowanceMs, navigationElapsedMs, remainingModuleMs].every(Number.isFinite)) return 0;
  return Math.max(0, Math.floor(Math.min(
    navigationAllowanceMs - Math.max(0, navigationElapsedMs), remainingModuleMs - 1000,
  )));
}

export async function resetForNavigationRecovery(page: Pick<Page, "goto" | "context" | "on" | "off" | "mainFrame">, remainingMs: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const timeout = recoveryNavigationTimeout(remainingMs, 1000);
  if (timeout <= 0) throw Error("Navigation budget exhausted before reset.");
  const deadline = Date.now() + timeout;
  let ended = false;
  const detachedSessions = new WeakSet<CDPSession>();
  let session: CDPSession | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const detach = () => {
    if (!session || detachedSessions.has(session)) return;
    detachedSessions.add(session);
    void session.detach().catch(() => {});
  };
  const checkActive = () => {
    signal?.throwIfAborted();
    if (ended || Date.now() >= deadline) throw Error("Navigation recovery reset deadline exceeded.");
  };
  const interrupted = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Error("Navigation recovery reset deadline exceeded.")), timeout);
    onAbort = () => reject(signal?.reason ?? Error("Navigation recovery cancelled."));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  let errorCommitted!: () => void;
  const errorDocument = new Promise<void>(resolve => { errorCommitted = resolve; });
  const onNavigated = (frame: Frame) => {
    if (frame === page.mainFrame() && frame.url() === "chrome-error://chromewebdata/") errorCommitted();
  };
  page.on("framenavigated", onNavigated);
  const reset = async () => {
    try {
      session = await page.context().newCDPSession(page as Page);
      checkActive();
      // Stop the failed navigation before resetting. Otherwise Chromium's late
      // error-page commit can interrupt about:blank and kill transport recovery.
      try {
        await session.send("Page.stopLoading");
      } catch (error) {
        // Chromium briefly has no active page while committing a failed TLS/
        // transport navigation. Await that exact error-document event, then
        // stop once on the active page, inside the same reset allowance.
        if (!(error instanceof Error) || !error.message.includes("Protocol error (Page.stopLoading): Not attached to an active page")) throw error;
        if (page.mainFrame().url() !== "chrome-error://chromewebdata/") {
          await Promise.race([errorDocument, interrupted]);
        }
        checkActive();
        // An error-document commit can replace the renderer target while this
        // CDP session remains bound to the inactive page. Rebind the existing
        // single stop retry; do not retry against that stale session.
        detach();
        session = undefined;
        session = await page.context().newCDPSession(page as Page);
        checkActive();
        await session.send("Page.stopLoading");
      }
      checkActive();
      const navigationTimeoutMs = deadline - Date.now();
      if (navigationTimeoutMs <= 0) throw Error("Navigation recovery reset deadline exceeded.");
      const response = await page.goto("about:blank", { waitUntil: "commit", timeout: navigationTimeoutMs });
      checkActive();
      return response;
    } finally {
      detach();
    }
  };
  try {
    return await Promise.race([reset(), interrupted]);
  } finally {
    ended = true;
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    page.off("framenavigated", onNavigated);
    detach();
  }
}
