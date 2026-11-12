"use client";

import Link from "next/link";
import { homepageReviewIntro, homepageReviewWorkflows } from "../../lib/marketing/homepage-review-workflows";
import { useHomepageScanPreferences } from "./homepage-scan-preferences";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700";

function ReviewIllustration({ region }: { region: "us" | "eu" }) {
  const us = region === "us";
  const labels = us ? ["GPC delivery & response", "Sale/sharing choices", "Collection notices & rights"] : ["Before consent", "After Accept or Reject", "Privacy disclosures"];
  return <svg viewBox="0 0 520 180" className="h-auto w-full" role="img" aria-label={us ? "California review workflow linking GPC, opt-out choices and notices to retained evidence" : "GDPR/ePrivacy review workflow linking consent behavior and disclosures to retained evidence"}>
    <circle cx="75" cy="90" r="66" fill="none" stroke={us ? "#34d399" : "#38bdf8"} opacity="0.1" />
    <circle cx="75" cy="90" r="49" fill="none" stroke={us ? "#34d399" : "#38bdf8"} opacity="0.2" />
    <path d="M114 90h35m0 0V42h40m-40 48h40m-40 0v48h40" fill="none" stroke={us ? "#34d399" : "#38bdf8"} strokeWidth="1.5" opacity="0.65" />
    <rect x="30" y="60" width="90" height="60" rx="16" fill={us ? "#123d43" : "#153956"} stroke={us ? "#34d399" : "#38bdf8"} strokeOpacity="0.55" />
    <text x="75" y="86" textAnchor="middle" fill="white" fontSize="15" fontWeight="600">{us ? "CCPA" : "GDPR"}</text>
    <text x="75" y="104" textAnchor="middle" fill={us ? "#a7f3d0" : "#bae6fd"} fontSize="10">{us ? "California" : "+ ePrivacy"}</text>
    {labels.map((label, index) => <g key={label}>
      <rect x="189" y={24 + index * 48} width="302" height="36" rx="9" fill="white" fillOpacity="0.055" stroke="white" strokeOpacity="0.12" />
      <circle cx="207" cy={42 + index * 48} r="3" fill={us ? "#6ee7b7" : "#7dd3fc"} />
      <text x="222" y={46 + index * 48} fill="#e2e8f0" fontSize="12">{label}</text>
    </g>)}
  </svg>;
}

export function HomepageReviewWorkflows() {
  const location = useHomepageScanPreferences()?.location ?? "EU";
  const workflows = homepageReviewWorkflows(location);
  return <section id="review-workflows" aria-labelledby="review-workflows-heading" className="scroll-mt-24 border-b border-slate-200 bg-white">
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Built for DPOs &amp; privacy teams · EU + US</p>
          <h2 id="review-workflows-heading" className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">Two privacy perspectives.<br />One evidence-led workflow.</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">{homepageReviewIntro(location)}</p>
        </div>
        <Link href="/solutions" className={`inline-flex min-h-11 shrink-0 items-center gap-2 self-start text-sm font-semibold text-sky-800 md:self-auto ${focus}`}>All scanner solutions <span aria-hidden="true">↗</span></Link>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2" data-review-perspectives>
        {workflows.filter((item) => item.id === "us" || item.id === "eu").map((item) => <Link key={item.id} href={item.href} className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_-24px_rgba(15,23,42,0.3)] transition-shadow hover:shadow-[0_20px_48px_-22px_rgba(15,23,42,0.3)] ${focus}`}>
          <div className={`border-b border-slate-200 ${item.id === "us" ? "bg-[radial-gradient(ellipse_at_top_right,#14534e,#0b2340_70%)]" : "bg-[radial-gradient(ellipse_at_top_right,#17466c,#0b2340_70%)]"}`}><ReviewIllustration region={item.id as "us" | "eu"} /></div>
          <div className="flex flex-1 flex-col p-6 sm:p-7">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${item.id === "us" ? "text-emerald-700" : "text-sky-700"}`}>{item.meta}</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 group-hover:text-sky-800">{item.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
            <ul aria-label="Review focus" className="mt-5 flex flex-wrap gap-2">{item.topics.map((topic) => <li key={topic} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">{topic}</li>)}</ul>
            <p className="mt-auto pt-6 text-sm font-semibold text-sky-800">{item.cta} <span aria-hidden="true" className="ml-1">→</span></p>
          </div>
        </Link>)}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {workflows.filter((item) => item.id === "consent" || item.id === "policy").map((item) => <Link key={item.id} href={item.href} className={`group flex gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 transition-colors hover:border-sky-300 hover:bg-sky-50/50 sm:p-6 ${focus}`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-white text-sky-700"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.id === "consent" ? "M4 7h16M4 17h16M9 4v6m6 4v6" : "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h5"} /></svg></span>
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">{item.meta}</p><h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p><p className="mt-4 text-xs font-semibold text-sky-800">{item.cta} <span aria-hidden="true">→</span></p></div>
        </Link>)}
      </div>
    </div>
  </section>;
}
