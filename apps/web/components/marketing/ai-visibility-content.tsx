import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";

export const STANDARD_AUTOMATED_FINDINGS_DISCLAIMER =
  "CertScore.ai automated findings may contain errors. Always review the underlying evidence. CertScore.ai does not provide legal advice or certify compliance.";

type ContentSection = {
  title: string;
  paragraphs: string[];
};

type AiVisibilityContentProps = {
  badge: string;
  title: string;
  intro: string;
  sections: ContentSection[];
  schema: Record<string, unknown>;
  showDisclaimer?: boolean;
};

export function WebsiteBehaviorScanCta() {
  return (
    <Card className="border-sky-100 bg-[linear-gradient(180deg,rgba(248,252,255,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-none">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-base font-semibold text-slate-950">Run a free website behavior scan</p>
          <p className="text-sm leading-6 text-slate-600">
            Check observable tracking, cookies, consent, accessibility, and privacy risk signals.
          </p>
        </div>
        <Button
          asChild
          className="w-full border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04] sm:w-auto"
        >
          <Link href="/preview">Run a scan</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function DisclaimerBlock() {
  return (
    <Card className="border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.92)_0%,rgba(255,255,255,1)_100%)] shadow-none">
      <CardContent className="p-5 text-sm leading-6 text-slate-700">
        {STANDARD_AUTOMATED_FINDINGS_DISCLAIMER}
      </CardContent>
    </Card>
  );
}

export function AiVisibilityContent({
  badge,
  title,
  intro,
  sections,
  schema,
  showDisclaimer = true
}: AiVisibilityContentProps) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <div className="max-w-3xl space-y-4">
        <Badge tone="neutral">{badge}</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="text-lg leading-8 text-slate-600">{intro}</p>
      </div>

      <div className="mt-8">
        <WebsiteBehaviorScanCta />
      </div>

      <div className="mt-8 grid gap-5">
        {sections.map((section) => (
          <Card key={section.title} className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </CardContent>
          </Card>
        ))}
        <WebsiteBehaviorScanCta />
        {showDisclaimer ? <DisclaimerBlock /> : null}
      </div>
    </section>
  );
}
