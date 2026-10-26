"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  homepageAudienceText,
  isSampleScanFrom,
  parseHomepageLocation,
  resolveSampleScanFrom,
  type HomepageLocation,
  type SampleScanFrom,
} from "../../lib/marketing/homepage-location";

type HomepageScanPreferences = {
  scanFrom: SampleScanFrom;
  manualScanFrom: SampleScanFrom | null;
  location: HomepageLocation;
  locationOverride: HomepageLocation | null;
  selectScanFrom: (value: SampleScanFrom) => void;
};

const Preferences = createContext<HomepageScanPreferences | null>(null);

export function useHomepageScanPreferences() {
  return useContext(Preferences);
}

export function HomepageScanPreferencesProvider({ children }: { children: ReactNode }) {
  const [scanFrom, setScanFrom] = useState<SampleScanFrom>("eu_ie");
  const [manualScanFrom, setManualScanFrom] = useState<SampleScanFrom | null>(null);
  const [location, setLocation] = useState<HomepageLocation>("EU");
  const [locationOverride, setLocationOverride] = useState<HomepageLocation | null>(null);
  const manuallySelected = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let countryDefault: "california" | "eu_ie" = "eu_ie";
    function applyLocation() {
      const override = parseHomepageLocation(new URLSearchParams(window.location.search).get("loc"));
      setLocationOverride(override);
      setLocation(override ?? (countryDefault === "california" ? "US" : "EU"));
      if (!manuallySelected.current) {
        setScanFrom(resolveSampleScanFrom({ locationOverride: override, countryDefault }));
      }
      return override;
    }
    const override = applyLocation();
    window.addEventListener("popstate", applyLocation);
    const timeout = window.setTimeout(() => controller.abort(), 1_500);
    // The URL override also works with a signed-in browser, without changing auth.
    if (!override) {
      void fetch("/api/public/scan-defaults", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      }).then(async response => {
        if (!response.ok) return;
        const payload: unknown = await response.json();
        if (!active || !payload || typeof payload !== "object" || !("scanFrom" in payload)) return;
        if (payload.scanFrom === "california" || payload.scanFrom === "eu_ie") {
          countryDefault = payload.scanFrom;
          applyLocation();
        }
      }).catch(() => { /* An unavailable hint keeps Ireland. */ })
        .finally(() => window.clearTimeout(timeout));
    }
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
      window.removeEventListener("popstate", applyLocation);
    };
  }, []);

  function selectScanFrom(value: SampleScanFrom) {
    if (!isSampleScanFrom(value)) return;
    manuallySelected.current = true;
    setManualScanFrom(value);
    setScanFrom(value);
  }

  return <Preferences.Provider value={{ scanFrom, manualScanFrom, location, locationOverride, selectScanFrom }}>
    {children}
  </Preferences.Provider>;
}

export function HomepageAudienceLine() {
  const preferences = useHomepageScanPreferences();
  return <p className="relative top-[15px] mt-[20px] text-sm font-semibold text-sky-400">
    {homepageAudienceText(preferences?.location ?? "EU")}
  </p>;
}
