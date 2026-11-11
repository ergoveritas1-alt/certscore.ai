import Image from "next/image";
import Link from "next/link";
import { getPlanDefinition } from "@website-signal-risk-scanner/shared";
import { SiteHeader } from "../../../components/layout/site-header";
import { SiteFooter } from "../../../components/layout/site-footer";
import { AnalyticsConsentBanner } from "../../../components/analytics/analytics-consent-banner";
import { CampaignView } from "../../../components/promotions/campaign-form";
import { createPageMetadata } from "../../../lib/seo";
import { campaignStore } from "../../../server/promotions/repository";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Find Website Privacy Blind Spots | Black Friday 2026",
  description: "Three months of CertScore.ai Pro at no cost for eligible agencies, developers, marketers, law firms and data privacy officers. Apply by December 2, 2026.",
  path: "/black-friday"
});

const californiaSampleReportUrl = "https://certscore.ai/scan/c4c071c6-9313-40b3-94de-23d50d24ba18?reviewFocus=ccpa_cpra";
const executiveOverviewImage = "/promotions/black-friday-2026/report-california-executive-overview.jpg";
const servicesResourcesImage = "/promotions/black-friday-2026/report-california-services-resources.jpg";

const workflows = [
  {
    audience: "Data privacy officers (DPOs)",
    title: "Keep evidence ready for internal reviews",
    description: "Record a baseline for the sites your organization operates. After a vendor or consent setup changes, retest the affected pages and share what changed with your privacy and engineering teams."
  },
  {
    audience: "Web agencies",
    title: "Add privacy checks to handoffs and care plans",
    description: "Review a new client’s homepage and a key conversion page. Share the trackers and controls you observed, then recheck after a banner, plugin or tag update."
  },
  {
    audience: "Web developers / marketers",
    title: "Check the tags behind a campaign",
    description: "Capture a baseline before changing pixels, tags or consent settings. Recheck the same page and supported choice path after release, then use the request evidence to investigate unexpected activity."
  },
  {
    audience: "Law firms and privacy advisors",
    title: "Put website evidence beside the policy",
    description: "Read the client’s disclosures alongside what a scan observed. Use gaps and unknowns to ask the client or their developers more specific questions."
  }
];

const regulatorySources = [
  {
    jurisdiction: "California",
    title: "Browser opt-out signals",
    description: "California’s Opt Me Out Act takes effect January 1, 2027. It requires covered browser providers to offer a configurable signal for opting out of sale or sharing.",
    nextStep: "For client sites in scope, capture a baseline with the signal enabled so the team has evidence to revisit when its consent setup changes.",
    href: "https://cppa.ca.gov/pdf/20260101_ccpa_statute.pdf#page=19",
    linkLabel: "California Civil Code § 1798.136"
  },
  {
    jurisdiction: "France (EU)",
    title: "Clear scope for consent choices",
    description: "France’s CNIL issued GDPR-focused recommendations in January 2026 for cookie consent across devices linked to one account. Refusal and withdrawal should be as simple as consent and cover the same devices.",
    nextStep: "Review observed banner information and supported refusal paths on public pages as a starting point for a broader consent review.",
    href: "https://www.cnil.fr/fr/cookies-et-autres-traceurs-recommandations-finales-sur-le-consentement-multi-terminaux",
    linkLabel: "CNIL consent recommendations"
  },
  {
    jurisdiction: "United Kingdom",
    title: "Cookies, pixels and similar technologies",
    description: "The ICO finalized updated guidance in April 2026 covering storage and access technologies, including cookies and tracking pixels, after changes to the UK rules.",
    nextStep: "Inventory what a client page loads and when. Bring that evidence to the review of which technologies need consent or may qualify for an exception.",
    href: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/",
    linkLabel: "ICO storage and access guidance"
  }
];

const questions = [
  {
    title: "Will I be charged when it ends?",
    answer: "You can activate the offer without providing billing details, and activation does not create a paid subscription. Pro access ends automatically unless you explicitly purchase a plan."
  },
  {
    title: "What is included?",
    answer: "Standard Pro includes 1,000 page scans per monthly entitlement period. Existing scan limits and product usage restrictions apply. Unused scans do not roll over. API access, white-label features and other Custom-only capabilities are not included."
  },
  {
    title: "Does a scan certify compliance?",
    answer: "CertScore.ai records technical observations for your review. Capture coverage varies by site and workflow. Your team or counsel determines which rules apply and how to respond."
  }
];

const applyClass = "inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-[#7dd3fc] px-6 py-3 text-sm font-semibold text-[#082349] transition hover:bg-[#bae6fd] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#93c5fd]";

function ApplyLink({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <Link href="/black-friday/apply" className={applyClass}>
      Get 3 Months Free <span aria-hidden="true">→</span>
    </Link>
  );
}

export default async function BlackFridayPage() {
  const availability = await campaignStore.availability().catch(() => null);
  const open = availability?.open ?? false;
  const filled = availability !== null && availability.allocated >= availability.capacity;
  const pro = getPlanDefinition("pro");

  return (
    <main className="min-h-screen bg-[#f8faff] text-[#0f2141]">
      <SiteHeader />
      <CampaignView />

      <section className="overflow-hidden bg-[#081a3b] bg-[radial-gradient(ellipse_at_top_right,rgba(37,99,235,0.22),transparent_65%)] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-9 sm:gap-14 sm:px-10 sm:py-16 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <p className="mb-4 font-mono sm:mb-6 text-xs font-semibold uppercase tracking-[0.16em] text-[#93c5fd]">
              Black Friday 2026
            </p>
            <h1 className="max-w-[12ch] text-[clamp(2.25rem,6vw,5rem)] font-semibold leading-[1.02] tracking-[-0.055em]">
              Find website privacy blind spots.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 sm:mt-6 sm:text-lg sm:leading-8 text-[#c8d8f3]">
              CertScore.ai scans client websites for cookies, trackers and privacy disclosures. Share evidence with clients at handoff or after an update.
            </p>
            <p className="mt-4 max-w-lg border-l-2 sm:mt-6 border-[#60a5fa] pl-4 text-base leading-7 text-[#edf4ff]">
              <strong className="font-semibold text-white">3 months of Pro free ($1,200 value).</strong>{" "}
              {pro.monthlyPageScanLabel}. Limited to 10 approved businesses.
            </p>
            {open && <p className="mt-3 max-w-lg text-sm leading-6 text-[#edf4ff]">We manually review each application. No credit card required.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ApplyLink open={open} />
              <a
                href={californiaSampleReportUrl}
                target="_blank"
                rel="noreferrer"
                data-analytics-cta-type="sample_report"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-[#6a8cc3] px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#93c5fd]"
              >
                View sample report <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#b9cbea]">
              {open ? "Apply by December 2, 2026. No automatic paid renewal." : filled ? "All ten places have been allocated." : "Applications are currently closed."}
            </p>
            <AnalyticsConsentBanner campaignPlacement />
          </div>

          <aside aria-labelledby="report-graphic-title" className="relative isolate min-w-0 pb-3 pt-28 sm:pt-10">
            <div aria-hidden="true" className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.32),transparent_67%)]" />
            <svg aria-hidden="true" viewBox="0 0 560 460" fill="none" className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-blue-400/25">
              <circle cx="280" cy="210" r="190" stroke="currentColor" />
              <circle cx="280" cy="210" r="235" stroke="currentColor" strokeDasharray="3 12" />
              <path d="M25 120h16m-8-8v16M487 350h16m-8-8v16" stroke="#93c5fd" strokeWidth="2" />
              <circle cx="93" cy="355" r="5" fill="#60a5fa" />
              <circle cx="482" cy="72" r="4" fill="#93c5fd" />
            </svg>
            <div className="relative rotate-[-2deg] rounded-2xl border border-blue-200/35 bg-[#edf4ff] p-2 shadow-[0_30px_90px_rgba(0,0,0,0.4)] sm:p-3">
              <div className="flex items-center gap-1.5 px-2 pb-3 pt-1" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-blue-300" /><span className="h-2 w-2 rounded-full bg-blue-200" /><span className="h-2 w-2 rounded-full bg-slate-300" />
                <span className="ml-3 font-mono text-[10px] uppercase tracking-wider text-[#475b78]">CertScore.ai / sample report</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-[#dbe5f3] bg-white">
                <div className="border-b border-[#dbe5f3] px-4 py-5 sm:px-5 sm:py-6">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1d4ed8]">Website privacy insights</p>
                  <h2 id="report-graphic-title" className="mt-2 max-w-[15ch] text-2xl font-semibold leading-tight tracking-tight text-[#0f2141] sm:text-3xl">See the signals.<br />Keep the evidence.</h2>
                </div>
                <a href={californiaSampleReportUrl} target="_blank" rel="noreferrer" aria-label="View Full Sample Report" data-analytics-cta-type="sample_report" className="block p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 sm:p-3">
                  <Image src={executiveOverviewImage} alt="CertScore.ai executive overview of a scan from California with CCPA/CPRA selected." width={1232} height={612} unoptimized className="h-auto w-full" />
                  <span className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-[#1d4ed8] underline underline-offset-2">View Full Sample Report <span aria-hidden="true">↗</span></span>
                </a>
                <div className="grid grid-cols-3 divide-x divide-[#dbe5f3] border-t border-[#dbe5f3] bg-[#f5f8ff] text-[#21477e]">
                  <div className="flex flex-col items-center gap-2 px-1 py-4 text-center text-[11px] font-semibold sm:text-xs">
                    <svg aria-hidden="true" className="h-6 w-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><circle cx="5" cy="5" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="m7 7 3 3m4 4 3 3m0-10-3 3M7 17l3-3" /></svg>
                    Map trackers
                  </div>
                  <div className="flex flex-col items-center gap-2 px-1 py-4 text-center text-[11px] font-semibold sm:text-xs">
                    <svg aria-hidden="true" className="h-6 w-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="#f5f8ff" /><circle cx="15" cy="17" r="3" fill="#f5f8ff" /></svg>
                    Inspect choices
                  </div>
                  <div className="flex flex-col items-center gap-2 px-1 py-4 text-center text-[11px] font-semibold sm:text-xs">
                    <svg aria-hidden="true" className="h-6 w-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6M4 14a8 8 0 0 0 14 4l3-3m0 6v-6h-6" /></svg>
                    Retest changes
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -right-2 -top-3 rotate-[6deg] rounded-2xl border border-white/40 bg-[#7dd3fc] px-4 py-3 text-center text-[#082349] shadow-[0_10px_35px_rgba(0,0,0,0.25)] sm:-right-3 sm:px-5 sm:py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest">Black Friday offer</p>
              <p className="mt-1 text-3xl font-bold leading-none tracking-tight sm:text-4xl">3 months</p>
              <p className="mt-1 text-base font-bold">of Pro free</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide">Approval required</p>
            </div>
            <p className="mt-6 text-center text-sm font-medium text-[#b9cbea]">Scan history included</p>
          </aside>
        </div>
      </section>

      <section aria-labelledby="report-preview-title" className="mx-auto max-w-7xl px-6 pt-14 sm:px-10 sm:pt-20">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 id="report-preview-title" className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              See the evidence your team can work with.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#475b78]">
              See what CertScore.ai found when it scanned our sample website from California. Reports can show what loads before consent, after Reject or with Global Privacy Control (GPC), where supported. Open either capture at full size to read the details.
            </p>
          </div>
        </div>
        <div className="space-y-8">
          <figure className="overflow-hidden rounded-xl border border-[#dbe5f3] bg-white shadow-sm">
            <figcaption className="border-b border-[#dbe5f3] px-5 py-5 sm:px-7">
              <h3 className="text-xl font-semibold">Executive overview</h3>
              <p className="mt-2 leading-7 text-[#475b78]">See the CCPA/CPRA posture, review priorities and captured evidence from the California scan.</p>
            </figcaption>
            <a href={executiveOverviewImage} target="_blank" rel="noreferrer" aria-label="Open the executive overview screenshot at full size" className="block p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#1d4ed8] sm:p-5">
              <Image
                src={executiveOverviewImage}
                alt="CertScore.ai CCPA/CPRA executive overview showing the California scan’s score, review priorities and resource counts."
                width={1232}
                height={612}
                unoptimized
                className="h-auto w-full"
              />
            </a>
          </figure>
          <figure className="overflow-hidden rounded-xl border border-[#dbe5f3] bg-white shadow-sm">
            <figcaption className="border-b border-[#dbe5f3] px-5 py-5 sm:px-7">
              <h3 className="text-xl font-semibold">Services &amp; Resources</h3>
              <p className="mt-2 leading-7 text-[#475b78]">Inspect detected services, purpose classifications and policy disclosure matches alongside the retained resource inventory.</p>
            </figcaption>
            <a href={servicesResourcesImage} target="_blank" rel="noreferrer" aria-label="Open the services and resources screenshot at full size" className="block p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#1d4ed8] sm:p-5">
              <Image
                src={servicesResourcesImage}
                alt="CertScore.ai Services and Resources table showing detected services, resource counts, purposes, policy disclosure matches and domains."
                width={1190}
                height={503}
                unoptimized
                className="h-auto w-full"
              />
            </a>
          </figure>
        </div>
        <div className="mt-6">
          <a href={californiaSampleReportUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#1d4ed8] underline underline-offset-4">
            Explore the full sample report <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section id="client-workflows" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-14 sm:px-10 sm:py-20">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr] lg:items-end">
          <h2 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Make it part of the work you already do.</h2>
          <p className="max-w-xl text-lg leading-8 text-[#475b78]">
            Start with one site you oversee. Use the three months to establish a baseline, retest a change and decide what belongs in your ongoing reviews.
          </p>
        </div>
        <div className="mt-9 grid gap-px overflow-hidden rounded-xl border border-[#dbe5f3] bg-[#dbe5f3] md:grid-cols-2">
          {workflows.map(({ audience, title, description }) => (
            <article key={audience} className="bg-white p-6 sm:p-8">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#315d9b]">{audience}</p>
              <h3 className="mt-4 text-xl font-semibold leading-snug tracking-tight">{title}</h3>
              <p className="mt-3 leading-7 text-[#475b78]">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="regulatory-title" className="border-y border-[#dbe5f3] bg-[#eff5ff]">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-14 sm:px-10 sm:py-16 lg:grid-cols-[0.78fr_1.22fr] lg:gap-14">
          <div>
            <h2 id="regulatory-title" className="text-4xl font-semibold leading-tight tracking-tight">Prepare for the next change.</h2>
            <p className="mt-4 max-w-md text-lg leading-8 text-[#475b78]">
              A dated record of what a site loaded and what the scan could observe gives privacy, legal and engineering teams a common starting point when requirements or site configurations change.
            </p>
          </div>
          <div className="divide-y divide-[#c7d7ef] border-y border-[#c7d7ef]">
            {regulatorySources.map(({ jurisdiction, title, description, nextStep, href, linkLabel }) => (
              <article key={jurisdiction} className="py-5 first:pt-0 last:pb-0 sm:py-6">
                <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#315d9b]">{jurisdiction}</p>
                <h3 className="mt-2 text-xl font-semibold">{title}</h3>
                <p className="mt-2 leading-7 text-[#475b78]">{description}</p>
                <p className="mt-2 leading-7 text-[#475b78]">{nextStep}</p>
                <a className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#1d4ed8] underline underline-offset-4 hover:text-[#081a3b]" href={href} target="_blank" rel="noreferrer">
                  {linkLabel} <span className="ml-2" aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-14 sm:px-10 sm:py-20">
        <div className="grid gap-8 rounded-2xl bg-[#081a3b] p-6 text-white sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bring better data to your next privacy review.</h2>
            <p className="mt-4 max-w-xl leading-7 text-[#c8d8f3]">
              Apply for three months of Pro, free if approved. No card. No automatic paid renewal.
            </p>
          </div>
          <div className="lg:border-l lg:border-white/20 lg:pl-9">
            <p className="text-base font-semibold">A $1,200 value. Ten places.</p>
            {open && <div className="mt-5"><ApplyLink open={open} /></div>}
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="mx-auto max-w-4xl px-6 pb-14 sm:px-10">
        <h2 id="faq-title" className="text-3xl font-semibold tracking-tight">Questions about the offer</h2>
        <div className="mt-5 divide-y divide-[#dbe5f3] border-y border-[#dbe5f3]">
          {questions.map(({ title, answer }) => (
            <details key={title} className="py-4">
              <summary className="cursor-pointer font-semibold">{title}</summary>
              <p className="mt-3 max-w-2xl leading-7 text-[#475b78]">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="terms" aria-labelledby="terms-title" className="mx-auto max-w-4xl scroll-mt-24 px-6 pb-16 sm:px-10">
        <h2 id="terms-title" className="text-2xl font-semibold tracking-tight">Promotional terms &amp; privacy</h2>
        <div className="mt-4 space-y-4 text-sm leading-7 text-[#475b78]">
          <p>Offer begins November 10, 2026 when deployed, and closes December 2, 2026, or when all ten places have been allocated. The first ten eligible, manually approved organizations receive three consecutive calendar months of Pro. Complete applications are considered in submission order.</p>
          <p>Eligible applicants include agencies, developers, marketers, consultancies, law firms and organizations applying through a data privacy officer or in-house privacy team. Applicants must represent an active organization with a verifiable website and professional identity. No minimum company size applies. Existing paid subscribers are excluded. One allocation is permitted per business or commonly controlled business group.</p>
          <p>Activate within 14 days of approval, including if the application window has closed. Your entitlement starts at activation and ends three calendar months later. Each monthly anniversary begins a new 1,000-page allowance. Month-end anniversaries are clipped to that month’s last day. Standard usage and rate restrictions apply. The current Pro rate is $400 per month and the promotional value is $1,200, subject to change. No payment or credit card is required, and there is no automatic paid renewal.</p>
          <p>We retain application details to review eligibility, administer the promotion and communicate transactional updates.</p>
          <p>CertScore.ai supplies technical observations and evidence for review. It does not provide legal advice or compliance certification. General <Link className="underline" href="/terms">Terms</Link>, <Link className="underline" href="/privacy">Privacy Policy</Link> and <Link className="underline" href="/pricing">Pro plan inclusions</Link> apply.</p>
        </div>
      </section>
      <SiteFooter highContrast />
    </main>
  );
}
