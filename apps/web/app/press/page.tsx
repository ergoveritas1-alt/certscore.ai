import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import {
  DisclaimerBlock,
  WebsiteBehaviorScanCta
} from "../../components/marketing/ai-visibility-content";
import { createPageMetadata, SITE_URL } from "../../lib/seo";
import { CORE_MARKETING_POSITIONING } from "../../lib/marketing/core-positioning";

const title = "Press and media information";
const description =
  "Find CertScore.ai company background, website scanning capabilities and media information. Learn how its evidence supports review of public website risks.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title,
    description,
    path: "/press"
  }),
  title: {
    absolute: "Press and media information | CertScore.ai"
  }
};

const scanCategories = [
  "Tracking requests and third-party activity",
  "Cookies before consent",
  "Public consent controls and separate eligible Accept/Reject observations",
  "Session recording and replay-related signals",
  "Fingerprinting-related signals",
  "Homepage accessibility signals",
  "Policy/runtime consistency review signals where evidence is available"
];

export default function PressPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: `${SITE_URL}/press`
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-5xl px-6 py-16">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Press</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Press and media information</h1>
          <p className="text-lg leading-8 text-slate-600">
            {CORE_MARKETING_POSITIONING}
          </p>
        </div>

        <div className="mt-8">
          <WebsiteBehaviorScanCta />
        </div>

        <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm leading-7 text-slate-700">
          <p className="font-semibold text-slate-950">Product updates and original research</p>
          <p className="mt-1">Explore current product releases and original research on GPC, privacy-policy evidence and session-replay detection. Each study retains its own date, sample and methodology.</p>
          <Link className="mt-2 inline-flex font-semibold text-sky-700 hover:text-sky-900" href="/releases">
            Explore releases and research →
          </Link>
        </div>

        <div className="mt-8 grid gap-5">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Boilerplate</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-7 text-slate-600">
              {CORE_MARKETING_POSITIONING} Start with a free public-page scan, review retained report evidence, or connect an agent through MCP, the REST API or TypeScript SDK.
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">What CertScore.ai scans</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm leading-6 text-slate-600 sm:grid-cols-2">
                {scanCategories.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>



          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Contact</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-7 text-slate-600">
              Media/contact: use the{" "}
              <Link href="/contact-sales" className="font-medium text-sky-700 hover:text-sky-800">
                Contact page
              </Link>
              .
            </CardContent>
          </Card>

          <WebsiteBehaviorScanCta />
          <DisclaimerBlock />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
