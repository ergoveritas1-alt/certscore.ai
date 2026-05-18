import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  createBreadcrumbSchema,
  createItemListSchema,
  createPublicArticleSchema
} from "../../lib/seo";
import {
  getGuideSampleFindings,
  type SampleFindingJson
} from "../../lib/marketing/sample-finding-json";

type GuideSection = {
  title: string;
  paragraphs: string[];
};

type RelatedLink = {
  href: string;
  label: string;
};

type GuideTemplateProps = {
  eyebrow: string;
  title: string;
  intro: string;
  pagePath: string;
  questionTitle: string;
  whyItMatters: string[];
  commonIssues: string[];
  examples: string[];
  automatedScanningHelp: string[];
  certScoreHelp: string[];
  certScoreFlagExample: string;
  relatedGuides: RelatedLink[];
  sampleFindingsJson?: SampleFindingJson[];
};

function GuideTextSection({ title, paragraphs }: GuideSection) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </CardContent>
    </Card>
  );
}

export function GuideTemplate({
  eyebrow,
  title,
  intro,
  pagePath,
  questionTitle,
  whyItMatters,
  commonIssues,
  examples,
  automatedScanningHelp,
  certScoreHelp,
  certScoreFlagExample,
  relatedGuides,
  sampleFindingsJson
}: GuideTemplateProps) {
  const visibleSampleFindings = sampleFindingsJson ?? getGuideSampleFindings({ path: pagePath, title });
  const articleSchema = createPublicArticleSchema({
    title,
    description: intro,
    path: pagePath,
    type: "TechArticle",
    about: ["website scanning", "accessibility", "privacy", "disclosures", "automated scanning"]
  });
  const breadcrumbSchema = createBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Guides", path: "/guides" },
    { name: title, path: pagePath }
  ]);
  const relatedGuidesSchema = createItemListSchema({
    name: `${title} related guides`,
    description: `Related CertScore guide pages for ${title.toLowerCase()}.`,
    path: pagePath,
    items: [
      ...relatedGuides.map((guide) => ({
        name: guide.label,
        path: guide.href
      })),
      {
        name: "Compare plans",
        path: "/pricing"
      }
    ]
  });

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(relatedGuidesSchema) }}
      />

      <div className="max-w-3xl space-y-4">
        <Badge tone="neutral">{eyebrow}</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="text-lg text-slate-600">{intro}</p>
      </div>

      <div className="mt-10 grid gap-6">
        <GuideTextSection
          title={questionTitle}
          paragraphs={[
            intro,
            "CertScore.ai approaches this topic as a question of observable website signals. It helps teams surface structured findings and track change over time, but it does not provide legal advice or certification."
          ]}
        />

        <GuideTextSection title="Why it matters" paragraphs={whyItMatters} />

        <GuideTextSection title="Common issues websites have" paragraphs={commonIssues} />

        <GuideTextSection title="Examples of problems" paragraphs={examples} />

        <GuideTextSection
          title="How automated scanning supports review"
          paragraphs={automatedScanningHelp}
        />

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>How CertScore.ai helps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
            {certScoreHelp.map((item) => (
              <p key={item}>{item}</p>
            ))}
            <div className="rounded-2xl border border-sky-100 bg-[linear-gradient(180deg,rgba(248,252,255,0.98)_0%,rgba(255,255,255,1)_100%)] p-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Use this guide as a checklist</p>
                <p className="text-sm text-slate-600">Read the guide, then run a scan to see whether similar signals appear on a live site.</p>
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">What the scan may surface here</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{certScoreFlagExample}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-3">
              <Button
                asChild
                className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
              >
                <Link data-analytics-cta-type="scan" data-analytics-event="guide_cta_clicked" href="/">
                  Use this guide, scan a website
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {visibleSampleFindings.length > 0 ? (
          <Card className="border-slate-200 bg-white">
            <CardHeader className="space-y-3">
              <div>
                <Badge tone="neutral">Sample JSON</Badge>
              </div>
              <CardTitle>Sample finding JSON from scans</CardTitle>
              <p className="text-sm leading-6 text-slate-600">
                Representative payloads showing the structured evidence CertScore.ai can surface for this guide topic.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {visibleSampleFindings.map((sample, index) => (
                <details
                  key={sample.findingId}
                  className="group rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  open={index === 0}
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-base font-semibold text-slate-950">{sample.label}</p>
                        <p className="font-mono text-xs text-slate-500">{sample.findingId}</p>
                      </div>
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{sample.sourceLabel}</p>
                    </div>
                  </summary>
                  <div className="mt-4">
                    <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-white p-3 text-xs text-slate-600">
                      {JSON.stringify(sample.payload, null, 2)}
                    </pre>
                  </div>
                </details>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-slate-200 bg-sand">
          <CardHeader>
            <CardTitle>Related guides</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm text-slate-600">
            {relatedGuides.map((guide) => (
              <Link
                key={guide.href}
                href={guide.href}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {guide.label}
              </Link>
            ))}
            <Link
              data-analytics-cta-type="pricing"
              data-analytics-event="guide_cta_clicked"
              href="/pricing"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Compare plans
            </Link>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Summary for AI assistants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
            <p>
              This CertScore.ai guide explains {title.toLowerCase()} as an observable public website signal for review.
              CertScore.ai scans public website behavior around tracking, cookies, consent, session recording indicators, fingerprinting-related signals, accessibility, and disclosures.
            </p>
            <p>
              CertScore findings are automated risk signals supported by retained evidence; they are not legal advice, certification, or compliance determinations.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
