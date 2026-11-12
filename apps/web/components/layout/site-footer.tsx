import Link from "next/link";
import { AnalyticsPreferencesButton } from "../analytics/analytics-consent-banner";
import { SocialFollowLinks } from "../releases/social-follow-links";
import { FOOTER_COPYRIGHT_COPY, FOOTER_DISCLAIMER_COPY } from "./footer-copy";

const footerSections = [
  {
    title: "Product",
    links: [
      { href: "/#homepage-scan", label: "Run free scan" },
      { href: "/sample-report", label: "View sample report" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/solutions", label: "Solutions" },
      { href: "/pricing", label: "Pricing" }
    ]
  },
  {
    title: "Resources",
    links: [
      { href: "/guides", label: "Guides" },
      { href: "/findings", label: "Findings" },
      { href: "/releases", label: "Research & releases" },
      { href: "/methodology", label: "Methodology" }
    ]
  },
  {
    title: "Developers",
    links: [
      { href: "/developers/reference", label: "API reference" },
      { href: "/developers/sdk", label: "SDK documentation" },
      { href: "/developers/mcp", label: "MCP integration" }
    ]
  },
  {
    title: "Company",
    links: [
      { href: "/what-is-certscore", label: "About CertScore.ai" },
      { href: "/contact-sales", label: "Contact" },
      { href: "/security", label: "Security" }
    ]
  }
];

const legalLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy-request", label: "Privacy requests" }
];

function FooterLinks({ links }: { links: (typeof footerSections)[number]["links"] }) {
  return (
    <ul className="space-y-1">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className={`inline-flex min-h-11 items-center rounded py-2 transition hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:min-h-0 sm:py-1.5 ${link.href === "/#homepage-scan" || link.href === "/sample-report" ? "font-semibold text-sky-700" : "text-slate-600"}`}
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

type SiteFooterProps = {
  hideDisclaimer?: boolean;
  highContrast?: boolean;
  wide?: boolean;
};

export function SiteFooter({ hideDisclaimer = false, wide = true, highContrast = false }: SiteFooterProps = {}) {
  return (
    <footer className={`border-t border-slate-200 bg-white ${highContrast ? "[&_.text-slate-400]:text-slate-600" : ""}`}>
      <div className={`mx-auto py-8 text-sm text-slate-600 sm:py-10 ${wide ? "max-w-[90rem] px-5 lg:px-10" : "max-w-6xl px-4 sm:px-6"}`}>
        {!hideDisclaimer ? (
          <p className="mb-6 text-xs leading-5 text-slate-500">{FOOTER_DISCLAIMER_COPY}</p>
        ) : null}
        <div className="hidden gap-8 sm:grid sm:grid-cols-2 lg:grid-cols-4">
          {footerSections.map((section) => (
            <nav key={section.title} aria-label={`Footer ${section.title}`} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{section.title}</h2>
              <FooterLinks links={section.links} />
            </nav>
          ))}
        </div>
        <nav aria-label="Footer navigation" className="divide-y divide-slate-100 sm:hidden">
          {footerSections.map((section) => (
            <details key={section.title} name="footer-navigation-group" open={section.title === "Product"} className="group/footer">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between rounded py-4 font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden">
                {section.title}
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 text-slate-500 transition group-open/footer:rotate-180">
                  <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div className="pb-4"><FooterLinks links={section.links} /></div>
            </details>
          ))}
        </nav>
        <div className="mt-7 space-y-5 border-t border-slate-200 pt-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <nav aria-label="Legal and privacy" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs [&_button]:min-h-11 [&_button]:py-2 sm:[&_button]:min-h-0">
              {legalLinks.map((link) => (
                <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center rounded py-2 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:min-h-0">{link.label}</Link>
              ))}
              <AnalyticsPreferencesButton />
            </nav>
            <SocialFollowLinks compact />
          </div>
          <p className="text-xs leading-5 text-slate-500">{FOOTER_COPYRIGHT_COPY}</p>
        </div>
      </div>
    </footer>
  );
}
