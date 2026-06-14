"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type V2ScanLabSubmitButtonProps = {
  className?: string;
  idleContent: string;
  pendingContent: string;
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

  const elapsedSeconds = startedAtMs ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000)) : 0;
  const progressValue = useMemo(() => {
    if (!active) {
      return 0;
    }

    const projected = 100 * (1 - Math.exp(-elapsedSeconds / 55));
    return Math.max(2, Math.min(95, Math.round(projected)));
  }, [active, elapsedSeconds]);

  return (
    <span ref={rootRef} className="contents">
      <input ref={scanStartedInputRef} name="scanStartedAtMs" type="hidden" />
      <Button className={className} disabled={active} type="submit" variant="primary">
        {active ? pendingContent : idleContent}
      </Button>
      {active ? (
        <div className="absolute left-3 right-3 top-full z-20 mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
            <span>v2 scan in progress</span>
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
