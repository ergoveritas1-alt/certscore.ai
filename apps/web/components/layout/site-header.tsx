import Link from "next/link";
import CertScoreLogo from "../brand/CertScoreLogo";
import { PendingButtonLink } from "../ui/pending-link";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/methodology", label: "Methodology" },
  { href: "/guides", label: "Guides" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/compare", label: "Compare" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact-sales", label: "Contact" }
];

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="min-w-0 flex items-center overflow-visible">
          <CertScoreLogo compact showText className="sm:hidden" />
          <CertScoreLogo compact showText className="hidden sm:inline-flex md:hidden" />
          <CertScoreLogo className="hidden md:inline-flex" />
        </div>

        <nav className="hidden items-center gap-3 md:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-ink">
              {link.label}
            </Link>
          ))}
          <PendingButtonLink
            className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_10px_24px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
            data-analytics-cta-location="header"
            data-analytics-event="guide_cta_clicked"
            href="/"
            idleContent="Free scan"
            pendingContent="Opening..."
            size="sm"
          />
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
              {navLinks.map((link) => (
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
                  className="w-full justify-center border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_10px_24px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
                  data-analytics-cta-location="header"
                  data-analytics-event="guide_cta_clicked"
                  href="/"
                  idleContent="Free scan"
                  pendingContent="Opening..."
                  size="sm"
                />
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
              </div>
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
