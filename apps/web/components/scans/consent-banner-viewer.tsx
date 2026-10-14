"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ConsentBannerPreview } from "../../lib/scans/visual-evidence";

export function ConsentBannerViewer({ preview }: { preview: ConsentBannerPreview }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
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
  const { crop } = preview;
  return <>
    <button ref={trigger} type="button" aria-label="View captured cookie banner" aria-haspopup="dialog"
      title="View captured cookie banner"
      className="inline-flex h-[1.625rem] w-[1.625rem] shrink-0 items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
      onClick={event => { event.preventDefault(); event.stopPropagation(); setFailed(false); setOpen(true); }}>
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="8.5" cy="8.5" r="4.5" /><path d="m12 12 4 4M6.5 8.5h4M8.5 6.5v4" />
      </svg>
    </button>
    {open ? createPortal(<dialog ref={dialog} aria-labelledby={titleId}
      onCancel={() => setOpen(false)} onClose={() => setOpen(false)}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
        const first = controls[0], last = controls[controls.length - 1];
        if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus();
        }
      }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/50">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <h2 id={titleId} className="text-sm font-semibold">Captured cookie banner</h2>
        <button type="button" aria-label="Close captured cookie banner" autoFocus onClick={() => setOpen(false)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </header>
      <div className="p-3 sm:p-4">
        {failed ? <p className="py-8 text-center text-sm text-zinc-600">The captured banner is unavailable.</p> :
          <svg role="img" aria-label="Cookie banner cropped from the retained scan screenshot" viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
            className="block h-auto w-full overflow-hidden rounded-md" style={{ aspectRatio: `${crop.width} / ${crop.height}` }}>
            <image href={preview.href} width={crop.imageWidth} height={crop.imageHeight} onError={() => setFailed(true)} />
          </svg>}
      </div>
    </dialog>, document.body) : null}
  </>;
}
