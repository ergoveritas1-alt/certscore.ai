"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode, type SVGProps } from "react";

type NavIconProps = SVGProps<SVGSVGElement>;

function OverviewIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" />
      <path d="M9.5 20v-5h5v5" />
    </svg>
  );
}

function SignalsIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <path d="M4 18h4v-6H4v6Zm6 0h4V6h-4v12Zm6 0h4V10h-4v8Z" />
    </svg>
  );
}

function ScansIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
      <path d="M11 8v3.2l2.2 1.3" />
    </svg>
  );
}

function ChangesIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <path d="M5 7h9M5 12h14M5 17h7" />
      <path d="m16 5 3 2-3 2M14 15l-3 2 3 2" />
    </svg>
  );
}

function SettingsIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.2 13.4V10.6l-2-.6a5.7 5.7 0 0 0-.5-1.1l1-1.8-2-2-1.8 1a5.7 5.7 0 0 0-1.1-.5l-.6-2h-2.8l-.6 2a5.7 5.7 0 0 0-1.1.5l-1.8-1-2 2 1 1.8a5.7 5.7 0 0 0-.5 1.1l-2 .6v2.8l2 .6a5.7 5.7 0 0 0 .5 1.1l-1 1.8 2 2 1.8-1a5.7 5.7 0 0 0 1.1.5l.6 2h2.8l.6-2a5.7 5.7 0 0 0 1.1-.5l1.8 1 2-2-1-1.8a5.7 5.7 0 0 0 .5-1.1l2-.6Z" />
    </svg>
  );
}

function FeedbackIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <path d="M8.5 16.5h7M8.5 12h7M8.5 7.5h4.5" />
      <path d="M6 4.5h12A1.5 1.5 0 0 1 19.5 6v9A1.5 1.5 0 0 1 18 16.5H11l-4.5 3v-3H6A1.5 1.5 0 0 1 4.5 15V6A1.5 1.5 0 0 1 6 4.5Z" />
    </svg>
  );
}

function LogoutIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <path d="M9 4.5H6.5A2.5 2.5 0 0 0 4 7v10a2.5 2.5 0 0 0 2.5 2.5H9" />
      <path d="M14 8.5 18 12l-4 3.5M18 12H9" />
    </svg>
  );
}

function ShieldIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <path d="M12 3.8 18.5 6v5.7c0 4.1-2.3 7.2-6.5 8.5-4.2-1.3-6.5-4.4-6.5-8.5V6L12 3.8Z" />
      <path d="m9.5 12 1.7 1.7L14.8 10" />
    </svg>
  );
}

function PlanIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <path d="M3.5 9.5h17" />
      <path d="M8 14h3.5M14.5 14H16" />
    </svg>
  );
}

const navItems = [
  { href: "/app", label: "Overview", icon: OverviewIcon },
  { href: "/app/signals", label: "Scan view", icon: SignalsIcon },
  { href: "/app/scans", label: "Scan History", icon: ScansIcon },
  { href: "/app/modify-plan", label: "Modify plan", icon: PlanIcon },
  { href: "/app/settings", label: "Settings", icon: SettingsIcon }
] as const;

type AppShellProps = {
  children: ReactNode;
  isPlatformAdmin?: boolean;
  organizationName: string;
  plan: string;
  userEmail: string;
};

function isItemActive(pathname: string, href: string) {
  if (href === "/app/signals") {
    return pathname === href || pathname.startsWith("/app/scans/");
  }

  if (href === "/app/scans") {
    return pathname === href;
  }

  if (href === "/app") {
    return pathname === "/app";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

const COLLAPSED_NAV_WIDTH = "lg:w-[65px]";
const COLLAPSED_NAV_PANEL_WIDTH = "w-[65px]";
const EXPANDED_NAV_PANEL_WIDTH = "w-[248px]";

export function AppShell({ children, organizationName, plan, userEmail, isPlatformAdmin = false }: AppShellProps) {
  const pathname = usePathname();
  const userInitial = userEmail.slice(0, 1).toUpperCase();
  const displayOrganizationName = organizationName.replace(/\s+workspace$/i, "");
  const displayPlan = plan === "free" ? "FREE" : plan === "pro" ? "PRO" : "ULTRA";
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(false);
  const scopedNavItems = isPlatformAdmin
    ? [...navItems, { href: "/app/admin", label: "Admin", icon: ShieldIcon }]
    : navItems;

  useEffect(() => {
    setAccountMenuOpen(false);
    setNavExpanded(false);
  }, [pathname]);

  function closeNav() {
    setNavExpanded(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col">
        <header className="border-b border-slate-800 bg-slate-950 pl-[17px] pr-6 pt-2 pb-0 text-white">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-[33px] items-center overflow-hidden">
                <Image
                  src="/certscore_blk_logo.png"
                  alt="CertScore.ai"
                  width={33}
                  height={33}
                  className="rounded-[1.2rem] border border-slate-800 bg-slate-900/80"
                  priority
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14px] font-medium leading-tight text-white">{displayOrganizationName}</p>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-300">
                    {displayPlan}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end lg:self-auto">
              <Link
                href="/app/feedback"
                className="inline-flex items-center gap-2 rounded-full border border-slate-800 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white"
              >
                <FeedbackIcon className="h-4 w-4" />
                <span>Feedback</span>
              </Link>

              <div className="relative">
                <button
                  type="button"
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setAccountMenuOpen((value) => !value)}
                  className="flex items-center rounded-full border border-slate-800 bg-slate-900 px-1.5 py-1.5 text-left transition hover:border-slate-700 hover:bg-slate-900"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-300 text-sm font-semibold uppercase text-slate-950">
                    {userInitial}
                  </span>
                </button>

                {accountMenuOpen ? (
                  <div className="absolute right-0 z-30 mt-3 w-52 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-[0_24px_60px_rgba(2,6,23,0.65)]">
                    <div className="space-y-1">
                      <Link
                        href="/app/settings"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-200 transition hover:bg-slate-900 hover:text-white"
                      >
                        <SettingsIcon className="h-4 w-4 shrink-0" />
                        <span>Settings</span>
                      </Link>
                      <form action="/logout" method="post">
                        <button
                          type="submit"
                          className="flex w-full items-center gap-3 rounded-xl bg-slate-900 px-3 py-2.5 text-sm text-slate-100 transition hover:bg-slate-800 hover:text-white"
                        >
                          <LogoutIcon className="h-4 w-4 shrink-0" />
                          <span>Log out</span>
                        </button>
                      </form>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 overflow-x-hidden">
          <aside
            className={["border-b border-slate-800 bg-slate-900 lg:relative lg:-mr-px lg:overflow-visible lg:border-b-0 lg:border-r", COLLAPSED_NAV_WIDTH].join(" ")}
            onMouseEnter={() => setNavExpanded(true)}
            onMouseLeave={closeNav}
          >
            <div className="hidden h-full lg:block">
              <div className="relative h-full">
                <div
                  className={[
                    "absolute inset-y-0 left-0 z-10 overflow-hidden bg-slate-900 transition-[width,box-shadow] duration-200",
                    navExpanded ? `${EXPANDED_NAV_PANEL_WIDTH} shadow-[20px_0_40px_rgba(2,6,23,0.28)]` : COLLAPSED_NAV_PANEL_WIDTH
                  ].join(" ")}
                >
                  <div className="flex h-full flex-col px-4 py-6">
                    <nav className="flex flex-col gap-2">
                      {scopedNavItems.map((item) => {
                        const active = isItemActive(pathname, item.href);
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={closeNav}
                            aria-label={item.label}
                            title={item.label}
                            className={[
                              "flex h-11 w-11 items-center gap-3 overflow-hidden rounded-2xl border pl-[7px] pr-3 transition-[width,background-color,border-color,color] duration-200",
                              navExpanded ? "w-full" : "",
                              active
                                ? "border-slate-700 bg-slate-800 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.03)]"
                                : "border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-800/80 hover:text-white"
                            ].join(" ")}
                          >
                            <span className="inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center">
                              <Icon className="h-[20px] w-[20px] shrink-0" />
                            </span>
                            <span
                              className={[
                                "min-w-0 whitespace-nowrap text-sm transition duration-150",
                                navExpanded ? "opacity-100" : "pointer-events-none opacity-0"
                              ].join(" ")}
                            >
                              {item.label}
                            </span>
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-b border-slate-800 p-6 lg:hidden">
              <nav className="space-y-2">
                {scopedNavItems.map((item) => {
                  const active = isItemActive(pathname, item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                        active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      ].join(" ")}
                    >
                      <Icon className="h-[20px] w-[20px] shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-slate-50">
            <main className="min-w-0 flex-1 overflow-x-hidden px-6 py-8 text-ink">{children}</main>
            <footer className="border-t border-slate-200 px-6 py-4 text-xs text-slate-400">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p>Copyright © 2026 CertScore.ai. All rights reserved.</p>
                <div className="flex flex-wrap items-center gap-4">
                  <Link href="/privacy" className="hover:text-slate-600">
                    Privacy Policy
                  </Link>
                  <Link href="/terms" className="hover:text-slate-600">
                    Terms
                  </Link>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
