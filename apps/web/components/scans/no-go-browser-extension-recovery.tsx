import React from "react";
import Link from "next/link";

export function NoGoBrowserExtensionRecovery({
  isTargetSiteState
}: {
  isTargetSiteState: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[1.4rem] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 px-6 py-6 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Alternate scan path</p>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Try scanning from Chrome</h2>
          <p className="text-sm leading-6 text-slate-700">
            CertScore&apos;s hosted scanner could not verify a representative public page. The site may respond differently in
            a normal Chrome session, so you can try a reviewer-started scan with the CertScore.ai Chrome extension.
          </p>
          <p className="text-sm leading-6 text-slate-600">
            {isTargetSiteState
              ? "The extension may encounter the same page until the underlying site issue is resolved."
              : "Running from a normal Chrome session may help when the hosted scanner encounters access controls, regional behavior, or browser-specific rendering."}
          </p>
        </div>
        <Link
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          href="/browser-extension"
        >
          Show instructions
        </Link>
      </div>
    </section>
  );
}
