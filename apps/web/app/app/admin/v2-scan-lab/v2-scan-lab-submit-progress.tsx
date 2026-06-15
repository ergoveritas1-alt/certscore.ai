"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type V2ScanLabSubmitButtonProps = {
  className?: string;
  idleContent: string;
  pendingContent: string;
};

const SUBMIT_RECOVERY_TIMEOUT_MS = 12 * 60 * 1_000;
const SUBMIT_IDLE_RECOVERY_TIMEOUT_MS = 3_000;
const DEFAULT_SCAN_ESTIMATE_MS = 28_000;

type ScanProgressEstimate = {
  estimatedDurationMs: number;
  modeLabel: string;
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
      if (scanStartedInputRef.current) {
        scanStartedInputRef.current.value = String(submittedAtMs);
      }
      form.querySelectorAll("details[open]").forEach((details) => {
        details.removeAttribute("open");
      });
      form.dataset.submitted = "true";
      setProgressEstimate(estimateScanProgress(form));
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
      setSubmitted(false);
      setStartedAtMs(null);
    }, SUBMIT_RECOVERY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [submitted]);

  useEffect(() => {
    if (!submitted || pending) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const form = rootRef.current?.closest("form");
      if (form) {
        delete form.dataset.submitted;
      }
      setSubmitted(false);
      setStartedAtMs(null);
    }, SUBMIT_IDLE_RECOVERY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pending, submitted]);

  const elapsedSeconds = startedAtMs ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000)) : 0;
  const progressValue = useMemo(() => {
    return calculateDisplayedScanProgress({
      active,
      elapsedMs: elapsedSeconds * 1_000,
      estimatedDurationMs: progressEstimate.estimatedDurationMs,
    });
  }, [active, elapsedSeconds, progressEstimate.estimatedDurationMs]);
  const progressPhase = active
    ? describeScanProgressPhase({
        elapsedMs: elapsedSeconds * 1_000,
        estimatedDurationMs: progressEstimate.estimatedDurationMs,
      })
    : "";

  return (
    <span ref={rootRef} className="contents">
      <input ref={scanStartedInputRef} name="scanStartedAtMs" type="hidden" />
      <Button className={className} disabled={active} type="submit" variant="primary">
        {active ? pendingContent : idleContent}
      </Button>
      {active ? (
        <div className="absolute left-3 right-3 top-full z-20 mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
            <span className="min-w-0 truncate">v2 {progressEstimate.modeLabel}: {progressPhase}</span>
            <span>{progressValue}% complete | {elapsedSeconds}s elapsed</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-sky-500 transition-[width] duration-700"
              style={{ width: `${progressValue}%` }}
            />
          </div>
        </div>
      ) : null}
    </span>
  );
}

export function calculateDisplayedScanProgress(input: {
  active: boolean;
  elapsedMs: number;
  estimatedDurationMs: number;
}) {
  if (!input.active) {
    return 0;
  }

  const estimatedDurationMs = Math.max(6_000, input.estimatedDurationMs);
  const ratio = Math.max(0, input.elapsedMs) / estimatedDurationMs;
  const progress = ratio <= 0.18
    ? interpolate(ratio, 0, 0.18, 4, 22)
    : ratio <= 0.55
      ? interpolate(ratio, 0.18, 0.55, 22, 63)
      : ratio <= 0.88
        ? interpolate(ratio, 0.55, 0.88, 63, 84)
        : ratio <= 1.35
          ? interpolate(ratio, 0.88, 1.35, 84, 93)
          : 93 + (1 - Math.exp(-(ratio - 1.35) / 1.6)) * 3;

  return Math.max(4, Math.min(96, Math.round(progress)));
}

export function describeScanProgressPhase(input: {
  elapsedMs: number;
  estimatedDurationMs: number;
}) {
  const ratio = Math.max(0, input.elapsedMs) / Math.max(6_000, input.estimatedDurationMs);
  if (ratio < 0.16) {
    return "starting browser";
  }
  if (ratio < 0.48) {
    return "capturing page evidence";
  }
  if (ratio < 0.74) {
    return "running consent paths";
  }
  if (ratio < 1.05) {
    return "reviewing signals";
  }
  return "finalizing artifacts";
}

function estimateScanProgress(form: HTMLFormElement): ScanProgressEstimate {
  const formData = new FormData(form);
  const profileValue = String(formData.get("profile") ?? "full");
  const consentDag = formData.get("consentDag") === "yes";
  const profileEstimateMs = profileValue === "tiny"
    ? 9_000
    : profileValue === "standard"
      ? 18_000
      : profileValue === "policy"
        ? 20_000
        : profileValue === "consent"
          ? 24_000
          : 32_000;
  const estimatedDurationMs = consentDag && (profileValue === "consent" || profileValue === "full")
    ? Math.max(18_000, profileEstimateMs - 6_000)
    : profileEstimateMs;
  const modeLabel = consentDag && (profileValue === "consent" || profileValue === "full")
    ? "planned DAG scan"
    : `${profileValue} scan`;
  return { estimatedDurationMs, modeLabel };
}

function interpolate(
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number,
) {
  if (inputMax <= inputMin) {
    return outputMax;
  }
  const clampedRatio = Math.max(0, Math.min(1, (value - inputMin) / (inputMax - inputMin)));
  return outputMin + (outputMax - outputMin) * clampedRatio;
}
