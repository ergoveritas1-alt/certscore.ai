import Link from "next/link";
import { getCertScoreGptUrl } from "../../lib/marketing/certscore-gpt";
import { AnalyticsPreferencesButton } from "../analytics/analytics-consent-banner";
import { FOOTER_COPYRIGHT_COPY, FOOTER_DISCLAIMER_COPY } from "./footer-copy";

const footerSections = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Home" },
      { href: "/solutions", label: "Solutions" },
      { href: "/how-it-works", label: "How It Works" },
      { href: "/browser-extension", label: "Chrome extension" },
      { href: "/findings", label: "Findings" },
      { href: "/developers", label: "Developers" },
      { href: "/pricing", label: "Pricing" }
    ]
  },
  {
    title: "Resources",
    links: [
      { href: "/guides", label: "Guides" },
      { href: "/benchmarks", label: "Benchmarks" },
      { href: "/findings", label: "Findings" },
      { href: "/developers/reference", label: "API reference" },
      { href: "/developers/sdk", label: "SDK docs" },
      { href: "/developers/mcp", label: "MCP docs" },
      { href: "/regulatory", label: "Regulatory pages" },
      { href: "/gdpr", label: "GDPR privacy scanner" },
      { href: "/ftc", label: "FTC disclosure scanner" },
      { href: "/accessibility", label: "ADA accessibility scanner" },
      { href: "/methodology", label: "Methodology" },
      { href: "/compare", label: "Compare" }
    ]
  },
  {
    title: "Use cases",
    links: [
      { href: "/solutions/gdpr-website-compliance-scanner", label: "GDPR website scanner" },
      { href: "/solutions/cookie-consent-scanner", label: "Cookie consent scanner" },
      { href: "/solutions/privacy-policy-risk-scanner", label: "Privacy policy risk scanner" },
      { href: "/guides/detect-tracking-before-consent", label: "Detect tracking before consent" },
      { href: "/guides/cookie-consent-enforcement-checker", label: "Verify cookie consent" },
      { href: "/guides/third-party-cookie-checker", label: "Review third-party tracking" },
      { href: "/monitor-site", label: "Monitor vendor changes" }
    ]
  }
];

const companyLegalLinks = [
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy-request", label: "Privacy Request" },
  { href: "/login", label: "Sign in", analyticsEvent: "sign_in_clicked" }
];

export function SiteFooter() {
  const certscoreGptUrl = getCertScoreGptUrl();
  const sections = footerSections.map((section) =>
    section.title === "Resources"
      ? {
          ...section,
          links: [
            ...section.links,
            {
              href: certscoreGptUrl,
              label: "CertScore.ai GPT beta",
              external: true,
              analyticsEvent: "gpt_cta_clicked",
              analyticsLocation: "footer"
            }
          ]
        }
      : section
  );
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 text-sm text-slate-500">
        <div className="space-y-2">
          <p className="font-medium text-slate-700">CertScore.ai</p>
          <p className="text-sm leading-6 text-slate-500">Evidence-led scanning for public website signals.</p>
          <p className="max-w-none text-xs leading-5 text-slate-500 lg:whitespace-nowrap">
            {FOOTER_DISCLAIMER_COPY}
          </p>
        </div>
        <div className="grid gap-7 border-t border-slate-100 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {sections.map((section) => (
            <nav key={section.title} aria-label={section.title} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{section.title}</p>
              <div className="flex flex-col gap-2">
                {section.links.map((link) =>
                  "external" in link && link.external ? (
                    <a
                      key={link.href}
                      className="hover:text-slate-900"
                      data-analytics-cta-location={link.analyticsLocation}
                      data-analytics-destination-url={link.href}
                      data-analytics-event={link.analyticsEvent}
                      href={link.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link key={link.href} href={link.href} className="hover:text-slate-900">
                      {link.label}
                    </Link>
                  )
                )}
              </div>
            </nav>
          ))}
          <nav aria-label="Company and legal" className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Company / Legal</p>
            <div className="flex flex-col gap-2">
              {companyLegalLinks.map((link) => (
                <Link
                  key={link.href}
                  data-analytics-cta-location={link.analyticsEvent ? "unknown" : undefined}
                  data-analytics-event={link.analyticsEvent}
                  href={link.href}
                  className="hover:text-slate-900"
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex justify-start">
                <AnalyticsPreferencesButton />
              </div>
            </div>
          </nav>
        </div>
        <div className="space-y-2 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-400">
          <p>
            Privacy rights requests can be submitted at <Link href="/privacy-request" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">certscore.ai/privacy-request</Link> or by emailing <a href="mailto:privacy@certscore.ai" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">privacy@certscore.ai</a>.
          </p>
          <p>{FOOTER_COPYRIGHT_COPY}</p>
        </div>
      </div>
    </footer>
  );
}
