"use client";
import React, { useId } from "react";
import { CopyJsonButton } from "./copy-json-button";

export function formatInventoryNamePreview(name: string, maxCharacters = 10) {
  const characters = Array.from(name);
  return characters.length > maxCharacters
    ? `${characters.slice(0, maxCharacters).join("")}...`
    : name;
}

export function InventoryNameDisclosure({
  className = "",
  fullName,
  compact = false,
}: {
  className?: string;
  fullName: string;
  compact?: boolean;
}) {
  const popoverId = useId();
  if (compact) {
    const preview = formatInventoryNamePreview(fullName, 25);
    if (preview === fullName) return <span className={`block min-w-0 truncate ${className}`} title={fullName}>{fullName}</span>;
    return <><button type="button" popoverTarget={popoverId} title={fullName} aria-label={`Show full retained name: ${fullName}`} className={`block max-w-full truncate text-left text-sky-700 underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${className}`}>{preview}</button><div id={popoverId} popover="auto" className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-4 text-slate-800 shadow-xl"><div className="mb-3 flex items-center justify-between gap-2"><strong className="text-xs">Full resource name</strong><div className="flex items-center gap-2"><CopyJsonButton payload={fullName} label="Copy full resource name" className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100"/><button type="button" popoverTarget={popoverId} popoverTargetAction="hide" aria-label="Close full resource name" className="h-7 w-7 rounded hover:bg-slate-100">×</button></div></div><p className="select-text whitespace-normal break-all text-sm">{fullName}</p></div></>;
  }
  const preview = formatInventoryNamePreview(fullName);
  if (preview === fullName) {
    return <span className={`font-mono ${className}`.trim()} title={fullName}>{fullName}</span>;
  }

  return (
    <details className={className}>
      <summary
        aria-label={`Show full retained name: ${fullName}`}
        className="w-fit cursor-pointer list-none font-mono text-sky-700 underline decoration-dotted underline-offset-2 marker:hidden hover:text-sky-900 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden"
        title={`Show full name: ${fullName}`}
      >
        <span aria-hidden="true">{preview}</span>
      </summary>
      <div className="mt-1 whitespace-normal break-all rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] leading-4 text-slate-800">
        {fullName}
      </div>
    </details>
  );
}
