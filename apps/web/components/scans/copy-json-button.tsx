"use client";

import React, { useEffect, useState } from "react";

type CopyJsonButtonProps = {
  payload: string;
  className?: string;
  label?: string;
};

export function CopyJsonButton({
  payload,
  className = "absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:text-slate-950",
  label = "Copy JSON"
}: CopyJsonButtonProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(payload);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setFailed(true); setCopied(false); }
  }

  if (!mounted) {
    return <span aria-hidden="true" className={`scan-report-button ${className}`} />;
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`scan-report-button ${className}`}
      aria-label={failed ? "Copy failed. Try again or select the text." : copied ? "Copied" : label}
      title={failed ? "Copy failed. Try again or select the text." : copied ? "Copied" : label}
    >
      {copied ? (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="10" height="10" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}
