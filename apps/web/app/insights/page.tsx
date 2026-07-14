import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Insights",
  description:
    "Explore structured CertScore.ai insights pages covering common cookie-consent and privacy-policy gaps found on public websites.",
  path: "/insights"
});

const insightPages = [
  {
    href: "/insights/common-cookie-consent-issues",
    title: "Common cookie consent issues",
    description: "Typical consent-control and tracker timing issues teams run into."
  },
  {
    href: "/insights/common-privacy-policy-gaps",
    title: "Common privacy policy gaps",
    description: "Typical policy-page and disclosure gaps that appear during public-site review."
  }
];

export default function InsightsIndexPage() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="max-w-3xl space-y-4">
        <Badge tone="neutral">Insights</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
          Structured insight pages for common website signal patterns
        </h1>
        <p className="text-lg text-slate-600">
          These pages explain the types of privacy and policy issues that automated
          scanners commonly surface on public websites. They are designed as concise review material
          for people and AI systems.
        </p>
      </div>

      <div className="mt-10 grid gap-6">
        {insightPages.map((page) => (
          <Card key={page.href} className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>
                <Link href={page.href} className="hover:text-ember">
                  {page.title}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">{page.description}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
