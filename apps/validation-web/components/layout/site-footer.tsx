import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8 text-sm text-slate-500">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="font-medium text-slate-700">ConsentCheck · Public website scanning and crawler transparency.</p>
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
            <Link href="/crawler" className="hover:text-slate-900">
              Crawler
            </Link>
            <Link href="/scanning-policy" className="hover:text-slate-900">
              Scanning Policy
            </Link>
            <Link href="/contact" className="hover:text-slate-900">
              Contact
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
        <div className="text-xs text-slate-400">
          <p>No legal advice. No certification. Findings reflect automated analysis of public website signals and should be reviewed in context. Stored data may include scan metadata, derived signals, change history, evidence URLs, and limited policy or disclosure excerpts retained for evidence context.</p>
          <p>
            Operator and crawler inquiries should use <Link href="/contact" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">/contact</Link>. Privacy rights requests can use <Link href="/privacy-request" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">/privacy-request</Link>.
          </p>
          <p>Copyright © 2026 ConsentCheck. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
