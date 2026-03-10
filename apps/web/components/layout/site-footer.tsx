import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8 text-sm text-slate-500">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="font-medium text-slate-700">CertScore.ai</p>
            <p>certscore.ai · Automated scanning for publicly observable website signals.</p>
            <p className="max-w-2xl text-xs text-slate-500">
              CertScore.ai provides automated telemetry on publicly observable website signals related to frameworks such as GDPR, WCAG accessibility standards, CCPA/CPRA, cookie consent systems, and privacy disclosures.
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/how-it-works" className="hover:text-slate-900">
              How It Works
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
            <Link href="/login" className="hover:text-slate-900">
              Login
            </Link>
          </div>
        </div>
        <div className="text-xs text-slate-400">
          <p>Stored data is limited to scan metadata, derived signals, and change history.</p>
          <p>Copyright © 2026 CertScore.ai. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
