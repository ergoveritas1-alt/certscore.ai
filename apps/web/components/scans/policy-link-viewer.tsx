"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Displays an existing retained reference; never discovers or fetches a policy. */
export function PolicyLinkViewer({ sourceUrl }: { sourceUrl: string }) {
  let href: string;
  try {
    if (sourceUrl.length > 2048) return null;
    const url = new URL(sourceUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    href = url.href;
  } catch { return null; }
  return <PolicyLinkDialog href={href} />;
}

function PolicyLinkDialog({ href }: { href: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; trigger.current?.focus(); };
  }, [open]);
  return <>
    <button ref={trigger} type="button" aria-label="View privacy-policy link" aria-haspopup="dialog" title="View privacy-policy link"
      className="inline-flex h-[1.625rem] w-[1.625rem] shrink-0 items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
      onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}>
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="8.5" cy="8.5" r="4.5" /><path d="m12 12 4 4M6.5 8.5h4M8.5 6.5v4" />
      </svg>
    </button>
    {open ? createPortal(<dialog ref={dialog} aria-labelledby={titleId}
      onCancel={() => setOpen(false)} onClose={() => setOpen(false)}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]");
        const first = controls[0], last = controls[controls.length - 1];
        if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus();
        }
      }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/50">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <h2 id={titleId} className="text-sm font-semibold">Privacy-policy link</h2>
        <button type="button" aria-label="Close privacy-policy link" autoFocus onClick={() => setOpen(false)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </header>
      <div className="space-y-3 p-4">
        <p className="text-xs text-zinc-600">Link captured during this scan.</p>
        <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
          className="block break-all rounded text-sm text-sky-700 underline underline-offset-4 hover:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{href}</a>
        <p className="text-xs text-zinc-500">Opens in a new tab.</p>
      </div>
    </dialog>, document.body) : null}
  </>;
}
