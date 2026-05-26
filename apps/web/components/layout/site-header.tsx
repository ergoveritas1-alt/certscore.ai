import Link from "next/link";
import CertScoreLogo from "../brand/CertScoreLogo";
import { PendingButtonLink } from "../ui/pending-link";

const navLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/findings", label: "Findings" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" }
];

const resourceLinks = [
  { href: "/gdpr", label: "GDPR privacy" },
  { href: "/ccpa", label: "CCPA privacy" },
  { href: "/ftc", label: "FTC disclosure" },
  { href: "/accessibility", label: "ADA accessibility" },
  { href: "/guides", label: "Guides" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/findings", label: "Findings" },
  { href: "/regulatory", label: "Regulatory pages" },
  { href: "/methodology", label: "Methodology" },
  { href: "/compare", label: "Compare" }
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="min-w-0 flex items-center overflow-visible">
          <CertScoreLogo compact showText className="shrink-0" />
        </div>

        <nav className="hidden items-center gap-3 md:flex">
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
          <PendingButtonLink
            className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_10px_24px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
            data-analytics-cta-location="header"
            data-analytics-event="guide_cta_clicked"
            href="/pricing"
            idleContent="Start trial"
            pendingContent="Opening..."
            size="sm"
          />
        </nav>

        <details className="relative md:hidden">
          <summary
            aria-label="Open navigation menu"
            className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950 [&::-webkit-details-marker]:hidden"
          >
            <span className="sr-only">Open navigation menu</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
              <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </summary>

          <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-3 shadow-[0_22px_55px_rgba(15,23,42,0.14)]">
            <nav className="flex flex-col">
              {navLinks.slice(0, 3).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-2xl px-4 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                >
                  {link.label}
                </Link>
              ))}
              <div className="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Resources
              </div>
              {resourceLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-2xl px-6 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                >
                  {link.label}
                </Link>
              ))}
              {navLinks.slice(3).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-2xl px-4 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                >
                  {link.label}
                </Link>
              ))}

              <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
                <PendingButtonLink
                  className="w-full justify-center"
                  data-analytics-cta-location="header"
                  data-analytics-event="sign_in_clicked"
                  href="/login"
                  idleContent="Sign in"
                  pendingContent="Opening..."
                  size="sm"
                  variant="secondary"
                />
                <PendingButtonLink
                  className="w-full justify-center border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_10px_24px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
                  data-analytics-cta-location="header"
                  data-analytics-event="guide_cta_clicked"
                  href="/pricing"
                  idleContent="Start trial"
                  pendingContent="Opening..."
                  size="sm"
                />
              </div>
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
