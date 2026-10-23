"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { needsSearchResultsConfirmation, searchResultsScanTarget } from "@website-signal-risk-scanner/shared/validators/search-results-url";
import { useActionState, useEffect, useRef, useState } from "react";
import { clearPendingScanStarted, markPendingScanStarted } from "../analytics/data-layer-events";
import { buildRecentScanAvailabilityUrl } from "../marketing/domain-scan-form";
import { createDomainAction, type CreateDomainActionState } from "../../server/domains/create-domain";
import { trackProductEvent } from "../../lib/product-analytics/client";
import { SCAN_FORM_ID, scanFormFailureEvent } from "../../lib/product-analytics/scan-form-events";
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
const DOMAIN_INPUT_PLACEHOLDER = "example.com";

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
  const lastReportedState = useRef(initialState);
  const [domain, setDomain] = useState("");
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [showSearchResultsWarning, setShowSearchResultsWarning] = useState(false);
  const [freshRescan, setFreshRescan] = useState(true);
  const [apiHasRecentReusableScan, setApiHasRecentReusableScan] = useState(false);
  const [localV2ScanProfile, setLocalV2ScanProfile] = useState<LocalV2ScanProfile>("standard");
  const [scanFrom, setScanFrom] = useState<ScanFrom>(defaultScanFrom);
  const effectiveSubmitDomain = domain.trim();
  const normalizedDomain = normalizeDomainHint(effectiveSubmitDomain);
  const searchResultsTarget = searchResultsScanTarget(effectiveSubmitDomain);
  const hasRecentReusableScanHint = recentReusableScans.some(
    (scan) => normalizeDomainHint(scan.domain) === normalizedDomain && scan.scanFrom === scanFrom
  );
  const hasRecentReusableScan = hasRecentReusableScanHint || apiHasRecentReusableScan;

  useEffect(() => {
    if (state.error) {
      clearPendingScanStarted();
      if (lastReportedState.current !== state) trackProductEvent(scanFormFailureEvent("server_rejected"));
    }
    lastReportedState.current = state;
  }, [state]);

  useEffect(() => {
    if (!effectiveSubmitDomain || scanFrom === "local_extension") {
      setApiHasRecentReusableScan(false);
      setFreshRescan(true);
      return;
    }

    setApiHasRecentReusableScan(false);
    setFreshRescan(true);

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
            setFreshRescan(true);
          }
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          setApiHasRecentReusableScan(false);
          setFreshRescan(true);
        });
    }, RECENT_SCAN_AVAILABILITY_CHECK_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [effectiveSubmitDomain, hasRecentReusableScanHint, scanFrom]);

  return (
    <form action={action} className="space-y-4" data-analytics-form={SCAN_FORM_ID} data-analytics-submit="manual" onSubmit={(event) => {
      if (!domain.trim()) {
        event.preventDefault();
        setWebsiteError("Enter a website address.");
        trackProductEvent(scanFormFailureEvent("website_required"));
        return;
      }
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      const confirmation = submitter?.name === "confirmedSearchResultsUrl" ? submitter.value : null;
      if (needsSearchResultsConfirmation(domain, confirmation)) {
        event.preventDefault();
        setShowSearchResultsWarning(true);
        trackProductEvent(scanFormFailureEvent("search_results_confirmation_required"));
        return;
      }
      trackProductEvent({ eventName: "form_submitted", category: "form", feature: SCAN_FORM_ID, formId: SCAN_FORM_ID, outcome: "submitted" });
      markPendingScanStarted("dashboard");
    }}>
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-slate-900" htmlFor="domain">Website address</label>
        <p className="text-xs leading-5 text-slate-600" id="website-scan-hint">Enter a website, such as example.com, or paste a page URL.</p>
        <div className="space-y-3">
          <Input
            aria-describedby={websiteError ? "website-scan-hint website-scan-error" : "website-scan-hint"}
            aria-invalid={websiteError ? true : undefined}
            autoComplete="url"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="url"
            spellCheck={false}
            onInvalid={() => {
              setWebsiteError("Enter a website address.");
              trackProductEvent(scanFormFailureEvent("website_required"));
            }}
            className="h-12 rounded-[14px] border-2 border-sky-400 bg-white px-4 text-base font-semibold text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_10px_26px_rgba(14,165,233,0.12)] placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-400/30"
            id="domain"
            name="domain"
            onChange={(event) => {
              setDomain(event.target.value);
              setWebsiteError(null);
              setShowSearchResultsWarning(false);
            }}
            placeholder={DOMAIN_INPUT_PLACEHOLDER}
            required
            type="text"
            value={domain}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              data-analytics-feature="scan_setup"
              data-analytics-id="website_scan:submit"
              className="min-h-12 w-full rounded-xl bg-sky-700 px-6 text-base font-semibold text-white hover:bg-sky-800 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:w-auto"
              disabled={isPending}
              type="submit"
            >
              {isPending ? (
                <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
                  <ScanActivityIndicator />
                  <span>Scanning…</span>
                </span>
              ) : "Scan website"}
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Scan options</span>
              <ScanFromSelect
                analyticsId="website_scan:options"
                triggerClassName="min-h-11 min-w-11"
                includeFullSiteOption
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
          </div>
        </div>
      </div>

      {showSearchResultsWarning && searchResultsTarget ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
          <p className="font-semibold">This looks like a search results link.</p>
          <p>To scan a website from the results, open that website and copy its address here.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button data-analytics-id="website_scan:edit_address" className="min-h-11 font-semibold underline" onClick={() => document.getElementById("domain")?.focus()} type="button">Edit address</button>
            <button data-analytics-id="website_scan:confirm_search_results" className="min-h-11 font-semibold underline" name="confirmedSearchResultsUrl" type="submit" value={searchResultsTarget}>Scan search results page anyway</button>
          </div>
        </div>
      ) : null}

      {isPending ? (
        <ScanSubmissionPendingIndicator />
      ) : null}

      {websiteError ? <p className="text-sm text-red-600" id="website-scan-error" role="alert">{websiteError}</p> : null}
      {state.error ? <p className="text-sm text-red-600" role="alert">{state.error}</p> : null}
    </form>
  );
}
