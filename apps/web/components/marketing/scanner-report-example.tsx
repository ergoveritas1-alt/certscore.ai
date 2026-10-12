import Image from "next/image";
import Link from "next/link";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../lib/marketing/sample-report";

export function ScannerReportExample({ topic }: { topic: "policy" | "cookies" }) {
  const policy = topic === "policy";
  return (
    <section aria-labelledby="scanner-example-heading" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Inside a completed scan</p>
      <h2 id="scanner-example-heading" className="mt-2 text-2xl font-semibold text-slate-950">
        {policy ? "Follow a privacy-policy check to its evidence" : "Read the cookie domain alongside the vendor"}
      </h2>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        {policy
          ? "This test-site report found a privacy-policy surface and retained its source. Open a policy check to review the supporting disclosure evidence, then compare it with the services observed on the page."
          : "This test-site report groups Google Analytics with its cookie and request evidence. The _ga_TEST2 and _gat_TEST2 cookies appear under the scanned site's domain: an external analytics service can use first-party cookies."}
      </p>
      <figure className="mt-5">
        <a href={`/showcase/test2/${topic}.webp`} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700" aria-label={`Open full-size ${policy ? "privacy policy" : "cookie inventory"} screenshot`}>
          <Image src={`/showcase/test2/${topic}.webp`} alt={policy
            ? "Actual report checklist showing a discovered privacy-policy surface and disclosure checks."
            : "Actual report inventory showing Google Analytics, _ga_TEST2 and _gat_TEST2 cookie rows, first-seen timing and domains."}
            width={policy ? 624 : 1170} height={policy ? 543 : 465} unoptimized
            className={`h-auto w-full rounded-lg border border-slate-200 ${policy ? "max-w-xl" : ""}`} />
        </a>
        <figcaption className="mt-3 text-xs leading-5 text-slate-500">ErgoVeritas test page · California · 28 September 2026. Open the image to enlarge it.</figcaption>
      </figure>
      <Link href={AUTHENTIC_SAMPLE_REPORT_URL} data-analytics-id={`${topic}_sample_report`} className="mt-4 inline-block font-semibold text-sky-700 underline underline-offset-4">Explore this completed report →</Link>
    </section>
  );
}
