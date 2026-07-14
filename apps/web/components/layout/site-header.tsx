"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import CertScoreLogo from "../brand/CertScoreLogo";
import { PendingButtonLink } from "../ui/pending-link";

const navLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/solutions", label: "Solutions" },
  { href: "/findings", label: "Findings" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" }
];

const resourceLinks = [
  { href: "/browser-extension", label: "Chrome browser extension" },
  { href: "/solutions", label: "Scanner solutions" },
  { href: "/solutions/gdpr-website-compliance-scanner", label: "GDPR website scanner" },
  { href: "/solutions/cookie-consent-scanner", label: "Cookie consent scanner" },
  { href: "/solutions/privacy-policy-risk-scanner", label: "Privacy policy risk scanner" },
  { href: "/gdpr", label: "GDPR privacy" },
  { href: "/guides", label: "Guides" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/findings", label: "Findings" },
  { href: "/developers", label: "Developers" },
  { href: "/regulatory", label: "Regulatory pages" },
  { href: "/methodology", label: "Methodology" },
  { href: "/compare", label: "Compare" }
];

export function SiteHeader() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function linkClass(href: string) {
    return isActive(href)
      ? "rounded-lg bg-sky-50 px-2 py-1.5 text-sm font-semibold text-sky-800 ring-1 ring-inset ring-sky-200"
      : "rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-ink";
  }

  const resourcesActive = resourceLinks.some((link) => isActive(link.href));

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 shadow-[0_1px_10px_rgba(15,23,42,0.04)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <div className="min-w-0 flex items-center overflow-visible">
          <CertScoreLogo compact showText size="small" className="shrink-0" />
        </div>

        <nav className="hidden items-center gap-1.5 md:flex">
          {navLinks.slice(0, 3).map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined} className={linkClass(link.href)}>
              {link.label}
            </Link>
          ))}
          <details className="group relative">
            <summary
              aria-label="Resources navigation"
              aria-current={resourcesActive ? "page" : undefined}
              className={`flex cursor-pointer list-none items-center gap-0.5 rounded-lg px-2 py-1.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 [&::-webkit-details-marker]:hidden ${resourcesActive ? "bg-sky-50 font-semibold text-sky-800 ring-1 ring-inset ring-sky-200" : "text-slate-600 hover:bg-slate-50 hover:text-ink"}`}
            >
              <span>Resources</span>
              <svg viewBox="0 0 20 20" aria-hidden="true" className="-ml-0.5 h-4 w-4 transition group-open:rotate-180">
                <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="absolute left-0 top-[calc(100%+0.6rem)] z-50 w-64 border border-slate-200 bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
              <nav aria-label="Resources" className="flex flex-col">
                {resourceLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={`px-3 py-2 text-sm font-medium ${isActive(link.href) ? "bg-sky-50 text-sky-800" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"}`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </details>
          {navLinks.slice(3).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={link.label === "Contact"
                ? `rounded-xl border px-3 py-2 text-sm font-semibold transition ${isActive(link.href) ? "border-sky-300 bg-sky-100 text-sky-800 ring-2 ring-sky-100" : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800"}`
                : linkClass(link.href)}
            >
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

        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/contact"
            aria-current={isActive("/contact") ? "page" : undefined}
            className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
          >
            Contact
          </Link>
          <details className="relative">
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
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`rounded-2xl px-4 py-3 text-base font-medium transition ${isActive(link.href) ? "bg-sky-50 text-sky-800" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"}`}
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
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`rounded-2xl px-6 py-2 text-sm font-medium transition ${isActive(link.href) ? "bg-sky-50 text-sky-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
                >
                  {link.label}
                </Link>
              ))}
              {navLinks.slice(3).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`rounded-2xl px-4 py-3 text-base font-medium transition ${link.label === "Contact" ? "bg-sky-50 font-semibold text-sky-800" : isActive(link.href) ? "bg-sky-50 text-sky-800" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"}`}
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
              </div>
            </nav>
          </div>
          </details>
        </div>
      </div>
    </header>
  );
}
