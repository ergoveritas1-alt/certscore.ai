import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";

export const dynamic = "force-dynamic";

const steps = [
  "Open chrome://extensions in Chrome.",
  "Enable Developer mode.",
  "Choose Load unpacked.",
  "Select apps/browser-extension from this WC01 checkout.",
  "Sign in to CertScore in the same Chrome profile.",
  "Return to CertScore, choose Local extension in the scan selector, and click Scan."
];

type BrowserScanSetupPageProps = {
  searchParams?: Promise<{
    bx01TargetUrl?: string;
  }>;
};

export default async function BrowserScanSetupPage({ searchParams }: BrowserScanSetupPageProps) {
  const params = await searchParams;
  const targetUrl = typeof params?.bx01TargetUrl === "string" ? params.bx01TargetUrl : "";

  return (
    <div className="space-y-6 pb-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-panel sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Install Browser Evidence</h1>
              <Badge className="bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">BX01</Badge>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              BX01 captures browser-observed pre-consent evidence during reviewer-initiated scans launched from CertScore.
            </p>
          </div>
          <Link
            href="/app/browser-scans"
            className="inline-flex w-fit items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            View sessions
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Launch from CertScore</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="space-y-3" action="/app/browser-scans/setup" method="get">
              <label className="block text-sm font-semibold text-slate-900" htmlFor="bx01TargetUrl">
                Target URL
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="bx01TargetUrl"
                  name="bx01TargetUrl"
                  type="url"
                  required
                  defaultValue={targetUrl}
                  placeholder="https://example.com/"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Prepare launch
                </button>
              </div>
            </form>

            {targetUrl ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
                Use the scan box in CertScore with Local extension selected. CertScore will ask BX01 to open this target in a new tab, capture evidence, and return you to the report automatically.
              </div>
            ) : (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
                The normal flow starts from the CertScore scan box: select Local extension, enter a URL, and click Scan. The extension popup is only a fallback control surface.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Local installation</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm leading-6 text-slate-700">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence boundaries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-700">
            <p>
              The extension observes only after a user starts a scan, reloads the current tab, and uploads bounded BX01 evidence to CertScore API routes.
            </p>
            <p>
              Cookie values are not captured. Tracker classification and report integration stay server-side.
            </p>
            <p>
              For local API testing, edit <span className="font-mono text-xs">apps/browser-extension/src/config.js</span> and point <span className="font-mono text-xs">apiBaseUrl</span> at <span className="font-mono text-xs">http://localhost:3000</span>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
