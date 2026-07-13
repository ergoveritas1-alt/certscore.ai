import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCertScoreChromeExtensionStoreUrl } from "../../../../lib/browser-extension-store";
import { getDashboardContext } from "../../../../server/auth";
import { getScanById } from "../../../../server/scans/get-scan-by-id";

export const metadata: Metadata = {
  title: "Set up the CertScore.ai Chrome extension",
  description: "Install the CertScore.ai Chrome extension and run a reviewer-started browser scan."
};

type SetupPageProps = {
  searchParams?: Promise<{ scanId?: string }>;
};

const steps = [
  ["Add the extension to Chrome", "On the official listing, select Add to Chrome. When Chrome asks for confirmation, select Add extension.", "store"],
  ["Pin the extension", "Select Chrome’s puzzle-piece Extensions button, then select the pin beside CertScore.ai. Its shield icon will remain in the toolbar.", "pin"],
  ["Open the site", "Open the public website you want to scan in its own Chrome tab and wait for the normal page to finish loading.", "site"],
  ["Start the scan", "Select the CertScore.ai shield in the toolbar. Optionally enable Fresh visit, then select Run Browser Pre-Consent Scan.", "scan"],
  ["Keep both tabs open", "Leave the target-site and CertScore.ai tabs open. The progress page updates automatically while the scan runs.", "progress"],
  ["Review the report", "When the progress page says the report is ready, select View scan report on CertScore.ai.", "report"]
] as const;

function StepVisual({ kind }: { kind: (typeof steps)[number][2] }) {
  const content = {
    store: (
      <div className="space-y-3">
        <div className="flex items-center gap-3"><Image alt="" className="h-9 w-9 rounded-lg" height={36} src="/certscore-mark-dark.png" width={36} /><div className="min-w-0"><p className="truncate font-semibold text-slate-900">CertScore.ai</p><p className="text-[11px] text-slate-500">Chrome Web Store</p></div></div>
        <div className="rounded-lg bg-blue-600 px-3 py-2 text-center text-xs font-semibold text-white">Add to Chrome</div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-800">Add “CertScore.ai”?</p><div className="mt-2 flex justify-end gap-2"><span className="rounded-md border border-slate-300 px-2 py-1 text-[10px]">Cancel</span><span className="rounded-md bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white">Add extension</span></div></div>
      </div>
    ),
    pin: (
      <div className="space-y-3">
        <div className="flex justify-end gap-2 text-lg"><span className="rounded-md bg-slate-100 px-2">🧩</span><span className="rounded-md bg-emerald-100 px-2">🛡️</span></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-md"><p className="text-xs font-semibold text-slate-900">Extensions</p><div className="mt-3 flex items-center gap-2 rounded-md bg-sky-50 p-2"><Image alt="" className="h-7 w-7 rounded-md" height={28} src="/certscore-mark-dark.png" width={28} /><span className="flex-1 text-xs font-medium text-slate-800">CertScore.ai</span><span className="rounded bg-blue-100 px-1.5 py-1 text-blue-700">📌</span></div></div>
      </div>
    ),
    site: (
      <div className="space-y-3"><div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600"><span>ⓘ</span><span className="font-medium text-slate-800">cerebras.com</span></div><div className="rounded-lg bg-slate-900 p-4 text-white"><p className="text-lg font-semibold">Target website</p><p className="mt-1 text-xs text-slate-300">Wait until the normal public page is visible.</p></div></div>
    ),
    scan: (
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-md"><div className="flex items-center gap-2"><Image alt="" className="h-8 w-8 rounded-md" height={32} src="/certscore-mark-dark.png" width={32} /><div><p className="text-xs font-bold text-slate-900">CertScore<span className="text-lime-600">.ai</span></p><p className="text-[10px] text-slate-500">Browser pre-consent evidence</p></div></div><div className="mt-3 rounded-md bg-slate-50 p-2 text-[10px] text-slate-600"><span className="block uppercase tracking-wide">Current URL</span><strong className="block truncate text-slate-800">https://cerebras.com/</strong></div><div className="mt-2 flex items-center gap-2 text-[10px] text-slate-700"><span className="h-3 w-3 rounded border border-slate-400" /> Fresh visit</div><div className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-center text-[11px] font-semibold text-white">Run Browser Pre-Consent Scan</div></div>
    ),
    progress: (
      <div className="space-y-3"><div className="flex gap-2"><div className="flex-1 rounded-t-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700">CertScore.ai</div><div className="flex-1 rounded-t-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700">cerebras.com</div></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg motion-safe:animate-pulse">⌛</span><div><p className="text-xs font-semibold text-slate-900">Scanning is in progress…</p><p className="mt-0.5 text-[10px] text-slate-600">Keep both tabs open.</p></div></div></div></div>
    ),
    report: (
      <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"><div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-lg text-emerald-700">✓</div><p className="mt-3 text-sm font-semibold text-slate-900">Your scan report is ready</p><p className="mt-1 text-[10px] text-slate-500">Open CertScore.ai to review the evidence and results.</p><div className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-center text-[11px] font-semibold text-white">View scan report on CertScore.ai</div></div>
    )
  }[kind];
  return (
    <div aria-hidden="true" className="min-h-52 rounded-xl border border-slate-200 bg-slate-100 p-3">
      <div className="mb-2 flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /></div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">{content}</div>
    </div>
  );
}

export default async function BrowserScanSetupPage({ searchParams }: SetupPageProps) {
  const [{ organization, user }, resolvedSearchParams] = await Promise.all([
    getDashboardContext(),
    searchParams ?? Promise.resolve({} as { scanId?: string })
  ]);
  const scanId = resolvedSearchParams.scanId?.trim() || null;
  const scan = scanId
    ? await getScanById({ organizationId: organization.id, scanId, viewerEmail: user.email })
    : null;
  const storeUrl = getCertScoreChromeExtensionStoreUrl();

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-16">
      <header className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-10 text-white sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-300">Chrome extension</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">Scan from your Chrome browser</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          Use your normal Chrome session when CertScore&apos;s hosted scanner cannot verify a representative public page.
          The extension runs only after you start it and uploads bounded evidence; cookie values are never captured.
        </p>
        {scan ? <p className="mt-4 text-sm text-slate-300">Preparing to rescan <strong className="text-white">{scan.scan.domainHostname ?? "this site"}</strong>.</p> : null}
        <div className="mt-7 flex flex-wrap gap-3">
          <a className="inline-flex min-h-12 items-center rounded-xl bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" href={storeUrl} rel="noreferrer" target="_blank">Add the CertScore.ai extension to Chrome</a>
          {scan ? <Link className="inline-flex min-h-12 items-center rounded-xl border border-slate-600 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800" href={`/app/scans/${encodeURIComponent(scan.scan.id)}`}>Back to scan report</Link> : null}
        </div>
      </header>

      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="text-2xl font-semibold tracking-tight text-slate-950">Install and run the extension</h2>
        <ol className="mt-5 grid gap-5 md:grid-cols-2">
          {steps.map(([title, description, kind], index) => (
            <li key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-sky-100 text-sm font-bold text-sky-800">{index + 1}</span><h3 className="font-semibold text-slate-950">{title}</h3></div>
              <StepVisual kind={kind} />
              <p className="mt-4 text-sm leading-6 text-slate-600">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <aside className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm leading-6 text-amber-950">
        <strong>Keep the tabs open.</strong> The extension does not bypass site security controls and cannot guarantee that a site unavailable in your browser will scan successfully.
      </aside>
    </div>
  );
}
