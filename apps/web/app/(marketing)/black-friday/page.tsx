import Image from "next/image";
import Link from "next/link";
import { getPlanDefinition } from "@website-signal-risk-scanner/shared";
import { SiteHeader } from "../../../components/layout/site-header";
import { SiteFooter } from "../../../components/layout/site-footer";
import { CampaignView } from "../../../components/promotions/campaign-form";
import { createPageMetadata } from "../../../lib/seo";
import { campaignStore } from "../../../server/promotions/repository";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../../lib/marketing/sample-report";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Build a Website Privacy Baseline | Black Friday 2026",
  description: "Three months of CertScore.ai Pro at no cost for eligible agencies, developers, marketers, law firms and data privacy officers. Apply by December 2, 2026.",
  path: "/black-friday"
});

const reviewSteps = [
  {
    title: "Capture a baseline",
    description: "Record cookies, third-party requests and visible privacy controls on a key page."
  },
  {
    title: "Review the choice paths",
    description: "Inspect what was observed with Global Privacy Control (GPC) or after Reject where the scan supports it."
  },
  {
    title: "Retest after a change",
    description: "Rescan the same page after a banner, tag or vendor update and compare the evidence."
  }
];

const workflows = [
  {
    audience: "Data privacy officers (DPOs)",
    title: "Keep evidence ready for internal reviews",
    description: "Record a baseline for the sites your organization operates. After a vendor or consent setup changes, retest the affected pages and share what changed with your privacy and engineering teams."
  },
  {
    audience: "Web agencies",
    title: "Add a privacy review to site handoff",
    description: "Start with a homepage and a key conversion page. Give the client a short list of observed trackers and controls, then agree on what to recheck after the next release."
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

const applyClass = "inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-[#c5f2d4] px-6 py-3 text-sm font-semibold text-[#10241c] transition hover:bg-[#ddf9e6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9bdcb4]";

function ApplyLink({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <Link href="/black-friday/apply" className={applyClass}>
      Apply for three months of Pro <span aria-hidden="true">→</span>
    </Link>
  );
}

export default async function BlackFridayPage() {
  const availability = await campaignStore.availability().catch(() => null);
  const open = availability?.open ?? false;
  const filled = availability !== null && availability.allocated >= availability.capacity;
  const pro = getPlanDefinition("pro");

  return (
    <main className="min-h-screen bg-[#fbfaf6] text-[#152624]">
      <SiteHeader />
      <CampaignView />

      <section className="bg-[#102522] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:gap-14 sm:px-10 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:py-24">
          <div>
            <p className="mb-6 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#bde9cd]">
              Black Friday 2026
            </p>
            <h1 className="max-w-[12ch] text-[clamp(2.75rem,6vw,5rem)] font-semibold leading-[1.02] tracking-[-0.055em]">
              Build a website privacy baseline.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-[#d4e3dc]">
              See what loads before consent, inspect supported privacy choices, and bring evidence to your next client or internal review.
            </p>
            <p className="mt-6 max-w-lg border-l-2 border-[#8fcaab] pl-4 text-base leading-7 text-[#e9f5ed]">
              <strong className="font-semibold text-white">Three months of CertScore.ai Pro at no cost.</strong>{" "}
              Ten places for agencies, developers, marketers, consultancies, law firms and data privacy officers (DPOs).
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ApplyLink open={open} />
              <a
                href={AUTHENTIC_SAMPLE_REPORT_URL}
                target="_blank"
                rel="noreferrer"
                data-analytics-cta-type="sample_report"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-[#9ebfaf] px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9bdcb4]"
              >
                View sample report <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#c0d2c9]">
              {open ? "Apply by December 2, 2026. No credit card or automatic paid renewal." : filled ? "All ten places have been allocated." : "Applications are currently closed."}
            </p>
          </div>

          <aside aria-labelledby="review-plan-title" className="rounded-2xl border border-white/10 bg-[#f5f4e9] text-[#152624] shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
            <div className="border-b border-[#d9dfd1] px-5 py-5 sm:px-7">
              <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[#365e4d]">Example workflow</p>
              <h2 id="review-plan-title" className="mt-2 text-2xl font-semibold tracking-tight">A website privacy review</h2>
            </div>
            <ol className="divide-y divide-[#d9dfd1] px-5 sm:px-7">
              {reviewSteps.map(({ title, description }, index) => (
                <li key={title} className="grid grid-cols-[2rem_1fr] gap-3 py-5 sm:gap-4">
                  <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-[#b7c8b9] bg-[#e7eee0] font-mono text-xs font-semibold text-[#284c3b]">{index + 1}</span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#425750]">{description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="rounded-b-2xl border-t border-[#d9dfd1] bg-[#e7eee0] px-5 py-4 text-sm font-semibold text-[#284c3b] sm:px-7">
              {pro.monthlyPageScanLabel} · Scan history included
            </div>
          </aside>
        </div>
      </section>

      <section aria-labelledby="report-preview-title" className="mx-auto max-w-7xl px-6 pt-14 sm:px-10 sm:pt-20">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 id="report-preview-title" className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              See the evidence your team can work with.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#425750]">
              Screenshots from the sample report. Open either capture at full size to explore the detail.
            </p>
          </div>
          <a href={AUTHENTIC_SAMPLE_REPORT_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-[#235b41] underline underline-offset-4">
            Explore a sample report <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="space-y-8">
          <figure className="overflow-hidden rounded-xl border border-[#d8e2db] bg-white shadow-sm">
            <figcaption className="border-b border-[#d8e2db] px-5 py-5 sm:px-7">
              <h3 className="text-xl font-semibold">Executive overview</h3>
              <p className="mt-2 leading-7 text-[#425750]">See review priorities, the consent platform and how much evidence the scan captured.</p>
            </figcaption>
            <a href="/promotions/black-friday-2026/report-executive-overview.jpg" target="_blank" rel="noreferrer" aria-label="Open the executive overview screenshot at full size" className="block p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#235b41] sm:p-5">
              <Image
                src="/promotions/black-friday-2026/report-executive-overview.jpg"
                alt="CertScore.ai executive overview showing priority findings, consent controls and captured resource counts."
                width={1232}
                height={467}
                unoptimized
                className="h-auto w-full"
              />
            </a>
          </figure>
          <figure className="overflow-hidden rounded-xl border border-[#d8e2db] bg-white shadow-sm">
            <figcaption className="border-b border-[#d8e2db] px-5 py-5 sm:px-7">
              <h3 className="text-xl font-semibold">Services &amp; Resources</h3>
              <p className="mt-2 leading-7 text-[#425750]">Inspect detected services, purpose classifications and policy disclosure matches alongside the retained resource inventory.</p>
            </figcaption>
            <a href="/promotions/black-friday-2026/report-services-resources.jpg" target="_blank" rel="noreferrer" aria-label="Open the services and resources screenshot at full size" className="block p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#235b41] sm:p-5">
              <Image
                src="/promotions/black-friday-2026/report-services-resources.jpg"
                alt="CertScore.ai Services and Resources table showing detected services, resource counts, purposes, policy disclosure matches and domains."
                width={1190}
                height={651}
                unoptimized
                className="h-auto w-full"
              />
            </a>
          </figure>
        </div>
      </section>

      <section id="client-workflows" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-14 sm:px-10 sm:py-20">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr] lg:items-end">
          <h2 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Make it part of the work you already do.</h2>
          <p className="max-w-xl text-lg leading-8 text-[#425750]">
            Start with one site you oversee. Use the three months to establish a baseline, retest a change and decide what belongs in your ongoing reviews.
          </p>
        </div>
        <div className="mt-9 grid gap-px overflow-hidden rounded-xl border border-[#d8e2db] bg-[#d8e2db] md:grid-cols-2">
          {workflows.map(({ audience, title, description }) => (
            <article key={audience} className="bg-white p-6 sm:p-8">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#365e4d]">{audience}</p>
              <h3 className="mt-4 text-xl font-semibold leading-snug tracking-tight">{title}</h3>
              <p className="mt-3 leading-7 text-[#425750]">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="regulatory-title" className="border-y border-[#d8e2db] bg-[#edf2eb]">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-14 sm:px-10 sm:py-16 lg:grid-cols-[0.78fr_1.22fr] lg:gap-14">
          <div>
            <h2 id="regulatory-title" className="text-4xl font-semibold leading-tight tracking-tight">Prepare for the next change.</h2>
            <p className="mt-4 max-w-md text-lg leading-8 text-[#425750]">
              A dated record of what a site loaded and what the scan could observe gives privacy, legal and engineering teams a common starting point when requirements or site configurations change.
            </p>
          </div>
          <div className="divide-y divide-[#cbd8cd] border-y border-[#cbd8cd]">
            {regulatorySources.map(({ jurisdiction, title, description, nextStep, href, linkLabel }) => (
              <article key={jurisdiction} className="py-5 first:pt-0 last:pb-0 sm:py-6">
                <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#365e4d]">{jurisdiction}</p>
                <h3 className="mt-2 text-xl font-semibold">{title}</h3>
                <p className="mt-2 leading-7 text-[#425750]">{description}</p>
                <p className="mt-2 leading-7 text-[#425750]">{nextStep}</p>
                <a className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#235b41] underline underline-offset-4 hover:text-[#102522]" href={href} target="_blank" rel="noreferrer">
                  {linkLabel} <span className="ml-2" aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-14 sm:px-10 sm:py-20">
        <div className="grid gap-8 rounded-2xl bg-[#102522] p-6 text-white sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pick a site for your first review.</h2>
            <p className="mt-4 max-w-xl leading-7 text-[#d4e3dc]">
              Solo developers, DPOs, small firms and in-house privacy teams are welcome. Tell us about your organization and what you’d like to review. You can apply without entering payment details.
            </p>
          </div>
          <div className="lg:border-l lg:border-white/20 lg:pl-9">
            <p className="text-base font-semibold">Three calendar months of Pro. A $1,200 value.</p>
            {open && <div className="mt-5"><ApplyLink open={open} /></div>}
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="mx-auto max-w-4xl px-6 pb-14 sm:px-10">
        <h2 id="faq-title" className="text-3xl font-semibold tracking-tight">Questions about the offer</h2>
        <div className="mt-5 divide-y divide-[#d8e2db] border-y border-[#d8e2db]">
          {questions.map(({ title, answer }) => (
            <details key={title} className="py-4">
              <summary className="cursor-pointer font-semibold">{title}</summary>
              <p className="mt-3 max-w-2xl leading-7 text-[#425750]">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="terms" aria-labelledby="terms-title" className="mx-auto max-w-4xl scroll-mt-24 px-6 pb-16 sm:px-10">
        <h2 id="terms-title" className="text-2xl font-semibold tracking-tight">Promotional terms &amp; privacy</h2>
        <div className="mt-4 space-y-4 text-sm leading-7 text-[#425750]">
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
