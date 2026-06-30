import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  createBreadcrumbSchema,
  createItemListSchema,
  createPageMetadata,
  createPublicWebPageSchema
} from "../../lib/seo";

type GuideCategory =
  | "Accessibility"
  | "Cookies & Storage"
  | "Privacy & Tracking"
  | "Policy & Disclosure"
  | "Scanning Basics"
  | "Solutions";

type GuideCard = {
  category: GuideCategory;
  description: string;
  href: string;
  title: string;
};

const guides: GuideCard[] = [
  {
    title: "Website Scanning Basics",
    description: "How automated scans turn public website behavior into reviewable evidence.",
    category: "Scanning Basics",
    href: "/guides/website-scanning-basics"
  },
  {
    title: "Website Signal Review Checklist",
    description: "A practical overview for reviewing privacy, accessibility, policy, and disclosure signals.",
    category: "Scanning Basics",
    href: "/guides/website-signal-check"
  },
  {
    title: "GDPR website compliance scanner",
    description: "Scanner page for GDPR-relevant consent, cookie, tracking, policy, and disclosure review signals.",
    category: "Solutions",
    href: "/solutions/gdpr-website-compliance-scanner"
  },
  {
    title: "Cookie consent scanner",
    description: "Scanner page for cookie consent timing, third-party cookies, CMP behavior, and reject-path signals.",
    category: "Solutions",
    href: "/solutions/cookie-consent-scanner"
  },
  {
    title: "Privacy policy risk scanner",
    description: "Scanner page for comparing privacy disclosures with observable public website behavior.",
    category: "Solutions",
    href: "/solutions/privacy-policy-risk-scanner"
  },
  {
    title: "Pre-consent tracking",
    description: "What it means when tracking requests appear before a recorded consent choice.",
    category: "Privacy & Tracking",
    href: "/guides/pre-consent-tracking"
  },
  {
    title: "Detect trackers before cookie consent",
    description: "How to review tracker behavior during the initial page-load window.",
    category: "Privacy & Tracking",
    href: "/guides/detect-trackers-before-cookie-consent"
  },
  {
    title: "Detect tracking before consent",
    description: "A practical workflow for finding tracking requests before a consent event.",
    category: "Privacy & Tracking",
    href: "/guides/detect-tracking-before-consent"
  },
  {
    title: "Check website tracking before consent",
    description: "How teams can inspect public site behavior before any consent choice.",
    category: "Privacy & Tracking",
    href: "/guides/check-website-tracking-before-consent"
  },
  {
    title: "Reject consent tracking test",
    description: "Review whether a reject interaction changes observed tracker behavior.",
    category: "Privacy & Tracking",
    href: "/guides/reject-consent-tracking-test"
  },
  {
    title: "RTB cookie syncing",
    description: "Review identifier-sharing and adtech cookie-sync signals.",
    category: "Privacy & Tracking",
    href: "/guides/rtb-cookie-syncing"
  },
  {
    title: "Session replay risk",
    description: "Understand session recording and sensitive-input replay indicators.",
    category: "Privacy & Tracking",
    href: "/guides/session-replay-risk"
  },
  {
    title: "Website fingerprinting signals",
    description: "Review fingerprinting-related runtime and device-signal evidence.",
    category: "Privacy & Tracking",
    href: "/guides/website-fingerprinting"
  },
  {
    title: "Cookie banner requirements",
    description: "Review visible banner controls and whether they align with runtime behavior.",
    category: "Cookies & Storage",
    href: "/guides/cookie-banner-requirements"
  },
  {
    title: "Cookie consent laws",
    description: "Educational overview of cookie-consent topics teams commonly review.",
    category: "Cookies & Storage",
    href: "/guides/cookie-consent-laws"
  },
  {
    title: "Cookie consent enforcement checker",
    description: "How runtime checks help verify consent-control behavior.",
    category: "Cookies & Storage",
    href: "/guides/cookie-consent-enforcement-checker"
  },
  {
    title: "Third-party cookies before consent",
    description: "Review third-party cookie timing before a recorded consent choice.",
    category: "Cookies & Storage",
    href: "/guides/third-party-cookies-before-consent"
  },
  {
    title: "Third-party cookie checker",
    description: "How to inspect cookie domains, names, and related vendor evidence.",
    category: "Cookies & Storage",
    href: "/guides/third-party-cookie-checker"
  },
  {
    title: "CMP verification",
    description: "Compare consent-platform UI signals with observed runtime behavior.",
    category: "Cookies & Storage",
    href: "/guides/cmp-verification"
  },
  {
    title: "Accessibility homepage signals",
    description: "Automated homepage accessibility signals for triage and review.",
    category: "Accessibility",
    href: "/guides/accessibility-homepage-signals"
  },
  {
    title: "ADA website compliance",
    description: "Educational accessibility guide for public website review signals.",
    category: "Accessibility",
    href: "/guides/ada-website-compliance"
  },
  {
    title: "WCAG website checklist",
    description: "A practical checklist for contrast, labels, alt text, structure, and keyboard access.",
    category: "Accessibility",
    href: "/guides/wcag-website-checklist"
  },
  {
    title: "Privacy policy requirements",
    description: "Review whether public privacy policy content covers expected topics.",
    category: "Policy & Disclosure",
    href: "/guides/website-privacy-policy-requirements"
  },
  {
    title: "Privacy policy examples",
    description: "Use examples to compare policy structure against observed site behavior.",
    category: "Policy & Disclosure",
    href: "/guides/privacy-policy-examples"
  },
  {
    title: "Website disclosure requirements",
    description: "Review endorsement, affiliate, testimonial, and promotional disclosure signals.",
    category: "Policy & Disclosure",
    href: "/guides/website-disclosure-requirements"
  },
  {
    title: "Findings reference",
    description: "Browse CertScore finding definitions and representative evidence.",
    category: "Scanning Basics",
    href: "/findings"
  }
];

const categories = Array.from(new Set(guides.map((guide) => guide.category)));

export const metadata: Metadata = createPageMetadata({
  title: "CertScore.ai Guides",
  description:
    "Browse CertScore.ai guides for privacy, cookies, consent, accessibility, policy, disclosure, and website scanning signals.",
  path: "/guides"
});

type GuidesPageProps = {
  searchParams?: Promise<{ category?: string; q?: string }>;
};

export default async function GuidesPage({
  searchParams
}: GuidesPageProps) {
  const resolvedSearchParams = await searchParams;
  const selectedCategory = categories.find((category) => category === resolvedSearchParams?.category);
  const query = resolvedSearchParams?.q?.trim().toLowerCase() ?? "";
  const visibleGuides = guides.filter((guide) => {
    const categoryMatches = selectedCategory ? guide.category === selectedCategory : true;
    const queryMatches = query
      ? `${guide.title} ${guide.description} ${guide.category}`.toLowerCase().includes(query)
      : true;

    return categoryMatches && queryMatches;
  });
  const schemas = [
    createPublicWebPageSchema({
      title: "CertScore.ai Guides",
      description:
        "Browse CertScore.ai guides for privacy, cookies, consent, accessibility, policy, disclosure, and website scanning signals.",
      path: "/guides"
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides" }
    ]),
    createItemListSchema({
      name: "CertScore.ai guides",
      description: "Public CertScore.ai educational guide pages.",
      path: "/guides",
      items: guides.map((guide) => ({
        name: guide.title,
        description: guide.description,
        path: guide.href
      }))
    })
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

      <div className="max-w-3xl space-y-4">
        <Badge tone="neutral">Guides</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">CertScore.ai guides</h1>
        <p className="text-lg leading-8 text-slate-600">
          Browse evidence-backed guides for public website privacy, cookies, consent, accessibility, policy,
          disclosure, and scanning workflows.
        </p>
      </div>

      <Card className="mt-8 border-slate-200 bg-white shadow-none">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
          <form action="/guides" className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Search guides
              <input
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                defaultValue={resolvedSearchParams?.q ?? ""}
                name="q"
                placeholder="tracking, WCAG, policy..."
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Category
              <select
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                defaultValue={selectedCategory ?? ""}
                name="category"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <Button
              className="h-11 border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
              type="submit"
            >
              Filter
            </Button>
          </form>
          {(query || selectedCategory) ? (
            <Link className="text-sm font-medium text-sky-700 hover:text-sky-900" href="/guides">
              Clear filters
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleGuides.map((guide) => (
          <Link key={guide.href} href={guide.href} className="group block">
            <Card className="h-full border-slate-200 bg-white shadow-none transition group-hover:border-sky-200 group-hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
              <CardHeader className="space-y-3">
                <div>
                  <Badge tone="neutral">{guide.category}</Badge>
                </div>
                <CardTitle className="text-xl text-slate-950">{guide.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-600">{guide.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {visibleGuides.length === 0 ? (
        <Card className="mt-8 border-slate-200 bg-white shadow-none">
          <CardContent className="p-6 text-sm leading-6 text-slate-600">
            No guides match the current filters.
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
