"use client";

import React, { useId, useRef } from "react";

export function McpDetailsPopup({ title, trigger, children }: {
  title: string; trigger: React.ReactNode; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  return <>
    <button ref={button} type="button" aria-haspopup="dialog" aria-label={`Open ${title.toLowerCase()}`}
      className="block max-w-full truncate text-left text-xs leading-4 text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600"
      onClick={() => dialog.current?.showModal()}>{trigger} <span aria-hidden="true">↗</span></button>
    <dialog ref={dialog} aria-labelledby={headingId}
      onClose={() => button.current?.focus({ preventScroll: true })}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-0 text-left text-sm text-slate-700 shadow-xl backdrop:bg-slate-950/50">
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={headingId} className="min-w-0 text-lg font-semibold text-slate-950">{title}</h2>
          <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label={`Close ${title.toLowerCase()}`}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Close</button>
        </div>
        <div className="space-y-4 break-words whitespace-normal leading-5">{children}</div>
      </div>
    </dialog>
  </>;
}
