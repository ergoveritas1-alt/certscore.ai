import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  description:
    "Learn how CertScore.ai uses browser-based observation, retained evidence, defined measurements, and repeatability checks to review public website privacy signals.",
  path: "/methodology",
  title: "Browser-Based Website Measurement Methodology"
});

const measurementAreas = [
  "Cookies and browser storage",
  "Third-party trackers and technology categories",
  "Consent-management platforms",
  "Privacy and cookie-policy surfaces",
  "Transport-security indicators",
  "Geographic differences in website execution"
];

const observationSteps = [
  "Execute a public website in an instrumented browser.",
  "Observe the website’s runtime state under defined test conditions.",
  "Capture supporting technical evidence and context.",
  "Normalize observations into consistent measurement categories.",
  "Retain evidence so reported findings can be reviewed and audited."
];

const definitions = [
  {
    term: "Pre-consent cookie",
    definition: "A cookie observed before the scanner records a visitor consent choice."
  },
  {
    term: "Tracker detection",
    definition: "A grouped technology observation supported by browser, network, cookie, storage, script, or related runtime evidence."
  },
  {
    term: "Advertising & Measurement",
    definition: "A functional category for technologies associated with advertising, advertising measurement, or audience measurement."
  },
  {
    term: "CMP observation",
    definition: "Evidence that a consent-management platform or consent interface was present during the tested visit."
  },
  {
    term: "Policy surface",
    definition: "A public page or document that presents privacy, cookie, consent, or related disclosure information."
  }
];

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-3xl space-y-4">
            <Badge tone="neutral">Methodology</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
              Browser-based website measurement
            </h1>
            <p className="text-lg leading-8 text-slate-600">
              CertScore.ai observes how public websites behave in a real browser, preserves supporting evidence, and reports structured
              privacy-related measurements for review. It does not rely only on policy text or static page inspection.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-slate-950">What CertScore measures</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="grid gap-2 text-sm leading-6 text-slate-600">
                {measurementAreas.map((area) => (
                  <li key={area} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />
                    <span>{area}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-slate-950">How observation works</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ol className="grid gap-3 text-sm leading-6 text-slate-600">
                {observationSteps.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-semibold text-sky-700">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-14 md:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Geographic measurement</h2>
            <p className="text-sm leading-7 text-slate-600">
              Websites may return different content, consent interfaces, cookies, or third-party activity according to a visitor’s location.
              CertScore can observe the same website from different geographic locations while keeping the core measurement approach consistent.
            </p>
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Evidence-backed findings</h2>
            <p className="text-sm leading-7 text-slate-600">
              Findings are tied to retained observations rather than generated solely from a score. Evidence may include cookie observations,
              network and runtime records, tracker or vendor observations, CMP observations, policy surfaces, timestamps, and geographic context.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="max-w-3xl space-y-3">
          <Badge tone="neutral">Definitions</Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Key measurement terms</h2>
        </div>
        <dl className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {definitions.map((item) => (
            <div key={item.term} className="grid gap-1 border-b border-slate-200 px-5 py-4 last:border-b-0 sm:grid-cols-[13rem_1fr] sm:gap-6">
              <dt className="font-medium text-slate-950">{item.term}</dt>
              <dd className="text-sm leading-6 text-slate-600">{item.definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-14 md:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Validation and repeatability</h2>
            <p className="text-sm leading-7 text-slate-600">
              CertScore’s measurement approach is evaluated through defined manual-validation studies and repeated browser observations. Results
              from a particular validation study describe that study’s sample and conditions; they are not presented as universal accuracy claims.
            </p>
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Scope</h2>
            <p className="text-sm leading-7 text-slate-600">
              CertScore measures observable technical states and runtime outcomes. These observations provide evidence for privacy engineering and
              assurance, while questions of legal compliance, processing purpose, or operator intent may require additional context.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
