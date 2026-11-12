"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { HOW_IT_WORKS_HIGHLIGHTS as slides, WALKTHROUGH_CHAPTERS as chapters } from "../../lib/marketing/how-it-works-walkthrough";

const focusStyle = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700";

export function HowItWorksCarousel() {
  const [active, setActive] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const slide = slides[active]!;
  const previous = () => setActive((current) => (current + slides.length - 1) % slides.length);
  const next = () => setActive((current) => (current + 1) % slides.length);

  return (
    <section id="walkthrough" aria-labelledby="walkthrough-heading" className="scroll-mt-24 border-b border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">24 report highlights · 6 chapters</p>
          <h2 id="walkthrough-heading" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">See the evidence. Know what to investigate.</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">Explore the details behind a CertScore.ai report—from cookies and consent choices to policy passages, GPC comparisons and correction steps. Select a chapter or walk through all 24 highlights.</p>
        </div>

        <div role="group" aria-label="Walkthrough chapters" className="mt-7 flex flex-wrap gap-2">
          {chapters.map((chapter, index) => (
            <button key={chapter} type="button" aria-pressed={slide.chapter === chapter} aria-controls="walkthrough-slide" onClick={() => setActive(slides.findIndex((item) => item.chapter === chapter))}
              className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium ${focusStyle} ${slide.chapter === chapter ? "border-sky-800 bg-sky-800 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-sky-500"}`}>
              <span aria-hidden="true" className="mr-2 opacity-70">{index + 1}.</span>{chapter}
            </button>
          ))}
        </div>

        <div role="region" aria-roledescription="carousel" aria-label="CertScore.ai report walkthrough" className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
              <label htmlFor="walkthrough-select" className="text-xs font-medium text-slate-600">Jump to a highlight</label>
              <select id="walkthrough-select" value={active} onChange={(event) => setActive(Number(event.target.value))} className={`min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 ${focusStyle}`}>
                {chapters.map((chapter) => <optgroup key={chapter} label={chapter}>{slides.map((item, index) => item.chapter === chapter ? <option key={item.id} value={index}>{String(index + 1).padStart(2, "0")} · {item.title}</option> : null)}</optgroup>)}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2" role="group" aria-label="Highlight navigation">
              <button type="button" aria-label="Previous highlight" onClick={previous} className={`h-11 w-11 rounded-full border border-slate-300 text-xl text-slate-700 hover:bg-sky-50 ${focusStyle}`}>←</button>
              <span className="w-16 text-center font-mono text-sm text-slate-600">{String(active + 1).padStart(2, "0")} / {slides.length}</span>
              <button type="button" aria-label="Next highlight" onClick={next} className={`h-11 w-11 rounded-full border border-slate-300 text-xl text-slate-700 hover:bg-sky-50 ${focusStyle}`}>→</button>
            </div>
          </div>
          <div id="walkthrough-slide" role="group" aria-roledescription="slide" aria-label={`${active + 1} of ${slides.length}: ${slide.title}`} className="grid lg:grid-cols-[0.85fr_1.55fr]">
            <div className="p-6 sm:p-7" aria-live="polite" aria-atomic="true">
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">{slide.chapter}</p>
              <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-slate-950">{slide.title}</h3>
              <p className="mt-4 text-sm leading-7 text-slate-600">{slide.description}</p>
              <p className="mt-5 border-l-2 border-emerald-500 pl-3 text-sm font-medium leading-6 text-slate-800">{slide.takeaway}</p>
            </div>
            <figure className="min-w-0 border-t border-slate-200 bg-[linear-gradient(145deg,#e8f3fb,#f8fafc_60%,#edf8f4)] p-4 sm:p-6 lg:border-l lg:border-t-0">
              <div key={slide.id} tabIndex={0} role="region" aria-label={`${slide.title} screenshot; scroll to inspect`} className={`flex h-[300px] items-start overflow-auto rounded-xl border border-slate-200 bg-white sm:h-[410px] ${focusStyle}`}>
                <Image src={slide.src} alt={slide.alt} width={slide.width} height={slide.height} sizes="(min-width: 1024px) 640px, (min-width: 640px) 90vw, 100vw" className="mx-auto my-auto h-auto w-full shrink-0" style={{ maxWidth: slide.width }} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-600">{slide.height > 700 ? "Scroll inside the image for more detail." : "Actual report screenshot"}</p>
                <button type="button" onClick={() => { setEnlarged(true); dialog.current?.showModal(); }} className={`min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-sky-800 hover:bg-sky-50 ${focusStyle}`}>Enlarge screenshot ↗</button>
              </div>
              <figcaption className="mt-2 text-xs leading-5 text-slate-600">Owned test site · {slide.source.label} · scan dated {slide.source.date}. <a href={slide.source.href} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-800 underline underline-offset-2">Open source report<span className="sr-only"> (new tab)</span></a></figcaption>
            </figure>
          </div>
        </div>

        <details className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <summary className={`cursor-pointer text-sm font-semibold text-slate-800 ${focusStyle}`}>Browse all 24 report highlights</summary>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slides.map((item, index) => <li key={item.id}><button type="button" aria-pressed={active === index} aria-controls="walkthrough-slide" onClick={() => { setActive(index); document.getElementById("walkthrough-select")?.focus({ preventScroll: true }); document.getElementById("walkthrough")?.scrollIntoView({ block: "start" }); }} className={`flex min-h-16 w-full items-start gap-3 rounded-xl border p-3 text-left text-sm ${focusStyle} ${active === index ? "border-sky-600 bg-sky-50 text-sky-900" : "border-slate-200 text-slate-700 hover:border-sky-400"}`}><span className="font-mono text-xs leading-5 text-sky-700">{String(index + 1).padStart(2, "0")}</span><span>{item.title}</span></button></li>)}
          </ol>
        </details>
        <p className="mt-5 text-sm leading-6 text-slate-500">Screenshots show the current report interface using retained evidence from CertScore.ai’s owned test pages. Available detail depends on the scanned page, supported controls and capture coverage.</p>
      </div>

      <dialog ref={dialog} onClose={() => setEnlarged(false)} aria-labelledby="walkthrough-image-title" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-6xl overflow-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/75">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <h2 id="walkthrough-image-title" className="text-sm font-semibold text-slate-950">{String(active + 1).padStart(2, "0")} · {slide.title}</h2>
          <button autoFocus type="button" onClick={() => dialog.current?.close()} className={`min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50 ${focusStyle}`}>Close</button>
        </div>
        {enlarged && <div className="p-3 sm:p-6"><div tabIndex={0} role="region" aria-label="Enlarged screenshot; scroll to inspect" className={`overflow-auto ${focusStyle}`}><Image src={slide.src} alt={slide.alt} width={slide.width} height={slide.height} sizes="(min-width: 1200px) 1100px, (min-width: 640px) 95vw, 600px" className="mx-auto h-auto w-full min-w-[560px]" style={{ maxWidth: slide.width }} /></div><p className="mt-4 text-center text-xs text-slate-600">Scroll to inspect · Owned test-site report · {slide.source.date}</p></div>}
      </dialog>
    </section>
  );
}
