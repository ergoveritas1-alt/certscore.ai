import Link from "next/link";
import { AnalyticsPreferencesButton } from "../analytics/analytics-consent-banner";

const footerSections = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Free scan" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/methodology", label: "Methodology" },
      { href: "/pricing", label: "Pricing" },
      { href: "/monitor-site", label: "Monitor a site" }
    ]
  },
  {
    title: "Use cases",
    links: [
      { href: "/guides/detect-tracking-before-consent", label: "Detect tracking before consent" },
      { href: "/guides/cookie-consent-enforcement-checker", label: "Verify cookie consent" },
      { href: "/guides/third-party-cookie-checker", label: "Review third-party tracking" },
      { href: "/monitor-site", label: "Monitor vendor changes" }
    ]
  },
  {
    title: "Resources",
    links: [
      { href: "/guides", label: "Guides" },
      { href: "/guides/findings", label: "Finding atlas" },
      { href: "/benchmarks/website-consent-tracking-2026", label: "Benchmarks" },
      { href: "/compare", label: "Compare" },
      { href: "/press", label: "Press" }
    ]
  }
];

const companyLegalLinks = [
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/privacy-request", label: "Privacy Request" }
];

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 text-sm text-slate-500">
        <div className="max-w-md space-y-2">
          <p className="font-medium text-slate-700">CertScore.ai</p>
          <p className="text-sm leading-6 text-slate-500">Evidence-led scanning for public website signals.</p>
        </div>
        <div className="grid gap-7 border-t border-slate-100 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {footerSections.map((section) => (
            <nav key={section.title} aria-label={section.title} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{section.title}</p>
              <div className="flex flex-col gap-2">
                {section.links.map((link) => (
                  <Link key={link.href} href={link.href} className="hover:text-slate-900">
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          ))}
          <nav aria-label="Company and legal" className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Company / Legal</p>
            <div className="flex flex-col gap-2">
              {companyLegalLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-slate-900"
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex justify-start">
                <AnalyticsPreferencesButton />
              </div>
              <Link data-analytics-cta-location="unknown" data-analytics-event="sign_in_clicked" href="/login" className="hover:text-slate-900">
                Sign in
              </Link>
            </div>
          </nav>
        </div>
        <div className="space-y-2 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-400">
          <p>CertScore surfaces automated public-web observations for review. It does not provide legal advice, certification, or compliance determinations.</p>
          <p>
            Privacy rights requests can be submitted at <Link href="/privacy-request" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">certscore.ai/privacy-request</Link> or by emailing <a href="mailto:privacy@certscore.ai" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">privacy@certscore.ai</a>.
          </p>
          <p>Copyright © 2026 CertScore.ai. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
