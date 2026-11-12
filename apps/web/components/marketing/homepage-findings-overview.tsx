"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { HOMEPAGE_SHOWCASE, PRODUCT_GROUPS } from "../../lib/marketing/homepage-showcase";
import { SampleReportButton } from "./sample-report-button";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500";

function ProductIcon({ name, className = "h-6 w-6" }: { name: string; className?: string }) {
  const paths: Record<string, string> = {
    shield: "M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3ZM8 12l3 3 5-6",
    activity: "M3 12h4l3-8 4 16 3-8h4",
    evidence: "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h5",
    connect: "m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18"
  };
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.evidence} /></svg>;
}

export function HomepageFindingsOverview() {
  const [active, setActive] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const slide = HOMEPAGE_SHOWCASE[active]!;
  const group = PRODUCT_GROUPS.find((item) => item.id === slide.group)!;
  const select = (index: number) => setActive((index + HOMEPAGE_SHOWCASE.length) % HOMEPAGE_SHOWCASE.length);

  return (
    <section id="product-overview" aria-labelledby="showcase-heading" className="relative scroll-mt-24 bg-[linear-gradient(180deg,#f8fafc,#fff)] px-5 py-12 sm:px-8 sm:py-16">
      <span id="findings-overview" aria-hidden="true" className="absolute top-0 scroll-mt-24" />
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.25),transparent_60%),linear-gradient(130deg,#0f172a,#092f43)] p-6 text-white sm:p-9">
          <div aria-hidden="true" className="absolute -right-16 -top-28 h-80 w-80 rounded-full border border-sky-200/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Product overview <span className="mx-2 text-slate-500">/</span> 24 capabilities</p>
              <h2 id="showcase-heading" className="mt-4 text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">Explore the product.<br /><span className="text-sky-200">Follow the evidence.</span></h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">An Evidence-led Website Privacy Scanner for developers, DPOs, web agencies and AI agents. Review GDPR/ePrivacy and CCPA concerns, inspect the detail, and put the evidence to work.</p>
            </div>
            <SampleReportButton className="min-h-11 shrink-0 self-start border-sky-200 bg-white font-semibold text-sky-900 hover:bg-sky-50" label="Open sample report ↗" variant="secondary" />
          </div>
          <div role="group" aria-label="Product categories" className="relative mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {PRODUCT_GROUPS.map((item) => <button key={item.id} type="button" aria-pressed={slide.group === item.id} aria-controls="showcase-content" onClick={() => select(HOMEPAGE_SHOWCASE.findIndex((feature) => feature.group === item.id))} className={`group rounded-2xl border p-4 text-left transition-colors ${focus} ${slide.group === item.id ? "border-white bg-white text-slate-950 shadow-lg" : "border-white/15 bg-white/5 text-white hover:border-sky-300/60 hover:bg-white/10"}`}>
              <div className="flex items-center justify-between gap-2"><ProductIcon name={item.icon} className={`h-6 w-6 ${slide.group === item.id ? "text-sky-700" : "text-sky-300"}`} /><span className={`text-[10px] font-semibold uppercase tracking-wider ${slide.group === item.id ? "text-slate-500" : "text-slate-400"}`}>6 features</span></div>
              <p className="mt-3 text-sm font-semibold sm:text-base">{item.label}</p>
              <p className={`mt-1 text-xs leading-5 ${slide.group === item.id ? "text-slate-600" : "text-slate-300"}`}>{item.description}</p>
            </button>)}
          </div>
        </div>

        <div role="group" aria-label={`${group.label} features`} className="mt-5 hidden grid-cols-3 gap-2 sm:grid lg:grid-cols-6">
          {HOMEPAGE_SHOWCASE.map((item, index) => item.group === slide.group ? <button key={item.id} type="button" aria-pressed={active === index} aria-controls="showcase-content" onClick={() => select(index)} className={`min-h-12 rounded-xl border px-3 py-2 text-left text-xs font-semibold ${focus} ${active === index ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-600 hover:border-sky-400"}`}><span className="mr-2 font-mono text-sky-600">{String(index + 1).padStart(2, "0")}</span>{item.label}</button> : null)}
        </div>

        <div id="showcase-slide" role="region" aria-roledescription="carousel" aria-label="CertScore.ai product overview" onKeyDown={(event) => {
          if (dialog.current?.open || (event.target as HTMLElement).closest("pre, select, [data-evidence-scroll]") || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
          event.preventDefault();
          select(active + (event.key === "ArrowRight" ? 1 : -1));
        }} className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_-38px_rgba(8,47,73,0.35)]">
          <div role="group" aria-label="Product overview navigation" className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-7">
            <div className="w-full sm:w-auto sm:min-w-80">
              <label htmlFor="product-feature-select" className="sr-only">Choose a product feature</label>
              <select id="product-feature-select" value={active} onChange={(event) => select(Number(event.target.value))} className={`min-h-11 w-full max-w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 ${focus}`}>
                {PRODUCT_GROUPS.map((item) => <optgroup key={item.id} label={item.label}>{HOMEPAGE_SHOWCASE.map((feature, index) => feature.group === item.id ? <option key={feature.id} value={index}>{String(index + 1).padStart(2, "0")} · {feature.label}</option> : null)}</optgroup>)}
              </select>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="mr-1 font-mono text-xs tabular-nums text-slate-500">{String(active + 1).padStart(2, "0")} / 24</span>
              <button type="button" onClick={() => select(active - 1)} aria-label="Previous feature" aria-controls="showcase-content" className={`h-11 w-11 rounded-full border border-slate-300 text-xl text-slate-700 hover:border-sky-400 hover:bg-sky-50 ${focus}`}>←</button>
              <button type="button" onClick={() => select(active + 1)} aria-label="Next feature" aria-controls="showcase-content" className={`h-11 w-11 rounded-full border border-sky-800 bg-sky-800 text-xl text-white hover:bg-sky-900 ${focus}`}>→</button>
            </div>
          </div>
          <div className="h-0.5 bg-slate-100" aria-hidden="true"><div className="h-full bg-gradient-to-r from-sky-500 to-emerald-400" style={{ width: `${((active + 1) / HOMEPAGE_SHOWCASE.length) * 100}%` }} /></div>
          <div id="showcase-content" role="group" aria-roledescription="slide" aria-label={`${active + 1} of 24: ${slide.label}`} className="grid lg:grid-cols-[0.9fr_1.35fr]">
            <div className="flex min-w-0 flex-col p-6 sm:p-8">
              <div aria-live="polite" aria-atomic="true">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700"><ProductIcon name={group.icon} className="h-4 w-4" />{group.label}</p>
                <h3 className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-3xl">{slide.title}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">{slide.description}</p>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
                  {slide.highlights.map((item) => <li key={item} className="flex gap-3"><span aria-hidden="true" className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">✓</span>{item}</li>)}
                </ul>
                <p className="mt-6 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm leading-6 text-slate-700">{slide.result}</p>
              </div>
              <a href={slide.href} className={`mt-auto inline-flex min-h-11 items-center gap-2 self-start pt-6 text-sm font-semibold text-sky-800 hover:underline ${focus}`}>{slide.linkLabel} <span aria-hidden="true">↗</span></a>
            </div>

            <div className="min-w-0 border-t border-slate-200 bg-[radial-gradient(ellipse_at_top_right,#e0f2fe,transparent_65%),linear-gradient(145deg,#f8fafc,#f0fdfa)] lg:border-l lg:border-t-0">
              <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 sm:px-6">
                <p className="text-xs font-medium text-slate-600">{slide.kind === "report" ? "Actual report · owned test site" : slide.kind === "code" ? slide.code.label : "Illustrated product workflow"}</p>
                <span className="rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-800">{slide.kind === "report" ? "Evidence" : slide.kind === "code" ? "Example" : "Workflow"}</span>
              </div>
              <div className="p-4 sm:p-6">
                {slide.kind === "report" ? <>
                  <div key={slide.id} data-evidence-scroll tabIndex={0} role="region" aria-label={`${slide.label} screenshot; scroll to inspect`} className={`flex h-[300px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm sm:h-[420px] ${focus}`}>
                    <Image src={slide.image.src} alt={slide.image.alt} width={slide.image.width} height={slide.image.height} sizes="(min-width: 1024px) 700px, (min-width: 640px) 90vw, 100vw" className="mx-auto my-auto h-auto w-full shrink-0" style={{ maxWidth: slide.image.width }} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <a href={slide.source.href} target="_blank" rel="noopener noreferrer" className={`text-xs text-slate-600 underline underline-offset-2 ${focus}`}>{slide.source.label} · {slide.source.date}<span className="sr-only"> · Open source report in a new tab</span></a>
                    <button type="button" onClick={() => { setEnlarged(true); dialog.current?.showModal(); }} aria-label={`Enlarge ${slide.label} report screenshot`} className={`min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-sky-800 hover:border-sky-400 ${focus}`}>Enlarge evidence ↗</button>
                  </div>
                </> : slide.kind === "code" ? <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-xl">
                  <div className="flex items-center gap-1.5 border-b border-slate-800 px-5 py-3" aria-hidden="true"><span className="h-2 w-2 rounded-full bg-slate-500" /><span className="h-2 w-2 rounded-full bg-slate-600" /><span className="h-2 w-2 rounded-full bg-slate-700" /><span className="ml-auto font-mono text-[10px] text-sky-300">CertScore.ai / {slide.label}</span></div>
                  <pre tabIndex={0} aria-label={slide.code.label} className={`h-[360px] overflow-auto p-5 text-xs leading-6 text-sky-100 sm:h-[420px] ${focus}`}><code>{slide.code.content}</code></pre>
                </div> : <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                  <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">CertScore.ai workflow</p>
                  <h4 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{slide.workflow.title}</h4>
                  <ol className="mt-6 space-y-4">{slide.workflow.steps.map(([title, detail], index) => <li key={title} className="relative flex gap-4">
                    {index < slide.workflow.steps.length - 1 && <span aria-hidden="true" className="absolute bottom-[-1rem] left-[19px] top-10 w-px bg-gradient-to-b from-sky-300 to-emerald-200" />}
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 font-mono text-sm font-semibold text-sky-800">0{index + 1}</span>
                    <div className="pb-2"><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p></div>
                  </li>)}</ol>
                  <p className="mt-5 rounded-xl bg-slate-950 px-4 py-3 text-sm leading-6 text-sky-100">{slide.workflow.output}</p>
                </div>}
              </div>
            </div>
          </div>
        </div>

        <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <summary className={`cursor-pointer text-sm font-semibold text-slate-800 ${focus}`}>Explore all 24 product capabilities</summary>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{PRODUCT_GROUPS.map((item) => <div key={item.id}><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-sky-700">{item.label}</p><ol className="space-y-2">{HOMEPAGE_SHOWCASE.map((feature, index) => feature.group === item.id ? <li key={feature.id}><button type="button" aria-pressed={index === active} aria-controls="showcase-content" onClick={() => { select(index); document.getElementById("product-feature-select")?.focus({ preventScroll: true }); document.getElementById("showcase-slide")?.scrollIntoView({ block: "center" }); }} className={`flex w-full gap-2 rounded-lg px-2 py-3 text-left text-xs leading-5 ${focus} ${active === index ? "bg-sky-50 font-semibold text-sky-900" : "text-slate-600 hover:bg-slate-50"}`}><span className="font-mono text-sky-700">{String(index + 1).padStart(2, "0")}</span><span>{feature.title}</span></button></li> : null)}</ol></div>)}</div>
        </details>
        <div className="mt-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <p className="max-w-3xl text-xs leading-5 text-slate-500">Report captures use retained scans of CertScore.ai’s owned test pages; dates are shown with each image. Workflows and code are labeled examples. Findings support review, not a determination of compliance. Available capabilities depend on scan route, coverage and access.</p>
          <a href="/how-it-works#walkthrough" className={`inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-sky-800 hover:underline ${focus}`}>Take the report walkthrough <span aria-hidden="true">→</span></a>
        </div>
      </div>

      <dialog ref={dialog} onClose={() => setEnlarged(false)} aria-labelledby="showcase-image-title" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-6xl overflow-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/75">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <h3 id="showcase-image-title" className="text-sm font-semibold text-slate-900">{slide.label} · report evidence</h3>
          <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Close enlarged screenshot" className={`min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium ${focus}`}>Close ×</button>
        </div>
        {enlarged && slide.kind === "report" && <div className="p-3 sm:p-6"><div tabIndex={0} role="region" aria-label="Enlarged product screenshot; scroll to inspect" className={`overflow-auto ${focus}`}><Image src={slide.image.src} alt={slide.image.alt} width={slide.image.width} height={slide.image.height} sizes="(min-width: 1200px) 1100px, (min-width: 640px) 95vw, 600px" className="mx-auto h-auto w-full min-w-[560px]" style={{ maxWidth: slide.image.width }} /></div><p className="mt-4 text-center text-xs text-slate-600">Scroll to inspect · Owned test-site report · {slide.source.date}</p></div>}
      </dialog>
    </section>
  );
}
