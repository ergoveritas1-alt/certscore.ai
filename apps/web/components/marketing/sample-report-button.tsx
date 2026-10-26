"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@website-signal-risk-scanner/ui";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../lib/marketing/sample-report";
import { parseHomepageLocation } from "../../lib/marketing/homepage-location";
import { useHomepageScanPreferences } from "./homepage-scan-preferences";

export function SampleReportButton({
  className, label = "View sample report", variant = "primary",
}: { className?: string; label?: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const preferences = useHomepageScanPreferences();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openSampleReport() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    // Send explicit choices only; the server resolves country even when a
    // visitor clicks before the initial country hint arrives.
    const body = JSON.stringify({
      scanFrom: preferences?.manualScanFrom ?? null,
      loc: parseHomepageLocation(new URLSearchParams(window.location.search).get("loc")),
    });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch("/api/public/sample-report", {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" }, body, signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!payload || typeof payload !== "object") throw new Error("The sample report could not be opened. Please try again.");
        if (!response.ok) {
          if ("code" in payload && payload.code === "sample_report_busy" && attempt < 2) {
            await new Promise(resolve => window.setTimeout(resolve, 1_000));
            continue;
          }
          throw new Error("error" in payload && typeof payload.error === "string"
            ? payload.error : "The sample report could not be opened. Please try again.");
        }
        const destination = "scanUrl" in payload ? payload.scanUrl : null;
        if (typeof destination !== "string" || !(destination === AUTHENTIC_SAMPLE_REPORT_URL
          || /^\/scan\/[0-9a-f-]{36}$/i.test(destination))) {
          throw new Error("The report link was unavailable. Please try again.");
        }
        router.push(destination);
        return;
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The sample report could not be opened. Please try again.");
    } finally {
      window.clearTimeout(timeout);
      submitting.current = false;
      setPending(false);
    }
  }

  return <span className="flex w-full flex-col items-start gap-2 sm:w-auto">
    <Button className={className} variant={variant} type="button" disabled={pending} aria-busy={pending}
      data-analytics-cta-type="sample_report" data-analytics-event="hero_sample_report_clicked"
      onClick={() => void openSampleReport()}>
      {pending ? "Opening..." : label}
    </Button>
    {error ? <span role="alert" className="max-w-sm text-sm text-rose-200">{error}</span> : null}
  </span>;
}
