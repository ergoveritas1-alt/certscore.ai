"use client";
import { useEffect, useState } from "react";
import { FullSiteScanNotice, type FullSiteScanNoticeData } from "./full-site-scan-notice";
import { fullSiteIsRunning, fullSiteProgressResponseSchema } from "../../lib/scans/full-site-progress";

export function LiveFullSiteScanNotice({ scan: initial, reportPage = false }: { scan: FullSiteScanNoticeData; reportPage?: boolean }) {
  const [scan, setScan] = useState(initial);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    setScan(initial);
    setStale(false);
    if (!fullSiteIsRunning(initial)) return;
    let disposed = false, terminal = false, inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let notBefore = 0;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (!disposed && !terminal && document.visibilityState === "visible") timer = setTimeout(poll, Math.max(delay, notBefore - Date.now()));
    };
    const poll = async () => {
      if (disposed || terminal || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      let delay = 15000;
      try {
        const response = await fetch(`/api/scans/${initial.scanId}/full-site/progress`, {cache:"no-store", signal:controller.signal});
        if ([401,403,404].includes(response.status)) { terminal = true; throw new Error("Status unavailable"); }
        if (!response.ok) {
          const retry = response.headers.get("Retry-After");
          const seconds = Number(retry);
          const retryMs = retry ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now()) : 0;
          if (Number.isFinite(retryMs)) notBefore = Date.now() + Math.max(0, retryMs);
          throw new Error("Status check failed");
        }
        const result = fullSiteProgressResponseSchema.parse(await response.json());
        if (result.scanId !== initial.scanId) throw new Error("Unexpected scan");
        if (disposed) return;
        terminal = !fullSiteIsRunning(result);
        failures = 0;
        setScan(previous => ({...previous, ...result}));
        setStale(false);
      } catch {
        if (!disposed && document.visibilityState === "visible") {
          setStale(true);
          delay = Math.min(120000, 15000 * 2 ** Math.min(++failures, 3));
        }
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        schedule(delay);
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") controller?.abort();
      else schedule(15000);
    };
    document.addEventListener("visibilitychange", visibility);
    schedule(15000);
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visibility); };
  }, [initial]);
  return <FullSiteScanNotice scan={scan} statusStale={stale} reportPage={reportPage} />;
}
