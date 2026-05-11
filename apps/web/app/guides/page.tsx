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
    href: "/guides/pre-consent-tracking",
    title: "Pre-consent tracking",
    description: "Review what it means when tracking requests or non-essential cookies appear before a recorded consent choice."
  },
  {
    href: "/guides/third-party-cookies-before-consent",
    title: "Third-party cookies before consent",
    description: "Understand how third-party cookie timing can become a reviewable risk signal."
  },
  {
    href: "/guides/rtb-cookie-syncing",
    title: "RTB cookie syncing",
    description: "Learn how identifier-sharing and cookie-sync signals can be reviewed with vendor evidence."
  },
  {
    href: "/guides/session-replay-risk",
    title: "Session replay risk",
    description: "Distinguish session recording service detection from rarer sensitive-input replay risk signals."
  },
  {
    href: "/guides/accessibility-homepage-signals",
    title: "Accessibility homepage signals",
    description: "Review automated homepage accessibility signals without treating them as a full WCAG audit."
  },
  {
    href: "/guides/check-website-tracking-before-consent",
    title: "Check tracking before consent",
    description: "A practical overview of reviewing first-load tracking behavior against consent timing."
  },
  {
    href: "/guides/check-third-party-cookies-before-consent",
    title: "Check third-party cookies before consent",
    description: "A practical overview of reviewing third-party cookie timing before a consent choice."
  },
  {
    href: "/guides/website-consent-audit",
    title: "Website consent audit",
    description: "Learn how to compare consent interface behavior with observed website tracking and cookie activity."
  },
  {
    href: "/guides/website-privacy-policy-requirements",
    title: "Privacy policy signals",
    description: "See which privacy-rights, retention, and disclosure cues commonly appear in policy scans."
  },
  {
    href: "/guides/cookie-banner-requirements",
    title: "Cookie banner basics",
    description: "Understand the banner controls, consent patterns, and cookie signals the scanner looks for."
  },
  {
    href: "/guides/website-disclosure-requirements",
    title: "Disclosure signals",
    description: "Learn how policy, terms, and disclosure pages contribute to structured website monitoring."
  },
  {
    href: "/guides/wcag-website-checklist",
    title: "WCAG website checklist",
    description: "Review the most common public-facing accessibility signals that automated scans can surface."
  }
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
              <div className="flex items-center gap-3">
                <GuideCheckIcon />
                <CardTitle>{guide.title}</CardTitle>
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
    </section>
  );
}
