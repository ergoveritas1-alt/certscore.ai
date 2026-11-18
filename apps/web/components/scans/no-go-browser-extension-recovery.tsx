import React from "react";
import Link from "next/link";
import type { NoGoBrowserGuidance } from "../../lib/scans/no-go-browser-guidance";

export function NoGoBrowserExtensionRecovery({ guidance }: { guidance?: NoGoBrowserGuidance }) {
  if (!guidance) return null;
  if (guidance === "robots") return (
    <p className="mt-4 text-sm leading-6 text-slate-700">
      The site’s robots.txt restricts scanning this page. Choose a URL that permits scanning, or ask the site owner to update the rule before retrying.
    </p>
  );
  return (
    <section aria-label="Chrome extension scan instructions" className="mt-4 space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-5">
      <h3 className="font-semibold text-slate-950">Review the public page in Chrome</h3>
      <p className="text-sm leading-6 text-slate-700">
        {guidance === "challenge"
          ? "If you’re authorized to scan this site and its public page opens directly in Chrome while you’re signed out of the site, you can start a separate browser scan. If Chrome also shows a challenge, ask the site owner about approved scanner access."
          : "If the intended public page loads normally in Chrome while you’re signed out of the site and you’re authorized to scan it, you can start a separate browser scan to collect evidence from that page."}
      </p>
      <p className="text-sm leading-6 text-slate-700">The CertScore.ai extension clears site data for the selected site and reloads the page for a fresh observation.</p>
      <Link className="inline-flex font-semibold text-sky-800 underline underline-offset-4" href="/browser-extension">
        View Chrome extension instructions
      </Link>
    </section>
  );
}
