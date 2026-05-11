import Link from "next/link";

const resourceLinks = [
  { href: "/what-is-certscore", label: "What is CertScore.ai?" },
  { href: "/methodology", label: "Methodology" },
  { href: "/benchmarks/website-consent-tracking-2026", label: "Website consent benchmark" },
  { href: "/benchmarks/pre-consent-tracking-2026", label: "Pre-consent tracking benchmark" },
  { href: "/benchmarks/session-replay-risk-2026", label: "Session replay risk benchmark" },
  { href: "/guides/detect-tracking-before-consent", label: "Detect tracking before consent" },
  { href: "/guides/website-consent-audit-checklist", label: "Website consent audit checklist" },
  { href: "/guides/pre-consent-tracking", label: "Pre-consent tracking guide" },
  { href: "/guides/rtb-cookie-syncing", label: "RTB cookie syncing guide" },
  { href: "/compare/privacy-scanner-vs-cookie-scanner", label: "Privacy scanner vs cookie scanner" },
  { href: "/compare/website-consent-audit-tools", label: "Website consent audit tools" },
  { href: "/press", label: "Press" },
  { href: "/llms.txt", label: "llms.txt" }
];

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8 text-sm text-slate-500">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="font-medium text-slate-700">CertScore.ai · Evidence-led scanning for public website signals.</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/how-it-works" className="hover:text-slate-900">
              How It Works
            </Link>
            <Link href="/methodology" className="hover:text-slate-900">
              Methodology
            </Link>
            <Link href="/guides" className="hover:text-slate-900">
              Guides
            </Link>
            <Link href="/pricing" className="hover:text-slate-900">
              Pricing
            </Link>
            <Link href="/faq" className="hover:text-slate-900">
              FAQ
            </Link>
            <Link href="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            <Link href="/privacy-request" className="hover:text-slate-900">
              Privacy Request
            </Link>
            <Link href="/login" className="hover:text-slate-900">
              Login
            </Link>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Resources</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {resourceLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-slate-900">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-400">
          <p>No legal advice. No certification. Findings reflect automated analysis of public website signals and should be reviewed in context. Stored data may include scan metadata, derived signals, change history, evidence URLs, and limited policy or disclosure excerpts retained for evidence context.</p>
          <p>
            Privacy rights requests can be submitted at <Link href="/privacy-request" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">certscore.ai/privacy-request</Link> or by emailing <a href="mailto:privacy@certscore.ai" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">privacy@certscore.ai</a>.
          </p>
          <p>Copyright © 2026 CertScore.ai. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
