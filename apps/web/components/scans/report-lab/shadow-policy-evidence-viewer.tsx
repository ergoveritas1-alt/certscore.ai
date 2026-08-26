"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

type ShadowPolicyEvidence = {
  capturedAt: string;
  documentTitle: string;
  sourceUrl: string;
  sections: readonly {
    excerpt: string;
    heading: string;
  }[];
};

function MagnifierIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="M8.7 13.1a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="m12 12 3.7 3.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M6.9 8.6h3.6M8.7 6.8v3.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

export function ShadowPolicyEvidenceViewer({
  evidence,
  findingLabel
}: {
  evidence: ShadowPolicyEvidence;
  findingLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function openViewer(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsOpen(true);
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={`Review captured privacy policy for ${findingLabel}`}
        className="inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        onClick={openViewer}
        title="Review captured privacy policy"
        type="button"
      >
        <MagnifierIcon />
      </button>
      {isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/45 px-3 py-4 sm:px-6"
              onClick={() => setIsOpen(false)}
            >
              <div
                aria-labelledby="shadow-policy-evidence-title"
                aria-modal="true"
                className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-[#fcfcfb] shadow-2xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <header className="flex items-start justify-between gap-4 border-b border-zinc-200 bg-white px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-sky-700">Retained policy evidence</p>
                    <h2 className="mt-1 text-xl font-semibold text-zinc-950" id="shadow-policy-evidence-title">Captured privacy policy</h2>
                    <p className="mt-1 text-sm text-zinc-600"><span className="font-semibold text-zinc-800">Finding:</span> {findingLabel}</p>
                  </div>
                  <button
                    aria-label="Close captured privacy policy"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    onClick={() => setIsOpen(false)}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                  <div className="mx-auto max-w-4xl">
                    <div className="grid gap-3 border-b border-zinc-200 pb-5 text-sm text-zinc-600 sm:grid-cols-2">
                      <div><span className="block text-xs font-semibold uppercase text-zinc-400">Document</span><span className="mt-1 block font-medium text-zinc-900">{evidence.documentTitle}</span></div>
                      <div><span className="block text-xs font-semibold uppercase text-zinc-400">Captured</span><span className="mt-1 block font-mono text-xs text-zinc-700">{evidence.capturedAt}</span></div>
                    </div>
                    <p className="mt-5 text-sm leading-6 text-zinc-600">Scanner evidence captured at scan time, not a live fetch of the current policy page.</p>
                    <a className="mt-2 inline-block break-all text-sm font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-900" href={evidence.sourceUrl} rel="noreferrer" target="_blank">{evidence.sourceUrl}</a>
                    <div className="mt-6 border-t border-zinc-200">
                      {evidence.sections.map((section, index) => (
                        <section className="grid gap-3 border-b border-zinc-200 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)]" key={section.heading}>
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sky-200 bg-sky-50 font-mono text-xs font-semibold text-sky-700">{String(index + 1).padStart(2, "0")}</span>
                          <div>
                            <h3 className="text-sm font-semibold text-zinc-950">{section.heading}</h3>
                            <p className="mt-2 text-sm leading-7 text-zinc-700">{section.excerpt}</p>
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
