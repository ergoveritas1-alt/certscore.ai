"use client";

import React from "react";
import { CopyJsonButton } from "./copy-json-button";

type EvidenceJsonBlockProps = {
  className?: string;
  payload: string;
  preClassName?: string;
};

export function EvidenceJsonBlock({
  className = "relative w-full max-w-full min-w-0 overflow-hidden rounded-lg bg-slate-950",
  payload,
  preClassName = "max-h-72 max-w-full min-w-0 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] px-3 py-3 pr-12 text-[11px] leading-5 text-slate-100"
}: EvidenceJsonBlockProps) {
  return (
    <div className={className}>
      <CopyJsonButton
        payload={payload}
        label="Copy evidence JSON"
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-200 shadow-sm transition-colors hover:border-slate-500 hover:text-white"
      />
      <pre className={preClassName}>{payload}</pre>
    </div>
  );
}
