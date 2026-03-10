import Link from "next/link";
import { Button } from "@website-signal-risk-scanner/ui";
import CertScoreLogo from "../brand/CertScoreLogo";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center overflow-visible min-w-0">
          <CertScoreLogo compact className="md:hidden" />
          <CertScoreLogo className="hidden md:inline-flex" />
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/" className="text-sm text-slate-600 hover:text-ink">
            Home
          </Link>
          <Link href="/how-it-works" className="text-sm text-slate-600 hover:text-ink">
            How It Works
          </Link>
          <Link href="/pricing" className="text-sm text-slate-600 hover:text-ink">
            Pricing
          </Link>
          <Link href="/guides" className="text-sm text-slate-600 hover:text-ink">
            Guides
          </Link>
          <Button asChild size="sm" variant="secondary">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_10px_24px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
          >
            <Link href="/contact-sales">Contact us</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
