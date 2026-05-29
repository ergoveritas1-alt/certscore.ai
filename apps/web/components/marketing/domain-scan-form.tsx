"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { getScanTargetType, type ScanSource, pushDataLayerEventBeforeNavigation } from "../../lib/analytics/data-layer";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  function resetValidationState() {
    setErrorMessage(null);
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
      const response = await fetch(mode === "preview" ? "/api/preview-scan" : "/api/full-scan", {
        body: JSON.stringify({
          domain: submittedDomain
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
                ? "h-12 rounded-[1.2rem] pr-28 text-left text-sm placeholder:text-left"
                : "h-14 rounded-[1.6rem] pr-20 text-base"
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
          <div className="px-2 pb-2 pt-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Sample scans</div>
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
    </form>
  );
}
