"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { getScanTargetType, type ScanSource, pushDataLayerEventBeforeNavigation } from "../../lib/analytics/data-layer";
import { ScanFromSelect, type ScanFrom, type ServerScanFrom } from "../scans/scan-from-select";
import {
  ScanSubmitProgressBar,
  normalizeLocalV2ScanProfile,
  useScanProgressClock,
  type LocalV2ScanProfile
} from "../scans/scan-submit-progress";

type DomainScanFormProps = {
  allowLocalExtensionScan?: boolean;
  buttonLabel?: string;
  compact?: boolean;
  defaultScanFrom?: ServerScanFrom;
  helperText?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  emptySubmitDomain?: string;
  mode?: "full" | "preview";
  sampleDomains?: string[];
  scanSource?: ScanSource;
};

type ScanMode = NonNullable<DomainScanFormProps["mode"]>;

type ScanSubmitPayload = {
  code?: string | null;
  error?: string | null;
  previewUrl?: string | null;
  reusedExistingScan?: boolean | null;
  scanId?: string | null;
  scanUrl?: string | null;
};

type ScanSubmitFailure = {
  code?: string | null;
  destination?: string | null;
  domain: string;
  error?: string | null;
  mode: ScanMode;
  stage: "api_rejected" | "missing_destination" | "request_failed";
  status?: number | null;
};

const GENERIC_SCAN_ERROR_MESSAGES: Record<ScanMode, string> = {
  full: "The full scan could not be started. Please try again.",
  preview: "The preview scan could not be started. Please try again."
};

const FULL_SCAN_ERROR_MESSAGES: Record<string, string> = {
  active_scan_exists: "A scan is already queued or running for this site. Open scan history or try again shortly.",
  domain_already_connected: "This site is already connected to your workspace. Sign in to open it from scan history.",
  full_scan_server_error: "The scan service hit an unexpected error. Try again in a minute.",
  invalid_domain: "Enter a valid website domain, like example.com.",
  monthly_usage_limit:
    "This account has reached its monthly scan limit. Review your plan after signing in, or email support@certscore.ai.",
  rescan_cooldown:
    "This site was scanned recently. Try again shortly, review your plan after signing in, or email support@certscore.ai if you need higher throughput.",
  scan_already_active: "A scan is already queued or running for this site. Open scan history or try again shortly.",
  scan_limit_reached:
    "This scan could not be started because of an account or recent-scan limit. Review your plan after signing in, or email support@certscore.ai.",
  scan_queue_rejected: "The scan request was rejected before queueing. Try again in a minute.",
  scan_queue_unavailable: "The scan queue is unavailable. Try again in a minute."
};

const FULL_SCAN_ERROR_GUIDANCE: Record<string, string> = {
  monthly_usage_limit: "Review your plan after signing in, or email support@certscore.ai.",
  rescan_cooldown: "Email support@certscore.ai if you need higher-throughput scanning."
};

const BX01_SCAN_WINDOW_MS = 15000;
const BX01_EXTENSION_TIMEOUT_MS = 1200;

const SAMPLE_SCAN_ACCENTS: Record<string, { accent: string; label: string; tone: string }> = {
  "caltech.edu": { accent: "bg-sky-400", label: "Higher ed", tone: "from-sky-500/20 to-cyan-400/5" },
  "latimes.com": { accent: "bg-rose-400", label: "Publisher", tone: "from-rose-500/20 to-orange-400/5" },
  "nbcnews.com": { accent: "bg-violet-400", label: "Media", tone: "from-violet-500/20 to-fuchsia-400/5" },
  "nvidia.com": { accent: "bg-emerald-400", label: "Enterprise", tone: "from-emerald-500/20 to-lime-400/5" }
};

function getSampleScanAccent(domain: string) {
  return SAMPLE_SCAN_ACCENTS[domain.toLowerCase()] ?? { accent: "bg-slate-400", label: "Sample", tone: "from-slate-500/20 to-slate-400/5" };
}

function getSampleDomainLogoUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

type Bx01WindowMessage = {
  error?: string;
  requestId?: string;
  response?: {
    browserScanId?: string;
    error?: string;
    ok?: boolean;
    reportUrl?: string;
  };
  source?: string;
  status?: Bx01Status;
  type?: string;
};

type Bx01Status = {
  browserScanId?: string;
  busy?: boolean;
  label?: string;
  message?: string;
  phase?: string;
  reportUrl?: string;
  summary?: {
    bannerObserved?: boolean;
    cookieEventCount?: number;
    networkRequestCount?: number;
  };
  targetUrl?: string;
};

function getScanSubmitErrorMessage(mode: ScanMode, payload: ScanSubmitPayload): string {
  const code = payload.code ?? null;
  const guidance = mode === "full" && code ? FULL_SCAN_ERROR_GUIDANCE[code] : null;

  if (guidance && payload.error) {
    return `${payload.error} ${guidance}`;
  }

  const codedMessage = mode === "full" && code ? FULL_SCAN_ERROR_MESSAGES[code] : null;

  if (codedMessage) {
    return codedMessage;
  }

  return payload.error ?? GENERIC_SCAN_ERROR_MESSAGES[mode] ?? "The scan could not be started. Please try again.";
}

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `bx01-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBrowserScanTarget(rawDomain: string) {
  const value = rawDomain.trim();
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withScheme);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Enter a website domain, like example.com.");
  }
  return url.toString();
}

function waitForBx01Message(requestId: string, expectedType: string, timeoutMs: number) {
  return new Promise<Bx01WindowMessage>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("CertScore.ai Chrome extension was not detected."));
    }, timeoutMs);

    function handleMessage(event: MessageEvent) {
      if (event.source !== window || !event.data || typeof event.data !== "object") {
        return;
      }

      const data = event.data as Bx01WindowMessage;
      if (data.source !== "certscore-bx01-extension" || data.type !== expectedType || data.requestId !== requestId) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      resolve(data);
    }

    window.addEventListener("message", handleMessage);
  });
}

function recordScanSubmitFailure(event: ScanSubmitFailure) {
  const body = JSON.stringify(event);

  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const sent = navigator.sendBeacon("/api/scan-submit-events", new Blob([body], { type: "application/json" }));

    if (sent) {
      return;
    }
  }

  void fetch("/api/scan-submit-events", {
    body,
    headers: {
      "Content-Type": "application/json"
    },
    keepalive: true,
    method: "POST"
  }).catch(() => {});
}

function appendRecentScanReuseParam(destination: string, reusedExistingScan?: boolean | null) {
  if (!reusedExistingScan) {
    return destination;
  }

  try {
    const url = new URL(destination, window.location.origin);
    url.searchParams.set("recentScanReused", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const separator = destination.includes("?") ? "&" : "?";
    return `${destination}${separator}recentScanReused=1`;
  }
}

function getCurrentRelativeUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function isCurrentPageDestination(destination: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const destinationUrl = new URL(destination, window.location.origin);
    const currentUrl = new URL(getCurrentRelativeUrl() ?? window.location.href, window.location.origin);

    return (
      destinationUrl.pathname === currentUrl.pathname &&
      destinationUrl.search === currentUrl.search &&
      destinationUrl.hash === currentUrl.hash
    );
  } catch {
    return destination === getCurrentRelativeUrl();
  }
}

export function getScanSubmitDestination(mode: ScanMode, payload: ScanSubmitPayload) {
  if (mode === "preview") {
    return payload.previewUrl ?? null;
  }

  return payload.scanUrl ?? (payload.scanId ? `/app/scans/${payload.scanId}` : null);
}

export function DomainScanForm({
  allowLocalExtensionScan = false,
  buttonLabel = "Start full scan",
  compact = false,
  defaultScanFrom = "eu_ie",
  emptySubmitDomain = "",
  helperText,
  inputLabel = "Website domain",
  inputPlaceholder = "Enter yoursite.com",
  mode = "preview",
  sampleDomains = [],
  scanSource = "unknown"
}: DomainScanFormProps) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localExtensionStatus, setLocalExtensionStatus] = useState<Bx01Status | null>(null);
  const [showExtensionInstructions, setShowExtensionInstructions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [freshRescan, setFreshRescan] = useState(true);
  const [localV2ScanProfile, setLocalV2ScanProfile] = useState<LocalV2ScanProfile>("standard");
  const [localV2RunViaLambda, setLocalV2RunViaLambda] = useState(true);
  const [scanFrom, setScanFrom] = useState<ScanFrom>(defaultScanFrom);
  const isSubmittingRef = useRef(false);
  const scanProgress = useScanProgressClock(isSubmitting);

  useEffect(() => {
    if (!allowLocalExtensionScan && scanFrom === "local_extension") {
      setScanFrom(defaultScanFrom);
      setLocalExtensionStatus(null);
      setShowExtensionInstructions(false);
    }
  }, [allowLocalExtensionScan, defaultScanFrom, scanFrom]);

  function resetValidationState() {
    setErrorMessage(null);
    if (!isSubmittingRef.current) {
      setLocalExtensionStatus(null);
    }
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window || !event.data || typeof event.data !== "object") {
        return;
      }

      const data = event.data as Bx01WindowMessage;
      if (data.source !== "certscore-bx01-extension" || data.type !== "CERTSCORE_BX01_STATUS" || !data.status) {
        return;
      }

      setLocalExtensionStatus(data.status);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function assertBx01ExtensionInstalled() {
    const requestId = createRequestId();
    const ready = waitForBx01Message(requestId, "CERTSCORE_BX01_READY", BX01_EXTENSION_TIMEOUT_MS);
    setLocalExtensionStatus({
      busy: true,
      label: "Connecting",
      message: "Checking for the CertScore.ai Chrome extension on this page.",
      phase: "extension-check"
    });
    window.postMessage({ requestId, type: "CERTSCORE_BX01_PING" }, window.location.origin);
    await ready;
  }

  async function startLocalExtensionScan(rawDomain: string) {
    const targetUrl = normalizeBrowserScanTarget(rawDomain);
    await assertBx01ExtensionInstalled();
    setLocalExtensionStatus({
      busy: true,
      label: "Starting",
      message: "Asking BX01 to open the target in Chrome and begin browser-side evidence capture.",
      phase: "starting",
      targetUrl
    });

    const requestId = createRequestId();
    const responsePromise = waitForBx01Message(requestId, "CERTSCORE_BX01_START_RESPONSE", 10000);
    window.postMessage(
      {
        freshVisit: true,
        requestId,
        returnToLauncherOnComplete: true,
        scanWindowMs: BX01_SCAN_WINDOW_MS,
        targetUrl,
        type: "CERTSCORE_BX01_START_SCAN"
      },
      window.location.origin
    );
    const message = await responsePromise;
    const response = message.response;
    if (message.error || !response?.ok || !response.browserScanId) {
      throw new Error(message.error ?? response?.error ?? "The local extension scan could not be started.");
    }
    setLocalExtensionStatus({
      browserScanId: response.browserScanId,
      busy: true,
      label: "Opening target",
      message: "BX01 is opening the target tab. CertScore.ai will move to the report automatically as evidence arrives.",
      phase: "open-target",
      targetUrl
    });

    await pushDataLayerEventBeforeNavigation({
      event: "scan_started",
      scan_source: scanSource,
      scan_target_type: getScanTargetType(targetUrl),
      scan_status: "queued"
    });

    router.push(response.reportUrl ?? `/app/browser-scans/${response.browserScanId}`);
  }

  async function submitDomain(rawDomain: string) {
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setErrorMessage(null);

    const submittedDomain = rawDomain.trim();

    if (!submittedDomain) {
      isSubmittingRef.current = false;
      setErrorMessage("Enter a website domain to scan.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "full" && scanFrom === "local_extension") {
        try {
          await startLocalExtensionScan(submittedDomain);
        } catch (error) {
          if (/extension was not detected/i.test(error instanceof Error ? error.message : String(error))) {
            setLocalExtensionStatus(null);
            setShowExtensionInstructions(true);
            setErrorMessage(null);
          } else {
            setLocalExtensionStatus({
              busy: false,
              label: "Error",
              message: error instanceof Error ? error.message : "The local extension scan could not be started.",
              phase: "error"
            });
            setErrorMessage(error instanceof Error ? error.message : "The local extension scan could not be started.");
          }
          isSubmittingRef.current = false;
          setIsSubmitting(false);
        }
        return;
      }

      const response = await fetch(mode === "preview" ? "/api/preview-scan" : "/api/full-scan", {
        body: JSON.stringify({
          domain: submittedDomain,
          forceNewScan: mode === "full" ? freshRescan : false,
          localV2ScanProfile,
          localV2RunViaLambda,
          scanFrom: scanFrom as ServerScanFrom
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      const payload = (await response.json()) as ScanSubmitPayload;
      const destination = getScanSubmitDestination(mode, payload);

      if (!response.ok) {
        recordScanSubmitFailure({
          code: payload.code,
          domain: submittedDomain,
          error: payload.error,
          mode,
          stage: "api_rejected",
          status: response.status
        });
        setErrorMessage(getScanSubmitErrorMessage(mode, payload));
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      if (!destination) {
        recordScanSubmitFailure({
          code: payload.code,
          domain: submittedDomain,
          error: payload.error,
          mode,
          stage: "missing_destination",
          status: response.status
        });
        setErrorMessage("The scan was accepted, but the result link was missing. Refresh and check scan history.");
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      await pushDataLayerEventBeforeNavigation({
        event: "scan_started",
        scan_source: scanSource,
        scan_target_type: getScanTargetType(submittedDomain),
        scan_status: "queued"
      });
      const nextDestination = appendRecentScanReuseParam(destination, payload.reusedExistingScan);

      if (isCurrentPageDestination(nextDestination)) {
        router.refresh();
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setErrorMessage(payload.reusedExistingScan ? "Showing the latest completed scan for this site." : null);
        return;
      }

      router.push(nextDestination);
    } catch (error) {
      recordScanSubmitFailure({
        domain: submittedDomain,
        error: error instanceof Error ? error.message : String(error),
        mode,
        stage: "request_failed"
      });
      setErrorMessage("The request did not complete. Check your connection and try again.");
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitDomain(domain || emptySubmitDomain);
  }

  async function handleSampleScan(sampleDomain: string) {
    setDomain(sampleDomain);
    await submitDomain(sampleDomain);
  }

  return (
    <form className={compact ? "space-y-2" : "space-y-4"} onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2">
        <div className="relative z-30">
          <Input
            autoComplete="url"
            className={
              compact
                ? "h-12 rounded-[1.2rem] pr-40 text-left text-sm placeholder:text-left"
                : "h-14 rounded-[1.6rem] pr-32 text-base"
            }
            id="domain"
            name="domain"
            onChange={(event) => {
              setDomain(event.target.value);
              resetValidationState();
            }}
            placeholder={inputPlaceholder}
            type="text"
            value={domain}
            aria-label={inputLabel}
          />
          {mode === "full" ? (
            <div className={compact ? "absolute right-[5.9rem] top-1/2 -translate-y-1/2" : "absolute right-[4.25rem] top-1/2 -translate-y-1/2"}>
              <ScanFromSelect
                compact={compact}
                freshRescanValue={freshRescan}
                includeLocalV2ScanProfileOption
                includeFreshRescanOption
                includeLocalExtension={allowLocalExtensionScan}
                localV2ScanProfileValue={localV2ScanProfile}
                localV2RunViaLambdaValue={localV2RunViaLambda}
                onChange={setScanFrom}
                onFreshRescanChange={setFreshRescan}
                onLocalV2ScanProfileChange={(value) => setLocalV2ScanProfile(normalizeLocalV2ScanProfile(value))}
                onLocalV2RunViaLambdaChange={setLocalV2RunViaLambda}
                value={scanFrom}
                variant="icon"
              />
            </div>
          ) : (
            <div className={compact ? "absolute right-[5.9rem] top-1/2 -translate-y-1/2" : "absolute right-[4.25rem] top-1/2 -translate-y-1/2"}>
              <ScanFromSelect
                compact={compact}
                includeLocalV2ScanProfileOption
                includeScanFromOptions={false}
                localV2ScanProfileValue={localV2ScanProfile}
                localV2RunViaLambdaValue={localV2RunViaLambda}
                onLocalV2ScanProfileChange={(value) => setLocalV2ScanProfile(normalizeLocalV2ScanProfile(value))}
                onLocalV2RunViaLambdaChange={setLocalV2RunViaLambda}
                variant="icon"
              />
            </div>
          )}
          <Button
            aria-label={buttonLabel}
            className={
              compact
                ? "absolute right-2 top-1/2 h-8 -translate-y-1/2 rounded-full border-0 bg-slate-950 px-4 text-xs font-semibold text-white shadow-none hover:bg-slate-800"
                : "absolute right-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full border-0 bg-[linear-gradient(135deg,#47b54a_0%,#5ec158_58%,#7ccf79_100%)] px-0 text-white shadow-[0_10px_24px_rgba(71,181,74,0.16)] hover:brightness-[1.04]"
            }
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? (
              <span className="text-xs">...</span>
            ) : (
              compact ? (
                <span>Scan</span>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )
            )}
          </Button>
        </div>
      </div>
      {helperText && !compact ? (
        <div className="flex justify-start sm:justify-end">
          <p className="max-w-sm text-xs text-slate-500 sm:text-right">{helperText}</p>
        </div>
      ) : null}
      {isSubmitting && scanFrom !== "local_extension" ? (
        <ScanSubmitProgressBar
          active
          compact={compact}
          nowMs={scanProgress.nowMs}
          profileValue={localV2ScanProfile}
          startedAtMs={scanProgress.startedAtMs}
        />
      ) : null}
      {sampleDomains.length > 0 ? (
        <div className="relative z-0 overflow-hidden rounded-[1.25rem] border border-slate-800 bg-slate-950 shadow-[0_24px_60px_rgba(2,6,23,0.22)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/70 px-4 py-3">
            <div>
              <div className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-sky-300">View sample scans</div>
              <p className="mt-1 text-xs text-slate-400">Open a live report with retained evidence.</p>
            </div>
          </div>
          <div className="space-y-px bg-slate-800">
            {sampleDomains.map((sampleDomain) => {
              const accent = getSampleScanAccent(sampleDomain);
              return (
                <button
                  key={sampleDomain}
                  className={`group relative w-full overflow-hidden bg-slate-950 bg-gradient-to-r ${accent.tone} px-4 py-2.5 text-left transition hover:z-10 hover:bg-slate-900 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-wait disabled:opacity-60`}
                  disabled={isSubmitting}
                  onClick={() => void handleSampleScan(sampleDomain)}
                  type="button"
                >
                  <span className="absolute left-0 top-0 h-full w-1 bg-slate-600" aria-hidden="true" />
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 opacity-70 shadow-sm ring-1 ring-white/5 transition group-hover:opacity-85">
                        <img
                          alt=""
                          className="h-3.5 w-3.5 rounded-sm grayscale-[35%] saturate-75"
                          decoding="async"
                          draggable={false}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          src={getSampleDomainLogoUrl(sampleDomain)}
                        />
                      </span>
                      <span className="truncate font-mono text-[0.95rem] font-semibold tracking-wide text-slate-50 transition group-hover:text-sky-300">{sampleDomain}</span>
                      <span className="inline-flex shrink-0 rounded-full border border-slate-700 bg-slate-900/80 px-2 py-0.5 font-mono text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {accent.label}
                      </span>
                    </span>
                    <span className="inline-flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-400 shadow-sm transition group-hover:translate-x-0.5 group-hover:border-sky-400/70 group-hover:text-sky-300">
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" aria-hidden="true">
                        <path
                          d="M5 12h14M13 6l6 6-6 6"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.2"
                        />
                      </svg>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
      {mode === "full" && scanFrom === "local_extension" && localExtensionStatus ? (
        <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-slate-700">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-slate-950">{localExtensionStatus.label ?? "Local-extension scan"}</p>
              <p className="mt-1 leading-6">{localExtensionStatus.message ?? "BX01 is preparing the browser scan."}</p>
            </div>
            {localExtensionStatus.phase ? (
              <span className="mt-1 w-fit rounded-full bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700 ring-1 ring-sky-100">
                {localExtensionStatus.phase}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {showExtensionInstructions ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="bx01-install-title">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Local-extension scan</p>
                <h2 id="bx01-install-title" className="text-xl font-semibold tracking-tight text-slate-950">Install the CertScore.ai Chrome extension</h2>
              </div>
              <button
                aria-label="Close extension install instructions"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                onClick={() => setShowExtensionInstructions(false)}
                type="button"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
                  <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                </svg>
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              <p>
                Local-extension scans run from your own Chrome browser. CertScore.ai did not detect the BX01 extension on this page.
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Open Chrome Extensions and enable Developer mode.</li>
                <li>Choose Load unpacked.</li>
                <li>Select the CertScore.ai extension folder: <span className="font-mono text-xs">apps/browser-extension</span>.</li>
                <li>Reload this CertScore.ai tab after loading or reloading the extension.</li>
                <li>Run the scan again with Local-extension selected.</li>
              </ol>
              <a
                className="inline-flex font-semibold text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-800"
                href="/app/browser-scans/setup"
              >
                Open extension setup page
              </a>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setShowExtensionInstructions(false)}
                type="button"
              >
                Close
              </button>
              <button
                className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
                disabled={isSubmitting}
                onClick={() => {
                  setShowExtensionInstructions(false);
                  void submitDomain(domain || emptySubmitDomain);
                }}
                type="button"
              >
                Check again
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
