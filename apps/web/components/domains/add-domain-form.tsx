"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useActionState, useEffect, useState } from "react";
import { clearPendingScanStarted, markPendingScanStarted } from "../analytics/data-layer-events";
import { buildRecentScanAvailabilityUrl } from "../marketing/domain-scan-form";
import { createDomainAction, type CreateDomainActionState } from "../../server/domains/create-domain";
import { ScanFromSelect, type ScanFrom, type ServerScanFrom } from "../scans/scan-from-select";
import {
  ScanSubmitProgressBar,
  normalizeLocalV2ScanProfile,
  useScanProgressClock,
  type LocalV2ScanProfile
} from "../scans/scan-submit-progress";

const initialState: CreateDomainActionState = {
  error: null
};

const RECENT_SCAN_AVAILABILITY_CHECK_DELAY_MS = 350;

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
  const [hasRecentReusableScan, setHasRecentReusableScan] = useState(false);
  const [localV2ScanProfile, setLocalV2ScanProfile] = useState<LocalV2ScanProfile>("standard");
  const [scanFrom, setScanFrom] = useState<ScanFrom>(defaultScanFrom);
  const scanProgress = useScanProgressClock(isPending);
  const effectiveSubmitDomain = domain.trim();

  useEffect(() => {
    if (state.error) {
      clearPendingScanStarted();
    }
  }, [state.error]);

  useEffect(() => {
    if (!effectiveSubmitDomain || scanFrom === "local_extension") {
      setHasRecentReusableScan(false);
      setFreshRescan(false);
      return;
    }

    setHasRecentReusableScan(false);
    setFreshRescan(false);

    const normalizedDomain = normalizeDomainHint(effectiveSubmitDomain);
    if (recentReusableScans.some((scan) => normalizeDomainHint(scan.domain) === normalizedDomain && scan.scanFrom === scanFrom)) {
      setHasRecentReusableScan(true);
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
          setHasRecentReusableScan(nextHasRecentReusableScan);
          if (!nextHasRecentReusableScan) {
            setFreshRescan(false);
          }
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          setHasRecentReusableScan(false);
          setFreshRescan(false);
        });
    }, RECENT_SCAN_AVAILABILITY_CHECK_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [effectiveSubmitDomain, recentReusableScans, scanFrom]);

  return (
    <form action={action} className="space-y-4" onSubmit={() => markPendingScanStarted("dashboard")}>
      <div>
        <div className="relative">
          <Input
            autoComplete="url"
            className="h-14 rounded-[1.75rem] border-slate-300 pr-52 text-xl shadow-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-slate-200"
            id="domain"
            name="domain"
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com, yoursite.com"
            required
            type="text"
            value={domain}
          />
          <div className="absolute right-[10.6rem] top-1/2 -translate-y-1/2">
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
          </div>
          <Button
            aria-label="Start scanning"
            className="absolute right-2.5 top-1/2 h-10 -translate-y-1/2 rounded-full border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] px-4 text-sm font-medium text-white shadow-[0_10px_24px_rgba(15,139,215,0.16)] hover:brightness-[1.04]"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Starting..." : "Start scanning"}
          </Button>
        </div>
      </div>

      {planCode === "free" ? (
        <p className="text-xs text-slate-500">
          Trial accounts include a limited page-scan allowance for evaluating the workflow.
        </p>
      ) : null}

      {isPending ? (
        <ScanSubmitProgressBar
          active
          nowMs={scanProgress.nowMs}
          profileValue={localV2ScanProfile}
          startedAtMs={scanProgress.startedAtMs}
        />
      ) : null}

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
