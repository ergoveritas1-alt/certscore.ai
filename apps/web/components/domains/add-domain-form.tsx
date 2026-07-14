"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useActionState, useEffect, useState } from "react";
import { clearPendingScanStarted, markPendingScanStarted } from "../analytics/data-layer-events";
import { buildRecentScanAvailabilityUrl } from "../marketing/domain-scan-form";
import { createDomainAction, type CreateDomainActionState } from "../../server/domains/create-domain";
import { ScanFromSelect, type ScanFrom, type ServerScanFrom } from "../scans/scan-from-select";
import {
  ScanSubmitProgressBar,
  ScanActivityIndicator,
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
  const [apiHasRecentReusableScan, setApiHasRecentReusableScan] = useState(false);
  const [localV2ScanProfile, setLocalV2ScanProfile] = useState<LocalV2ScanProfile>("standard");
  const [scanFrom, setScanFrom] = useState<ScanFrom>(defaultScanFrom);
  const scanProgress = useScanProgressClock(isPending);
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
            className="h-16 rounded-[16px] border-[3px] border-sky-400 bg-white pl-6 pr-48 text-lg font-semibold text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_16px_42px_rgba(14,165,233,0.16)] placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-400/30"
            id="domain"
            name="domain"
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com, yoursite.com"
            required
            type="text"
            value={domain}
          />
          <div className="absolute right-[9.75rem] top-1/2 -translate-y-1/2 scale-110">
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
            aria-label="Scan now"
            className="absolute right-1.5 top-1/2 h-12 w-[126px] -translate-y-1/2 rounded-[13px] border border-emerald-300/70 bg-[linear-gradient(135deg,#45c957_0%,#56bd58_100%)] px-4 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_7px_18px_rgba(34,197,94,0.22)] hover:brightness-110 focus-visible:ring-4 focus-visible:ring-emerald-300/40"
            disabled={isPending}
            type="submit"
          >
            {isPending ? (
              <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
                <ScanActivityIndicator />
                <span>Scanning…</span>
              </span>
            ) : "Scan now"}
          </Button>
        </div>
      </div>

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
