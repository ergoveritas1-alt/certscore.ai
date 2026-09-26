import Link from "next/link";
import { Suspense } from "react";
import { DomainScanForm } from "./domain-scan-form";

export type GuideScanPrompt = {
  title: string;
  description: string;
};

export function GuideScanCta({ title, description }: GuideScanPrompt) {
  return (
    <section id="scan" aria-labelledby="guide-scan-heading" className="scroll-mt-24 rounded-2xl border border-sky-200 bg-sky-50 p-5 sm:p-6">
      <h2 id="guide-scan-heading" className="text-xl font-semibold text-slate-950">{title}</h2>
      <p className="mb-5 mt-2 text-sm leading-7 text-slate-700">{description}</p>
      <Suspense fallback={<p className="text-sm text-slate-600">Loading scan form…</p>}>
        <DomainScanForm mode="preview" scanSource="unknown" buttonLabel="Scan now" inputLabel="Website URL" inputPlaceholder="https://your-website.com" />
      </Suspense>
      <p className="mt-4 text-sm leading-6 text-slate-600">
        Start with a free scan of one public page. This is not a full-site audit; results describe the scan’s conditions and coverage. Review the retained evidence before making changes.
      </p>
      <Link href="/guides/consent-report-example" className="mt-3 inline-block text-sm font-semibold text-sky-700 underline underline-offset-4">
        See how to read a report
      </Link>
    </section>
  );
}

export function GuideScanReturnCta() {
  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
      <p className="font-semibold text-slate-950">Put the checklist to work on your website</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">Start with one page, review its evidence, then use “Scan another website” in the report to review another client, brand, or public site.</p>
      <Link href="#scan" data-analytics-cta-type="scan" data-analytics-event="guide_cta_clicked" className="mt-3 inline-block font-semibold text-sky-700 underline underline-offset-4">
        Enter a website URL
      </Link>
    </div>
  );
}
