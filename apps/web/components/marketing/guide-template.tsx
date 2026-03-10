import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";

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
  questionTitle: string;
  whyItMatters: string[];
  commonIssues: string[];
  examples: string[];
  automatedScanningHelp: string[];
  certScoreHelp: string[];
  relatedGuides: RelatedLink[];
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
  questionTitle,
  whyItMatters,
  commonIssues,
  examples,
  automatedScanningHelp,
  certScoreHelp,
  relatedGuides
}: GuideTemplateProps) {
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: intro,
    about: ["website scanning", "accessibility", "privacy", "disclosures", "automated scanning"]
  };

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
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
            "CertScore.ai approaches this topic as a question of observable website signals. It helps teams surface scan findings and track changes over time, but it does not provide legal advice or certify compliance."
          ]}
        />

        <GuideTextSection title="Why it matters" paragraphs={whyItMatters} />

        <GuideTextSection title="Common issues websites have" paragraphs={commonIssues} />

        <GuideTextSection title="Examples of problems" paragraphs={examples} />

        <GuideTextSection
          title="How automated scanning helps detect signals"
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
            <div className="flex flex-wrap gap-3 pt-3">
              <Button asChild>
                <Link href="/">Start free scan</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

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
              href="/pricing"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Compare plans
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
