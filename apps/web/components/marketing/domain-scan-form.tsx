"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { getScanTargetType, type ScanSource, pushDataLayerEventBeforeNavigation } from "../../lib/analytics/data-layer";
import { ScanFromSelect, type ScanFrom, type ServerScanFrom } from "../scans/scan-from-select";

type DomainScanFormProps = {
  buttonLabel?: string;
  compact?: boolean;
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
  domain_limit:
    "This account has reached its website limit. Review your plan after signing in, or email support@certscore.ai.",
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
  domain_limit: "Review your plan after signing in, or email support@certscore.ai.",
  monthly_usage_limit: "Review your plan after signing in, or email support@certscore.ai.",
  rescan_cooldown: "Email support@certscore.ai if you need higher-throughput scanning."
};

const BX01_SCAN_WINDOW_MS = 15000;
const BX01_EXTENSION_TIMEOUT_MS = 1200;

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
  type?: string;
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
      reject(new Error("CertScore Chrome extension was not detected."));
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

export function DomainScanForm({
  buttonLabel = "Start full scan",
  compact = false,
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
  const [showExtensionInstructions, setShowExtensionInstructions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanFrom, setScanFrom] = useState<ScanFrom>("default");
  const isSubmittingRef = useRef(false);

  function resetValidationState() {
    setErrorMessage(null);
  }

  async function assertBx01ExtensionInstalled() {
    const requestId = createRequestId();
    const ready = waitForBx01Message(requestId, "CERTSCORE_BX01_READY", BX01_EXTENSION_TIMEOUT_MS);
    window.postMessage({ requestId, type: "CERTSCORE_BX01_PING" }, window.location.origin);
    await ready;
  }

  async function startLocalExtensionScan(rawDomain: string) {
    const targetUrl = normalizeBrowserScanTarget(rawDomain);
    await assertBx01ExtensionInstalled();

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
            setShowExtensionInstructions(true);
            setErrorMessage(null);
          } else {
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
          scanFrom: scanFrom as ServerScanFrom
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      const payload = (await response.json()) as ScanSubmitPayload;
      const destination = mode === "preview" ? payload.previewUrl : payload.scanUrl;

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
        <div className="relative">
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
              <ScanFromSelect compact={compact} includeLocalExtension onChange={setScanFrom} value={scanFrom} variant="icon" />
            </div>
          ) : null}
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
      {sampleDomains.length > 0 ? (
        <div className="rounded-[1.35rem] border border-slate-200 bg-white/80 p-2 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
          <div className="px-2 pb-2 pt-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">View sample scans</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {sampleDomains.map((sampleDomain) => (
              <button
                key={sampleDomain}
                className="group flex min-h-11 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 text-left text-sm font-semibold text-slate-800 transition hover:border-sky-200 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-wait disabled:opacity-60"
                disabled={isSubmitting}
                onClick={() => void handleSampleScan(sampleDomain)}
                type="button"
              >
                <span>{sampleDomain}</span>
                <span className="ml-3 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm transition group-hover:text-sky-600">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
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
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
      {showExtensionInstructions ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="bx01-install-title">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Local-extension scan</p>
                <h2 id="bx01-install-title" className="text-xl font-semibold tracking-tight text-slate-950">Install the CertScore Chrome extension</h2>
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
                Local-extension scans run from your own Chrome browser. CertScore did not detect the BX01 extension on this page.
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Open Chrome Extensions and enable Developer mode.</li>
                <li>Choose Load unpacked.</li>
                <li>Select the CertScore extension folder: <span className="font-mono text-xs">apps/browser-extension</span>.</li>
                <li>Return to this page and run the scan again with Local-extension selected.</li>
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
