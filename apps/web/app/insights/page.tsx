import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { createPageMetadata } from "../../lib/seo";
import { getPublishedInsightPages } from "../../server/insights/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "Insights",
  description:
    "Explore original CertScore.ai research and practical insights into session-replay signals, cookie consent and privacy-policy evidence.",
  path: "/insights"
});

const insightPages = [
  { href: "/insights/ai-lab-privacy-leaderboard-2026", title: "Privacy signals across 10 AI-company websites", description: "October 12, 2026 observations from Ireland: the leaderboard, retained report links, methodology and validation limits." },
  { href: "/insights/session-replay-study-2026", title: "Session replay signals: findings from 5,000 production scans", description: "Original CertScore.ai research: 12.0% of 3,199 domains with usable evidence showed an observable replay-service signal." },
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

export default async function InsightsIndexPage() {
  const published = await getPublishedInsightPages();
  const pages = [
    ...published.map((page) => ({ href: page.path, title: page.title, description: page.description })),
    ...insightPages.filter((page) => !published.some((item) => item.path === page.href))
  ];
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="max-w-3xl space-y-4">
        <Badge tone="neutral">Insights</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
          Original research and practical website privacy insights
        </h1>
        <p className="text-lg text-slate-600">
          Explore original CertScore.ai measurements and evidence-based guides to the privacy and policy signals observed on public websites.
        </p>
      </div>

      <div className="mt-10 grid gap-6">
        {pages.map((page) => (
          <Card key={page.href} className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>
                <a href={page.href} className="hover:text-ember">
                  {page.title}
                </a>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">{page.description}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
