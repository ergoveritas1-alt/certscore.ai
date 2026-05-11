"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { getScanTargetType, type ScanSource, pushDataLayerEvent } from "../../lib/analytics/data-layer";

type DomainScanFormProps = {
  buttonLabel?: string;
  compact?: boolean;
  helperText?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  mode?: "full" | "preview";
  scanSource?: ScanSource;
};

type ScanMode = NonNullable<DomainScanFormProps["mode"]>;

type ScanSubmitPayload = {
  code?: string | null;
  error?: string | null;
  previewUrl?: string | null;
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
  full_scan_server_error: "The scan service hit an unexpected error. Try again in a minute.",
  invalid_domain: "Enter a valid website domain, like example.com.",
  scan_already_active: "A scan is already active for this domain. Open the latest scan from your history.",
  scan_limit_reached: "This scan is blocked by your plan or recent scan limit.",
  scan_queue_rejected: "The scan request was rejected before queueing. Try again in a minute.",
  scan_queue_unavailable: "The scan queue is unavailable. Try again in a minute."
};

function getScanSubmitErrorMessage(mode: ScanMode, payload: ScanSubmitPayload): string {
  const codedMessage = mode === "full" && payload.code ? FULL_SCAN_ERROR_MESSAGES[payload.code] : null;

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

export function DomainScanForm({
  buttonLabel = "Start full scan",
  compact = false,
  helperText,
  inputLabel = "Website domain",
  inputPlaceholder = "Enter yoursite.com",
  mode = "preview",
  scanSource = "unknown"
}: DomainScanFormProps) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetValidationState() {
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!domain.trim()) {
      setErrorMessage("Enter a website domain to scan.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(mode === "preview" ? "/api/preview-scan" : "/api/full-scan", {
        body: JSON.stringify({
          domain
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
          domain,
          error: payload.error,
          mode,
          stage: "api_rejected",
          status: response.status
        });
        setErrorMessage(getScanSubmitErrorMessage(mode, payload));
        setIsSubmitting(false);
        return;
      }

      if (!destination) {
        recordScanSubmitFailure({
          code: payload.code,
          domain,
          error: payload.error,
          mode,
          stage: "missing_destination",
          status: response.status
        });
        setErrorMessage("The scan was accepted, but the result link was missing. Refresh and check scan history.");
        setIsSubmitting(false);
        return;
      }

      pushDataLayerEvent({
        event: "scan_started",
        scan_source: scanSource,
        scan_target_type: getScanTargetType(domain),
        scan_status: "queued"
      });
      router.push(destination);
    } catch (error) {
      recordScanSubmitFailure({
        domain,
        error: error instanceof Error ? error.message : String(error),
        mode,
        stage: "request_failed"
      });
      setErrorMessage("The request did not complete. Check your connection and try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form className={compact ? "space-y-2" : "space-y-4"} onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2">
        <div className="relative">
          <Input
            autoComplete="url"
            className={compact ? "h-12 rounded-[1.2rem] pr-28 text-sm" : "h-14 rounded-[1.6rem] pr-20 text-base"}
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
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </form>
  );
}
