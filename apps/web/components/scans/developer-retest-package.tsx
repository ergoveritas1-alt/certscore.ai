"use client";

import { useId, useState } from "react";

export function DeveloperRetestPackage({ text }: { text: string }) {
  const id = useId();
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Developer package copied.");
    } catch {
      setExpanded(true);
      setStatus("Copy was unavailable. Select and copy the package below.");
    }
  }
  return <div className="mt-4 space-y-2">
    <button type="button" onClick={copy} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">Copy developer fix and retest package</button>
    <p role="status" aria-live="polite" className="text-xs text-zinc-600">{status}</p>
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium text-zinc-700">Preview or select the package</summary>
      <label htmlFor={id} className="sr-only">Developer fix and retest package</label>
      <textarea id={id} readOnly value={text} rows={14} className="mt-3 w-full rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs leading-5 text-zinc-800" />
    </details>
  </div>;
}
