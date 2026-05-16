import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Guides",
  description: "Read guides about accessibility, privacy, cookie, and disclosure-related website signals.",
  path: "/guides"
});

const guides = [
  {
    href: "/guides/findings",
    title: "Top website scan findings",
    description: "Browse 19 common automated findings with density metrics, mitigation guidance, metadata, and sample JSON evidence."
  },
  {
    href: "/guides/pre-consent-tracking",
    title: "Tracking before consent",
    description: "Review what it means when tracking requests or non-essential cookies appear before a recorded consent choice."
  },
  {
    href: "/guides/cookie-consent-enforcement-checker",
    title: "Cookie consent enforcement",
    description: "Review whether observed cookies and tracking behavior appear aligned with consent choices."
  },
  {
    href: "/guides/rtb-cookie-syncing",
    title: "Third-party cookies and RTB sync",
    description: "Learn how identifier-sharing and cookie-sync signals can be reviewed with vendor evidence."
  },
  {
    href: "/guides/session-replay-risk",
    title: "Session replay risk",
    description: "Distinguish session recording service detection from rarer sensitive-input replay risk signals."
  },
  {
    href: "/guides/wcag-website-checklist",
    title: "Accessibility signals",
    description: "Review the most common public-facing accessibility signals that automated scans can surface."
  },
  {
    href: "/guides/cmp-verification",
    title: "CMP verification",
    description: "Use runtime observations to review whether CMP choices appear to affect browser behavior."
  },
  {
    href: "/guides/privacy-scanner-vs-cookie-scanner",
    title: "Privacy scanner vs cookie scanner",
    description: "Compare cookie inventory tools with behavior-oriented website privacy scanning."
  },
  {
    href: "/guides/website-consent-audit-checklist",
    title: "Website consent audit checklist",
    description: "Use a practical checklist for consent controls, cookie timing, tracking requests, and retained evidence."
  }
];

const relatedConsentGuides = [
  { href: "/guides/detect-trackers-before-cookie-consent", label: "detect trackers before cookie consent" },
  { href: "/guides/pre-consent-tracking-detection", label: "pre-consent tracking detection" },
  { href: "/guides/check-website-tracking-before-consent", label: "check website tracking before consent" },
  { href: "/guides/third-party-cookies-before-consent", label: "third-party cookies before consent" }
];

function GuideCheckIcon() {
  return (
    <span aria-hidden="true" className="relative flex h-6 w-6 shrink-0 items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(224,242,254,0.96)_0%,rgba(239,246,255,0.98)_100%)] ring-1 ring-sky-200" />
      <svg viewBox="0 0 24 24" className="relative h-4 w-4" aria-hidden="true">
        <path d="m7.3 12.1 3 3.1 6.5-7" fill="none" stroke="#0f8bd7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function GuidesPage() {
  const visibleGuides = guides.filter((guide) => guide.title.trim().length > 0);

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="max-w-2xl space-y-4">
        <Badge tone="neutral">Guides</Badge>
        <h1 className="text-4xl font-semibold tracking-tight">Guides</h1>
        <p className="text-lg text-slate-600">
          These guides explain the kinds of public website signals CertScore.ai looks for and how they support review over time.
        </p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {visibleGuides.map((guide) => (
          <Card key={guide.href} className="relative overflow-hidden border-slate-200 bg-white shadow-none">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]" />
            <CardHeader>
              <div className="flex items-start gap-3">
                <GuideCheckIcon />
                <CardTitle className="text-left">{guide.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">{guide.description}</p>
              <Button
                asChild
                size="sm"
                variant="secondary"
                className="border-sky-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(239,246,255,0.98)_100%)] text-slate-900 ring-1 ring-sky-200 hover:bg-sky-50"
              >
                <Link href={guide.href}>Explore</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-8 max-w-3xl rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
        <p>
          For a deeper evidence view, browse the{" "}
          <Link href="/guides/findings" className="font-medium text-sky-700 hover:text-sky-800">
            top website scan findings
          </Link>
          .{" "}
          For narrower consent-timing questions, see{" "}
          {relatedConsentGuides.map((guide, index) => (
            <span key={guide.href}>
              <Link href={guide.href} className="font-medium text-sky-700 hover:text-sky-800">
                {guide.label}
              </Link>
              {index < relatedConsentGuides.length - 2 ? ", " : index === relatedConsentGuides.length - 2 ? ", or " : "."}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
