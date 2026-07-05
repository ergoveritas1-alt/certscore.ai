import Link from "next/link";
import CertScoreLogo from "../brand/CertScoreLogo";
import { PendingButtonLink } from "../ui/pending-link";
import { BaseStructuredData } from "./base-structured-data";
import { MobileSiteNav } from "./mobile-site-nav";

const navLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/solutions", label: "Solutions" },
  { href: "/findings", label: "Findings" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" }
];

const resourceLinks = [
  { href: "/solutions", label: "Scanner solutions" },
  { href: "/solutions/gdpr-website-compliance-scanner", label: "GDPR website scanner" },
  { href: "/solutions/cookie-consent-scanner", label: "Cookie consent scanner" },
  { href: "/solutions/privacy-policy-risk-scanner", label: "Privacy policy risk scanner" },
  { href: "/gdpr", label: "GDPR privacy" },
  { href: "/ftc", label: "FTC disclosure" },
  { href: "/accessibility", label: "ADA accessibility" },
  { href: "/guides", label: "Guides" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/findings", label: "Findings" },
  { href: "/developers", label: "Developers" },
  { href: "/regulatory", label: "Regulatory pages" },
  { href: "/methodology", label: "Methodology" },
  { href: "/compare", label: "Compare" }
];

type SiteHeaderProps = {
  includeBaseStructuredData?: boolean;
};

export function SiteHeader({ includeBaseStructuredData = true }: SiteHeaderProps) {
  return (
    <>
      {includeBaseStructuredData ? <BaseStructuredData /> : null}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex items-center overflow-visible">
            <CertScoreLogo compact showText className="shrink-0" />
          </div>

          <nav aria-label="Primary" className="hidden items-center gap-3 md:flex">
            {navLinks.slice(0, 3).map((link) => (
              <Link key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-ink">
                {link.label}
              </Link>
            ))}
            <details className="group relative">
              <summary
                aria-label="Resources navigation"
                className="flex cursor-pointer list-none items-center gap-1 rounded-md px-1 py-1 text-sm text-slate-600 hover:text-ink focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 [&::-webkit-details-marker]:hidden"
              >
                <span>Resources</span>
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 transition group-open:rotate-180">
                  <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div className="absolute left-0 top-[calc(100%+0.6rem)] z-50 w-64 border border-slate-200 bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
                <nav aria-label="Resources" className="flex flex-col">
                  {resourceLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </details>
            {navLinks.slice(3).map((link) => (
              <Link key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-ink">
                {link.label}
              </Link>
            ))}
            <PendingButtonLink
              data-analytics-cta-location="header"
              data-analytics-event="sign_in_clicked"
              href="/login"
              idleContent="Sign in"
              pendingContent="Opening..."
              size="sm"
              variant="secondary"
            />
          </nav>

          <MobileSiteNav navLinks={navLinks} resourceLinks={resourceLinks} />
        </div>
      </header>
    </>
  );
}
