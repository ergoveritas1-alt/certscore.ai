"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import CertScoreLogo from "../brand/CertScoreLogo";
import { PendingButtonLink } from "../ui/pending-link";

const navLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" }
];

const resourceGroups = [
  {
    label: "Scan & integrate",
    links: [
      { href: "/solutions", label: "Scanner solutions" },
      { href: "/browser-extension", label: "Chrome browser extension" },
      { href: "/developers", label: "Developers · API, SDK & MCP" }
    ]
  },
  {
    label: "Privacy workflows",
    links: [
      { href: "/ccpa", label: "CCPA / California review" },
      { href: "/solutions/gdpr-website-compliance-scanner", label: "GDPR website scanner" },
      { href: "/solutions/cookie-consent-scanner", label: "Cookie consent scanner" },
      { href: "/solutions/privacy-policy-risk-scanner", label: "Privacy policy risk scanner" },
      { href: "/regulatory", label: "Regulatory pages" }
    ]
  },
  {
    label: "Evidence & guidance",
    links: [
      { href: "/findings", label: "Findings" },
      { href: "/gdpr", label: "GDPR evidence guide" },
      { href: "/guides", label: "Guides" },
      { href: "/methodology", label: "Methodology" }
    ]
  },
  {
    label: "Research & updates",
    links: [
      { href: "/benchmarks", label: "Benchmarks" },
      { href: "/releases", label: "Releases" },
      { href: "/compare", label: "Compare" }
    ]
  }
];

type SiteHeaderProps = {
  mobilePrimaryAction?: "contact" | "sign-in";
  wide?: boolean;
  accountLink?: { href: string; label: string };
};

export function SiteHeader({ mobilePrimaryAction = "contact", wide = true, accountLink = { href: "/login", label: "Sign in" } }: SiteHeaderProps = {}) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function linkClass(href: string) {
    return isActive(href)
      ? "rounded-lg bg-sky-50 px-2 py-1.5 text-sm font-semibold text-sky-800 ring-1 ring-inset ring-sky-200"
      : "rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-ink";
  }

  const activeResourceHref = resourceGroups.flatMap((group) => group.links)
    .filter((link) => isActive(link.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const resourcesActive = Boolean(activeResourceHref);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 shadow-[0_1px_10px_rgba(15,23,42,0.04)] backdrop-blur">
      <div className={`mx-auto flex items-center justify-between gap-2 min-[360px]:gap-3 py-3.5 ${wide ? "max-w-[90rem] px-3 min-[360px]:px-5 lg:px-10" : "max-w-6xl px-4 sm:px-6"}`}>
        <div className="min-w-0 flex items-center overflow-visible">
          <CertScoreLogo compact showText size="small" className="shrink-0" />
        </div>

        <nav className="relative hidden items-center gap-1.5 md:flex">
          {navLinks.slice(0, 2).map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined} className={linkClass(link.href)}>
              {link.label}
            </Link>
          ))}
          <details className="group">
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
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 max-h-[calc(100dvh-6rem)] w-[min(640px,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
              <nav aria-label="Resources" className="grid grid-cols-2 gap-x-6 gap-y-5">
                {resourceGroups.map((group) => (
                  <section key={group.label} aria-label={group.label}>
                    <h2 className="mb-2 border-b border-slate-100 px-3 pb-2 text-xs font-semibold uppercase tracking-[0.1em] text-sky-800">{group.label}</h2>
                    <ul className="space-y-0.5">
                      {group.links.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            aria-current={link.href === activeResourceHref ? "page" : undefined}
                            className={`flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${link.href === activeResourceHref ? "bg-sky-50 text-sky-800" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"}`}
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </nav>
            </div>
          </details>
          {navLinks.slice(2).map((link) => (
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
            data-analytics-event={accountLink.label === "Sign in" ? "sign_in_clicked" : undefined}
            href={accountLink.href}
            idleContent={accountLink.label}
            pendingContent="Opening..."
            size="sm"
            variant="secondary"
          />
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          {mobilePrimaryAction === "sign-in" ? (
            <PendingButtonLink
              data-analytics-cta-location="header"
              data-analytics-event={accountLink.label === "Sign in" ? "sign_in_clicked" : undefined}
              href={accountLink.href}
              idleContent={accountLink.label}
              pendingContent="Opening..."
              size="sm"
              variant="secondary"
            />
          ) : (
            <Link
              href="/contact-sales"
              aria-current={isActive("/contact") ? "page" : undefined}
              className="hidden min-[360px]:inline-flex rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
            >
              Contact
            </Link>
          )}
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

          <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(21rem,calc(100vw-2rem))] max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain rounded-[1.75rem] border border-slate-200 bg-white p-3 shadow-[0_22px_55px_rgba(15,23,42,0.14)]">
            <nav className="flex flex-col">
              <div className="grid gap-2">
                <PendingButtonLink
                  className="w-full justify-center"
                  data-analytics-cta-location="header"
                  data-analytics-event={accountLink.label === "Sign in" ? "sign_in_clicked" : undefined}
                  href={accountLink.href}
                  idleContent={accountLink.label}
                  pendingContent="Opening..."
                  size="sm"
                  variant="secondary"
                />
              </div>
              <Link href="/contact-sales" className="rounded-2xl bg-sky-50 px-4 py-3 text-base font-semibold text-sky-800">Contact</Link>
              {navLinks.filter((link) => link.href !== "/contact").map((link) => (
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
              <div className="space-y-1">
                {resourceGroups.map((group) => (
                  <details key={group.label} name="mobile-resource-group" className="group/resource rounded-xl border border-slate-100 bg-slate-50/60" open={group.links.some((link) => link.href === activeResourceHref) || undefined}>
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden">
                      {group.label}
                      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500 transition group-open/resource:rotate-180">
                        <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    <ul className="px-2 pb-2">
                      {group.links.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            aria-current={link.href === activeResourceHref ? "page" : undefined}
                            className={`flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${link.href === activeResourceHref ? "bg-sky-50 text-sky-800" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>


            </nav>
          </div>
          </details>
        </div>
      </div>
    </header>
  );
}
