"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { PendingButtonLink } from "../ui/pending-link";

type SiteNavLink = {
  href: string;
  label: string;
};

type MobileSiteNavProps = {
  navLinks: SiteNavLink[];
  resourceLinks: SiteNavLink[];
};

export function MobileSiteNav({ navLinks, resourceLinks }: MobileSiteNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const closeMenu = () => setIsOpen(false);

  return (
    <div className="relative md:hidden">
      <button
        aria-label="Open navigation menu"
        aria-controls={menuId}
        aria-expanded={isOpen}
        className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="sr-only">Open navigation menu</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
          <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      <div
        className={isOpen ? "absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-3 shadow-[0_22px_55px_rgba(15,23,42,0.14)]" : "hidden"}
        id={menuId}
      >
        <nav aria-label="Primary" className="flex flex-col">
          {navLinks.slice(0, 3).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-2xl px-4 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              onClick={closeMenu}
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
              onClick={closeMenu}
            >
              {link.label}
            </Link>
          ))}
          {navLinks.slice(3).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-2xl px-4 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              onClick={closeMenu}
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
              onClick={closeMenu}
              pendingContent="Opening..."
              size="sm"
              variant="secondary"
            />
          </div>
        </nav>
      </div>
    </div>
  );
}
