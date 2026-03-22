"use client";

import { useState } from "react";

type ValidationFindingJsonPaneProps = {
  payload: string;
};

export function ValidationFindingJsonPane({ payload }: ValidationFindingJsonPaneProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:text-slate-950"
        aria-label="Copy finding JSON"
        title={copied ? "Copied" : "Copy JSON"}
      >
        {copied ? (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
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
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="10" height="10" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </button>
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-white p-3 pr-14 text-xs text-slate-600">
        {payload}
      </pre>
    </div>
  );
}
