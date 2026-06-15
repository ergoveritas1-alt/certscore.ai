"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ScanSubmitProgressBar,
  estimateScanProgressForOptions,
  type ScanProgressEstimate
} from "../../../../components/scans/scan-submit-progress";

export {
  calculateDisplayedScanProgress,
  describeScanProgressPhase,
  estimateScanProgressForOptions
} from "../../../../components/scans/scan-submit-progress";

type V2ScanLabSubmitButtonProps = {
  className?: string;
  idleContent: string;
  pendingContent: string;
};

const SUBMIT_RECOVERY_TIMEOUT_MS = 12 * 60 * 1_000;
const DEFAULT_SCAN_ESTIMATE_MS = 28_000;
const SUBMITTING_DATA_ATTRIBUTE = "v2ScanLabSubmitting";

type V2ScanLabSubmitEventDetail = {
  estimatedDurationMs: number;
  modeLabel: string;
  submittedAtMs: number;
  url: string;
};

type V2ScanLabPendingOverlayProps = {
  artifactStatus?: string;
  scanStatus?: string;
  selectedChainKey?: string;
};

export function V2ScanLabSubmitControl({
  className,
  idleContent,
  pendingContent,
}: V2ScanLabSubmitButtonProps) {
  const { pending } = useFormStatus();
  const scanStartedInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [progressEstimate, setProgressEstimate] = useState<ScanProgressEstimate>({
    estimatedDurationMs: DEFAULT_SCAN_ESTIMATE_MS,
    modeLabel: "full scan",
  });
  const active = pending || submitted;

  useEffect(() => {
    const root = rootRef.current;
    const form = root?.closest("form");
    if (!form) {
      return;
    }

    const handleSubmit = () => {
      const submittedAtMs = Date.now();
      const estimate = estimateScanProgress(form);
      const submittedUrl = getSubmittedUrl(form);
      if (scanStartedInputRef.current) {
        scanStartedInputRef.current.value = String(submittedAtMs);
      }
      form.querySelectorAll("details[open]").forEach((details) => {
        details.removeAttribute("open");
      });
      form.dataset.submitted = "true";
      document.documentElement.dataset[SUBMITTING_DATA_ATTRIBUTE] = "true";
      window.dispatchEvent(new CustomEvent<V2ScanLabSubmitEventDetail>("v2-scan-lab-submit", {
        detail: {
          estimatedDurationMs: estimate.estimatedDurationMs,
          modeLabel: estimate.modeLabel,
          submittedAtMs,
          url: submittedUrl,
        },
      }));
      setProgressEstimate(estimate);
      setSubmitted(true);
      setStartedAtMs((current) => current ?? submittedAtMs);
    };

    form.addEventListener("submit", handleSubmit);
    return () => {
      form.removeEventListener("submit", handleSubmit);
    };
  }, []);

  useEffect(() => {
    if (!active) {
      setStartedAtMs(null);
      return;
    }

    setStartedAtMs((current) => current ?? Date.now());
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [active]);

  useEffect(() => {
    if (!submitted) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const form = rootRef.current?.closest("form");
      if (form) {
        delete form.dataset.submitted;
      }
      delete document.documentElement.dataset[SUBMITTING_DATA_ATTRIBUTE];
      setSubmitted(false);
      setStartedAtMs(null);
    }, SUBMIT_RECOVERY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [submitted]);

  return (
    <span ref={rootRef} className="contents">
      <input ref={scanStartedInputRef} name="scanStartedAtMs" type="hidden" />
      <Button className={className} disabled={active} type="submit" variant="primary">
        {active ? pendingContent : idleContent}
      </Button>
      {active ? (
        <div className="absolute left-3 right-3 top-full z-20 mt-2">
          <ScanSubmitProgressBar
            active={active}
            compact
            nowMs={nowMs}
            progressEstimate={progressEstimate}
            startedAtMs={startedAtMs}
          />
        </div>
      ) : null}
    </span>
  );
}

export function V2ScanLabPendingOverlay({
  artifactStatus = "",
  scanStatus = "",
  selectedChainKey = "",
}: V2ScanLabPendingOverlayProps) {
  const [pendingScan, setPendingScan] = useState<V2ScanLabSubmitEventDetail | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const clearPendingScan = () => {
    delete document.documentElement.dataset[SUBMITTING_DATA_ATTRIBUTE];
    setPendingScan(null);
  };

  useEffect(() => {
    return () => {
      delete document.documentElement.dataset[SUBMITTING_DATA_ATTRIBUTE];
    };
  }, []);

  useEffect(() => {
    if (!pendingScan || !shouldResetV2ScanLabPendingOverlay({ artifactStatus, scanStatus, selectedChainKey })) {
      return;
    }
    clearPendingScan();
  }, [artifactStatus, pendingScan, scanStatus, selectedChainKey]);

  useEffect(() => {
    const handleSubmit = (event: Event) => {
      const detail = (event as CustomEvent<V2ScanLabSubmitEventDetail>).detail;
      setPendingScan(detail);
      setNowMs(Date.now());
    };
    window.addEventListener("v2-scan-lab-submit", handleSubmit);
    return () => {
      window.removeEventListener("v2-scan-lab-submit", handleSubmit);
    };
  }, []);

  useEffect(() => {
    if (!pendingScan) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    const timeoutId = window.setTimeout(() => {
      clearPendingScan();
    }, SUBMIT_RECOVERY_TIMEOUT_MS);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [pendingScan]);

  if (!pendingScan) {
    return (
      <style>{`
        html[data-v2-scan-lab-submitting="true"] [data-v2-scan-lab-current-artifact] {
          display: none !important;
        }
      `}</style>
    );
  }

  return (
    <>
      <style>{`
        html[data-v2-scan-lab-submitting="true"] [data-v2-scan-lab-current-artifact] {
          display: none !important;
        }
      `}</style>
      <section
        aria-live="polite"
        className="rounded-3xl border border-sky-200 bg-white p-6 shadow-[0_18px_60px_-32px_rgba(14,165,233,0.5)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Scan in progress</p>
            <h2 className="mt-2 min-w-0 break-words text-3xl font-semibold tracking-tight text-slate-950">
              Scan: {pendingScan.url || "requested site"}
            </h2>
          </div>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-4 py-1.5 text-sm font-semibold text-sky-800">
            Scanning
          </span>
        </div>
        <ScanSubmitProgressBar
          active
          nowMs={nowMs}
          progressEstimate={pendingScan}
          startedAtMs={pendingScan.submittedAtMs}
        />
      </section>
    </>
  );
}

function estimateScanProgress(form: HTMLFormElement): ScanProgressEstimate {
  const formData = new FormData(form);
  const profileValue = String(formData.get("profile") ?? "full");
  const consentDag = formData.get("consentDag") === "yes";
  return estimateScanProgressForOptions({ consentDag, profileValue });
}

function getSubmittedUrl(form: HTMLFormElement) {
  const formData = new FormData(form);
  return String(formData.get("url") ?? "").trim();
}

export function shouldResetV2ScanLabPendingOverlay(input: {
  artifactStatus?: string;
  scanStatus?: string;
  selectedChainKey?: string;
}) {
  if (input.artifactStatus === "ready") {
    return true;
  }
  if (input.scanStatus === "complete" || input.scanStatus === "failed" || input.scanStatus === "invalid") {
    return true;
  }
  return Boolean(input.selectedChainKey?.trim());
}
