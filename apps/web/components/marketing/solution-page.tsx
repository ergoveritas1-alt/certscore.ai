import { EditorialByline } from "./editorial-byline";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DomainScanForm } from "./domain-scan-form";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  createBreadcrumbSchema,
  createFaqPageSchema,
  createPageMetadata,
  createPublicArticleSchema,
  createPublicWebPageSchema,
  createSoftwareApplicationSchema
} from "../../lib/seo";
import { WebsiteBehaviorScanCta } from "./ai-visibility-content";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../lib/marketing/sample-report";

type SolutionFaq = {
  answer: string;
  question: string;
};

type SolutionSection = {
  body: string;
  title: string;
};

type SolutionLink = {
  href: string;
  label: string;
};

export type SolutionPageConfig = {
  aiSummary: string[];
  inlineScan?: boolean;
  metadataTitle?: string;
  badge: string;
  description: string;
  faqs: SolutionFaq[];
  intro: string;
  path: string;
  primarySignals: string[];
  relatedLinks: SolutionLink[];
  sections: SolutionSection[];
  title: string;
};

export function createSolutionPageMetadata(config: SolutionPageConfig): Metadata {
  return {
    ...createPageMetadata({
      title: config.title,
      description: config.description,
      path: config.path
    }),
    title: {
      absolute: `${config.metadataTitle ?? config.title} | CertScore.ai`
    }
  };
}

export function SolutionPage({ config }: { config: SolutionPageConfig }) {
  const schemas = [
    createPublicWebPageSchema({
      title: config.title,
      description: config.description,
      path: config.path
    }),
    createSoftwareApplicationSchema({
      title: "CertScore.ai",
      description: config.description,
      path: config.path
    }),
    createPublicArticleSchema({
      title: config.title,
      description: config.description,
      path: config.path,
      type: "TechArticle",
      about: config.primarySignals
    }),
    createFaqPageSchema(config.faqs),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Solutions", path: "/solutions" },
      { name: config.title, path: config.path }
    ])
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      {schemas.map((schema) => (
        <script
          key={JSON.stringify(schema)}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="max-w-3xl space-y-6">
          <Badge tone="neutral">{config.badge}</Badge>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              {config.title}
            </h1>
            <p className="text-lg leading-8 text-slate-600">{config.intro}</p>
            <EditorialByline path={config.path} />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
            >
              <Link href={config.inlineScan ? "#scan" : "/"} data-analytics-cta-type="scan" data-analytics-event="solution_cta_clicked">
                Run a scan
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={AUTHENTIC_SAMPLE_REPORT_URL}>View sample report</Link>
            </Button>
          </div>
          <div className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-slate-700">
            <p>
              CertScore.ai scans public website behavior for review signals. Findings are automated observations backed by retained evidence, not legal advice, certification, or compliance determinations.
            </p>
          </div>
        </div>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg text-slate-950">What the scan reviews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.primarySignals.map((signal) => (
              <div key={signal} className="border-b border-slate-100 pb-3 text-sm font-medium text-slate-700 last:border-b-0 last:pb-0">
                {signal}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {config.inlineScan ? (
        <section id="scan" aria-labelledby="solution-scan-heading" className="mt-10 scroll-mt-24 rounded-2xl border border-sky-200 bg-sky-50 p-6">
          <h2 id="solution-scan-heading" className="mb-4 text-2xl font-semibold text-slate-950">Scan a public website</h2>
          <Suspense fallback={<p>Loading scan form…</p>}>
            <DomainScanForm mode="preview" scanSource="unknown" buttonLabel="Run free scan" inputLabel="Website URL" />
          </Suspense>
        </section>
      ) : <div className="mt-10"><WebsiteBehaviorScanCta /></div>}

      {config.inlineScan && (
        <section aria-labelledby="report-walkthrough-heading" className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="report-walkthrough-heading" className="text-2xl font-semibold text-slate-950">From a scan to a reviewable decision</h2>
          <ol className="mt-5 list-decimal space-y-4 pl-6 text-slate-700">
            <li><strong>Check the context.</strong> Open the report and confirm the target, scan date, region, and coverage. A blocked or incomplete observation is a limitation, not evidence of an absent control.</li>
            <li><strong>Inspect the observation.</strong> Follow a finding to its retained request, cookie, storage, or policy evidence. Keep pre-consent activity separate from activity after an Accept or Reject click.</li>
            <li><strong>Verify the interpretation.</strong> A visible Reject button, a completed click, and confirmed refusal are different facts. A cookie remaining in storage does not by itself prove active tracking.</li>
            <li><strong>Assign and retest.</strong> Give the responsible team the affected vendor, page, consent state, and evidence. After a configuration change, compare a new scan under the same conditions.</li>
          </ol>
          <p className="mt-5 text-sm text-slate-600">Use the sample report to explore the report format; it describes its own retained scan, not your website.</p>
          <div className="mt-4 flex flex-wrap gap-5 font-semibold text-sky-700">
            <Link href="/guides/consent-report-example" className="underline underline-offset-4">Read the annotated report example</Link>
            <Link href={AUTHENTIC_SAMPLE_REPORT_URL} className="underline underline-offset-4">Explore the sample report</Link>
            <Link href="/guides/reject-consent-tracking-test" className="underline underline-offset-4">Follow the Reject testing walkthrough</Link>
            <Link href="/guides/website-consent-audit-checklist" className="underline underline-offset-4">Use the audit checklist</Link>
          </div>
        </section>
      )}

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {config.sections.map((section) => (
          <Card key={section.title} className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-7 text-slate-600">{section.body}</CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">Frequently asked questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {config.faqs.map((faq) => (
              <div key={faq.question} className="space-y-2 border-b border-slate-100 pb-5 last:border-b-0 last:pb-0">
                <h2 className="text-base font-semibold text-slate-950">{faq.question}</h2>
                <p className="text-sm leading-7 text-slate-600">{faq.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid content-start gap-5">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Key takeaways</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
              {config.aiSummary.map((summary) => (
                <p key={summary}>{summary}</p>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-sand shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Related CertScore.ai pages</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 text-sm text-slate-600">
              {config.relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {link.label}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
