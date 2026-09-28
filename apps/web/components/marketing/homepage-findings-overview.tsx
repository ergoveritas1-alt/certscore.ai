"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { HOMEPAGE_SHOWCASE } from "../../lib/marketing/homepage-showcase";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../lib/marketing/sample-report";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700";

export function HomepageFindingsOverview() {
  const [active, setActive] = useState(0);
  const [showJson, setShowJson] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const slide = HOMEPAGE_SHOWCASE[active]!;
  const select = (index: number) => {
    setActive((index + HOMEPAGE_SHOWCASE.length) % HOMEPAGE_SHOWCASE.length);
    setShowJson(false);
  };
  const previewLabel = showJson ? "Actual report export · selected fields" : slide.code?.label ?? "Actual scan report · click to enlarge";

  return (
    <section id="findings-overview" aria-labelledby="showcase-heading" className="scroll-mt-24 bg-white px-5 py-16 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Findings overview</p>
            <h2 id="showcase-heading" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">See what’s inside a scan.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">Explore real report screens and structured evidence from our ErgoVeritas test page.</p>
          </div>
          <a href={AUTHENTIC_SAMPLE_REPORT_URL} className={`inline-flex min-h-11 shrink-0 items-center gap-2 font-semibold text-sky-700 hover:underline ${focus}`}>Open sample report <span aria-hidden="true">↗</span></a>
        </div>

        <label className="mt-6 block text-sm font-medium text-slate-600 sm:hidden">
          Explore a feature
          <select aria-label="Choose a feature" value={active} onChange={(event) => select(Number(event.target.value))} className={`mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900 ${focus}`}>
            {HOMEPAGE_SHOWCASE.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.label}</option>)}
          </select>
        </label>
        <div role="group" aria-label="Choose a feature" className="mt-8 hidden flex-wrap gap-2 pb-3 sm:flex">
          {HOMEPAGE_SHOWCASE.map((item, index) => (
            <button key={item.id} type="button" aria-pressed={active === index} aria-controls="showcase-slide" onClick={() => select(index)} className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${focus} ${active === index ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-sky-400 hover:text-sky-800"}`}>
              {item.label}
            </button>
          ))}
        </div>

        <div id="showcase-slide" role="region" aria-roledescription="carousel" aria-label="CertScore feature tour" onKeyDown={(event) => {
          if (dialog.current?.open || (event.target as HTMLElement).closest("pre") || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
          event.preventDefault();
          select(active + (event.key === "ArrowRight" ? 1 : -1));
        }} className="mt-3 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_70px_-35px_rgba(15,23,42,0.25)]">
          <div className="grid lg:grid-cols-[1.45fr_1fr]">
            <div className="min-w-0 border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
              <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-6">
                <p className="text-xs font-medium text-slate-500">{previewLabel}</p>
                {slide.json !== undefined && (
                  <div role="group" aria-label="Preview format" className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                    <button type="button" aria-pressed={!showJson} onClick={() => setShowJson(false)} className={`min-h-8 rounded-md px-3 ${focus} ${!showJson ? "bg-slate-900 text-white" : "text-slate-600"}`}>{slide.code ? "Request" : "Report"}</button>
                    <button type="button" aria-pressed={showJson} onClick={() => setShowJson(true)} className={`min-h-8 rounded-md px-3 ${focus} ${showJson ? "bg-slate-900 text-white" : "text-slate-600"}`}>Report JSON</button>
                  </div>
                )}
              </div>
              <div className="flex h-[320px] items-center justify-center p-4 sm:h-[470px] sm:p-6">
                {showJson || slide.code ? (
                  <pre tabIndex={0} aria-label={previewLabel} className={`h-full w-full overflow-auto rounded-xl bg-slate-950 p-5 text-xs leading-6 text-sky-100 sm:text-sm ${focus}`}><code>{showJson ? JSON.stringify(slide.json, null, 2) : slide.code?.content}</code></pre>
                ) : slide.image ? (
                  <button type="button" onClick={() => dialog.current?.showModal()} aria-label={`Enlarge ${slide.label} report screenshot`} className={`group relative flex h-full w-full items-center justify-center rounded-xl ${focus}`}>
                    <Image key={slide.image.name} src={`/showcase/test2/${slide.image.name}.webp`} alt={slide.image.alt} width={slide.image.width} height={slide.image.height} unoptimized className="max-h-full w-auto max-w-full rounded-lg border border-slate-200 bg-white object-contain shadow-sm" />
                    <span className="absolute bottom-2 right-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm group-hover:border-sky-400">Enlarge ↗</span>
                  </button>
                ) : null}
              </div>
              <p className="border-t border-slate-200 px-4 py-3 text-xs leading-5 text-slate-500 sm:px-6">Owned test page · ergoveritas.com/test2.html · 28 Sep 2026 · California</p>
            </div>

            <div className="flex min-w-0 flex-col p-6 sm:p-8">
              <div aria-live="polite" aria-atomic="true">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">{slide.category}</p>
                <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-3xl">{slide.title}</h3>
                <p className="mt-4 text-base leading-7 text-slate-600">{slide.description}</p>
                <ul className="mt-5 space-y-2 text-sm leading-6 text-slate-700">
                  {slide.highlights.map((item) => <li key={item} className="flex gap-3"><span aria-hidden="true" className="text-sky-600">✓</span>{item}</li>)}
                </ul>
                <p className="mt-6 border-l-2 border-sky-400 pl-4 text-sm leading-6 text-slate-600">{slide.result}</p>
              </div>
              <a href={slide.href} className={`mt-6 inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-sky-700 hover:underline ${focus}`}>{slide.linkLabel} <span aria-hidden="true">↗</span></a>
              <div className="mt-auto flex items-center justify-between gap-4 pt-6">
                <span className="text-xs tabular-nums text-slate-500">{String(active + 1).padStart(2, "0")} / {HOMEPAGE_SHOWCASE.length} features</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => select(active - 1)} aria-label="Previous feature" className={`h-11 w-11 rounded-full border border-slate-200 text-xl text-slate-700 hover:border-sky-400 hover:bg-sky-50 ${focus}`}>←</button>
                  <button type="button" onClick={() => select(active + 1)} aria-label="Next feature" className={`h-11 w-11 rounded-full border border-slate-200 text-xl text-slate-700 hover:border-sky-400 hover:bg-sky-50 ${focus}`}>→</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Screenshots and report JSON are from one completed test scan. Interface examples are labeled. Findings describe retained observations, not a determination of compliance.</p>
      </div>

      <dialog ref={dialog} aria-labelledby="showcase-image-title" className="m-auto max-h-[94vh] w-[calc(100%-2rem)] max-w-6xl overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl backdrop:bg-slate-950/70 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 id="showcase-image-title" className="font-semibold text-slate-900">{slide.label} · actual test2 report</h3>
          <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Close enlarged screenshot" className={`min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-medium ${focus}`}>Close ×</button>
        </div>
        {slide.image && <Image src={`/showcase/test2/${slide.image.name}.webp`} alt={slide.image.alt} width={slide.image.width} height={slide.image.height} unoptimized className="mx-auto h-auto max-h-[75vh] w-auto max-w-full object-contain" />}
        <p className="mt-4 text-xs text-slate-500">28 Sep 2026 · California · Scan d96df06d-3e94-4896-8346-1a026d68e5af</p>
      </dialog>
    </section>
  );
}
