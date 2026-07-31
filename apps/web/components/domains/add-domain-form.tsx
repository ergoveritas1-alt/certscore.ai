"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useActionState, useEffect, useState } from "react";
import { clearPendingScanStarted, markPendingScanStarted } from "../analytics/data-layer-events";
import { buildRecentScanAvailabilityUrl } from "../marketing/domain-scan-form";
import { createDomainAction, type CreateDomainActionState } from "../../server/domains/create-domain";
import { ScanFromSelect, type ScanFrom, type ServerScanFrom } from "../scans/scan-from-select";
import {
  ScanActivityIndicator,
  ScanSubmissionPendingIndicator,
  normalizeLocalV2ScanProfile,
  type LocalV2ScanProfile
} from "../scans/scan-submit-progress";

const initialState: CreateDomainActionState = {
  error: null
};

const RECENT_SCAN_AVAILABILITY_CHECK_DELAY_MS = 350;
const DOMAIN_INPUT_PLACEHOLDER = "Enter website here:";

type AddDomainFormProps = {
  allowRestrictedScanOptions?: boolean;
  defaultScanFrom?: ServerScanFrom;
  planCode: string;
  recentReusableScans?: Array<{
    domain: string;
    scanFrom: ServerScanFrom;
  }>;
};

function normalizeDomainHint(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^www\./, "");
  }
}

export function AddDomainForm({
  allowRestrictedScanOptions = false,
  defaultScanFrom = "eu_ie",
  planCode,
  recentReusableScans = []
}: AddDomainFormProps) {
  const [state, action, isPending] = useActionState(createDomainAction, initialState);
  const [domain, setDomain] = useState("");
  const [freshRescan, setFreshRescan] = useState(false);
  const [apiHasRecentReusableScan, setApiHasRecentReusableScan] = useState(false);
  const [localV2ScanProfile, setLocalV2ScanProfile] = useState<LocalV2ScanProfile>("standard");
  const [scanFrom, setScanFrom] = useState<ScanFrom>(defaultScanFrom);
  const effectiveSubmitDomain = domain.trim();
  const normalizedDomain = normalizeDomainHint(effectiveSubmitDomain);
  const hasRecentReusableScanHint = recentReusableScans.some(
    (scan) => normalizeDomainHint(scan.domain) === normalizedDomain && scan.scanFrom === scanFrom
  );
  const hasRecentReusableScan = hasRecentReusableScanHint || apiHasRecentReusableScan;

  useEffect(() => {
    if (state.error) {
      clearPendingScanStarted();
    }
  }, [state.error]);

  useEffect(() => {
    if (!effectiveSubmitDomain || scanFrom === "local_extension") {
      setApiHasRecentReusableScan(false);
      setFreshRescan(false);
      return;
    }

    setApiHasRecentReusableScan(false);
    setFreshRescan(false);

    if (hasRecentReusableScanHint) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      fetch(buildRecentScanAvailabilityUrl({ domain: effectiveSubmitDomain, scanFrom: scanFrom as ServerScanFrom }), {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      })
        .then(async (response) => {
          if (!response.ok) {
            return false;
          }

          const parsed: unknown = await response.json().catch(() => null);
          const payload = parsed && typeof parsed === "object" ? parsed as { hasRecentReusableScan?: unknown } : null;
          return Boolean(payload?.hasRecentReusableScan);
        })
        .then((nextHasRecentReusableScan) => {
          setApiHasRecentReusableScan(nextHasRecentReusableScan);
          if (!nextHasRecentReusableScan) {
            setFreshRescan(false);
          }
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          setApiHasRecentReusableScan(false);
          setFreshRescan(false);
        });
    }, RECENT_SCAN_AVAILABILITY_CHECK_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [effectiveSubmitDomain, hasRecentReusableScanHint, scanFrom]);

  return (
    <form action={action} className="space-y-4" onSubmit={() => markPendingScanStarted("dashboard")}>
      <div>
        <div className="relative">
          <Input
            autoComplete="url"
            className="h-12 rounded-[14px] border-2 border-sky-400 bg-white pl-4 pr-44 text-base font-semibold text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_10px_26px_rgba(14,165,233,0.12)] placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-400/30"
            id="domain"
            name="domain"
            onChange={(event) => setDomain(event.target.value)}
            placeholder={DOMAIN_INPUT_PLACEHOLDER}
            required
            type="text"
            value={domain}
          />
          <div className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2">
            <ScanFromSelect
              allowRestrictedScanOptions={allowRestrictedScanOptions}
              freshRescanValue={freshRescan}
              includeFreshRescanOption={hasRecentReusableScan}
              includeLocalV2ScanProfileOption
              localV2ScanProfileValue={localV2ScanProfile}
              onChange={setScanFrom}
              onFreshRescanChange={setFreshRescan}
              onLocalV2ScanProfileChange={(value) => setLocalV2ScanProfile(normalizeLocalV2ScanProfile(value))}
              value={scanFrom}
              variant="icon"
            />
            <Button
              aria-label="Scan"
              className={`scan-report-button scan-report-button-primary h-8 ${isPending ? "w-[7.5rem]" : "w-[4.5rem]"} rounded-full border-0 bg-[linear-gradient(180deg,#38bdf8_0%,#0284c7_100%)] px-4 text-xs font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_3px_0_0_rgba(3,105,161,0.55),0_10px_22px_-7px_rgba(14,165,233,0.7)] transition-[filter,box-shadow] duration-150 hover:border-sky-500 hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_0_0_rgba(3,105,161,0.5),0_13px_24px_-7px_rgba(14,165,233,0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 disabled:!opacity-100`}
              disabled={isPending}
              type="submit"
            >
              {isPending ? (
                <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
                  <ScanActivityIndicator />
                  <span>Scanning…</span>
                </span>
              ) : "Scan"}
            </Button>
          </div>
        </div>
      </div>

      {isPending ? (
        <ScanSubmissionPendingIndicator />
      ) : null}

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
