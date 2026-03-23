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

function ValidationIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
      <path d="M8 9.5h8" />
      <path d="M8 14h4" />
      <path d="m13.5 14.5 1.5 1.5 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ValidationRunsIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M8 9h8" />
      <path d="M8 12.5h8" />
      <path d="M8 16h5" />
      <circle cx="17" cy="16" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ValidationIssuesIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <path d="M12 4.5 20 18.5H4L12 4.5Z" strokeLinejoin="round" />
      <path d="M12 9v4.5" strokeLinecap="round" />
      <circle cx="12" cy="16.25" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MenuIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon(props: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" width="20" height="20" {...props}>
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
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

const validationNavItems = [
  { href: "/app/validation", label: "Validation", icon: ValidationIcon },
  { href: "/app/validation/scans", label: "Validation Runs", icon: ValidationRunsIcon },
  { href: "/app/validation/issues", label: "Validation Issues", icon: ValidationIssuesIcon }
] as const;

type AppShellProps = {
  children: ReactNode;
  isPlatformAdmin?: boolean;
  isValidationAdmin?: boolean;
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
const DEV_INSTANCE_LABEL = process.env.NEXT_PUBLIC_DEV_INSTANCE_LABEL;
const DEV_INSTANCE_BRANCH = process.env.NEXT_PUBLIC_DEV_GIT_BRANCH;
const DEV_INSTANCE_PATH = process.env.NEXT_PUBLIC_DEV_WORKTREE_PATH;
const DEV_INSTANCE_PORT = process.env.NEXT_PUBLIC_DEV_PORT;

export function AppShell({
  children,
  organizationName,
  plan,
  userEmail,
  isPlatformAdmin = false,
  isValidationAdmin = false
}: AppShellProps) {
  const pathname = usePathname();
  const userInitial = userEmail.slice(0, 1).toUpperCase();
  const displayOrganizationName = organizationName.replace(/\s+workspace$/i, "");
  const displayPlan = plan === "free" ? "FREE" : plan === "pro" ? "PRO" : "ULTRA";
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const scopedNavItems = [
    ...navItems,
    ...(isValidationAdmin ? validationNavItems : []),
    ...(isPlatformAdmin ? [{ href: "/app/admin", label: "Admin", icon: ShieldIcon }] : [])
  ];

  useEffect(() => {
    setAccountMenuOpen(false);
    setNavExpanded(false);
    setMobileNavOpen(false);
  }, [pathname]);

  function closeNav() {
    setNavExpanded(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col">
        <header className="border-b border-slate-800 bg-slate-950 pl-[17px] pr-6 pt-2 pb-0 text-white">
          {process.env.NODE_ENV === "development" && DEV_INSTANCE_LABEL ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-300/10 px-3 py-2 font-mono text-[11px] text-amber-100">
              <span className="rounded-full border border-amber-300/30 bg-amber-300/15 px-2 py-0.5 uppercase tracking-[0.2em] text-amber-200">
                {DEV_INSTANCE_LABEL}
              </span>
              <span>{DEV_INSTANCE_BRANCH ?? "unknown-branch"}</span>
              <span>port {DEV_INSTANCE_PORT ?? "?"}</span>
              {DEV_INSTANCE_PATH ? <span className="truncate text-amber-50/80">{DEV_INSTANCE_PATH}</span> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Open navigation"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-200 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white lg:hidden"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
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

            <div className="flex items-center gap-2">
              <Link
                href="/app/feedback"
                className="inline-flex items-center gap-2 rounded-full border border-slate-800 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white"
              >
                <FeedbackIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Feedback</span>
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
          {mobileNavOpen ? (
            <div className="fixed inset-0 z-40 lg:hidden" aria-hidden="true">
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileNavOpen(false)}
                className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
              />
            </div>
          ) : null}

          <div
            className={[
              "fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-2rem))] transform border-r border-slate-800 bg-slate-900 transition duration-200 lg:hidden",
              mobileNavOpen ? "translate-x-0" : "-translate-x-[110%]"
            ].join(" ")}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-white">Navigation</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{displayPlan} plan</p>
                </div>
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 text-slate-200 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
                {scopedNavItems.map((item) => {
                  const active = isItemActive(pathname, item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      className={[
                        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition",
                        active
                          ? "border-slate-700 bg-slate-800 text-white"
                          : "border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-800 hover:text-white"
                      ].join(" ")}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

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

          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-slate-50">
            <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 text-ink sm:px-6 sm:py-8">{children}</main>
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
