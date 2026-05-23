import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { DomainScanForm } from "../../components/marketing/domain-scan-form";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { absoluteUrl, createBreadcrumbSchema, createPageMetadata, createPublicArticleSchema, createPublicWebPageSchema } from "../../lib/seo";
import { getFindingReferenceItems } from "../../lib/marketing/finding-atlas";

const pageTitle = "GDPR Website Privacy Scanner | Consent, Cookies & Tracking Review Signals | CertScore.ai";
const pageDescription =
  "Evidence-based GDPR review signals for public websites. Detect pre-consent tracking, third-party cookies before consent, consent UX issues, session replay signals, fingerprinting-related activity, and policy/runtime gaps. Automated observations for review, not legal advice.";
const pagePath = "/gdpr";
const disclaimer =
  "CertScore findings are automated public-web observations for review, not legal advice, certification, or a compliance determination.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: pageTitle,
    description: pageDescription,
    path: pagePath
  }),
  title: {
    absolute: pageTitle
  },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: absoluteUrl(pagePath),
    siteName: "CertScore.ai",
    type: "website",
    images: [
      {
        url: absoluteUrl("/certscore-header-logo.png"),
        width: 512,
        height: 512,
        alt: "CertScore.ai"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
    images: [absoluteUrl("/certscore-header-logo.png")]
  }
};

const heroChips = ["Runtime evidence", "Consent + cookie timing", "23 findings", "Not legal advice"];

const gdprSignalBenchmarks = [
  {
    id: "pre_consent_tracking_detected",
    label: "Tracking before recorded consent",
    count: 458,
    denominatorApprox: 2500,
    displayPercent: "18%",
    caveat: "Observed signals across approximately 2,500 scanned rank slots.",
    gdprRelevance: "Consent timing and ePrivacy storage/access review"
  },
  {
    id: "session_recording_services_detected",
    label: "Session recording services detected",
    count: 228,
    denominatorApprox: 2500,
    displayPercent: "9%",
    caveat: "Requires review of masking, consent gating, and sensitive-page exclusions.",
    gdprRelevance: "Data minimization, transparency, and security review"
  },
  {
    id: "third_party_cookie_pre_consent",
    label: "Third-party tracking cookies before consent",
    count: null,
    denominatorApprox: null,
    displayPercent: "10% in completed cookie-timing buckets",
    caveat: "Final all-bucket denominator pending; do not overstate.",
    gdprRelevance: "Cookie consent and terminal-equipment access review"
  },
  {
    id: "cross_domain_identifier_sharing_observed",
    label: "Cross-domain identifier sharing observed",
    count: 49,
    denominatorApprox: 2500,
    displayPercent: "2%",
    caveat: "Identifier-like data movement observed across domain contexts.",
    gdprRelevance: "Transparency, online identifiers, and third-party disclosure review"
  },
  {
    id: "reject_tracking_persists_after_reject",
    label: "Tracking appeared to continue after reject",
    count: 34,
    denominatorApprox: 2500,
    displayPercent: "1-2%",
    caveat: "Reject-path persistence signals require careful manual review.",
    gdprRelevance: "Consent withdrawal and enforcement review"
  }
] as const;

const runtimeCards = [
  {
    title: "Before consent",
    body:
      "CertScore records whether non-essential requests, cookies, storage, or identifier-bearing activity appear before a recorded consent choice."
  },
  {
    title: "After reject",
    body:
      "Reject-path scans can surface whether classified non-essential activity appears to continue after a refusal-style interaction."
  },
  {
    title: "Disclosure alignment",
    body:
      "Runtime evidence is compared with public privacy and cookie disclosures so teams can review gaps between observed behavior and stated coverage."
  }
];

const productionEvidenceRows = [
  ["domain", "www.draftkings.com"],
  ["scan_id", "c432334e-83e9-4799-843e-cb1574b6f540"],
  ["scanned_at", "2026-04-27T18:51:57.369Z"],
  ["finding_id", "pre_consent_tracking_detected"],
  ["cmp_vendor", "TrustArc"],
  ["first_request_ms", "1062"],
  ["first_third_party_request_ms", "2662"],
  ["third_party_requests", "117"],
  ["third_party_cookies", "50"],
  ["preconsent_violation_count", "26"],
  ["vendor_samples", "Google Tag Manager, Meta Pixel, Reddit Pixel, TikTok Pixel, Google Ads"]
] as const;

const findingClusters = [
  {
    title: "Consent timing/enforcement",
    ids: ["pre_consent_tracking_detected", "reject_tracking_persists_after_reject"]
  },
  {
    title: "Consent UX",
    ids: ["reject_option_missing_or_hidden", "asymmetric_consent_ui", "consent_dark_patterns_detected"]
  },
  {
    title: "Tracking/identifiers/adtech",
    ids: [
      "cross_domain_identifier_sharing_observed",
      "rtb_cookie_sync_observed",
      "fingerprinting_related_signals_observed"
    ]
  },
  {
    title: "Session replay/sensitive surfaces",
    ids: [
      "session_recording_services_detected",
      "possible_session_replay_on_sensitive_input_surface",
      "sensitive_data_collection_with_third_party_tracking_present"
    ]
  },
  {
    title: "Disclosure/policy alignment",
    ids: ["cookie_disclosure_gap", "policy_behavior_contradiction_detected"]
  }
];

const regulatoryContexts = [
  {
    title: "GDPR valid consent review",
    body:
      "Consent quality, purpose specificity, withdrawal, transparency, and accountability may be relevant when runtime behavior depends on a consent basis.",
    links: [
      { href: "https://gdpr-info.eu/", label: "GDPR text" },
      { href: "https://gdpr-info.eu/art-7-gdpr/", label: "Article 7" },
      { href: "https://gdpr-info.eu/art-5-gdpr/", label: "Article 5" },
      { href: "https://gdpr-info.eu/art-25-gdpr/", label: "Article 25" }
    ]
  },
  {
    title: "ePrivacy cookie and device access review",
    body:
      "Cookie, local storage, and similar terminal-equipment access can require separate review from broader GDPR processing analysis.",
    links: [{ href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058", label: "ePrivacy Directive" }]
  },
  {
    title: "UK GDPR / PECR / ICO context",
    body:
      "UK cookie and similar technology guidance is often useful for reviewing consent controls, essential-cookie claims, and clear explanations.",
    links: [
      {
        href: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/",
        label: "ICO cookie guidance"
      }
    ]
  },
  {
    title: "EDPB consent guidance context",
    body:
      "EDPB materials are useful context when reviewing affirmative action, refusal paths, imbalance, bundled choices, and consent withdrawal.",
    links: [
      {
        href: "https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en",
        label: "EDPB consent guidance"
      }
    ]
  },
  {
    title: "CPRA / FTC comparative privacy context",
    body:
      "US privacy-choice, disclosure, and consumer-protection review can be a secondary lens for multi-jurisdictional programs, separate from this GDPR page.",
    links: []
  }
];

const methodologySteps = [
  "Load public pages in a clean browser profile.",
  "Record runtime sequence: consent surface, consent state, requests, cookies/storage, vendors, timing, coverage.",
  "Classify signals by purpose/essentiality where possible.",
  "Surface findings only when retained evidence meets the finding contract."
];

const guardrails = [
  "CertScore does not infer pre-consent tracking from CMP script presence, tag-manager presence, vendor names, cookie names, or policy text alone.",
  "Findings require retained runtime anchors.",
  "\"Not detected\" means not observed in scan scope, not proof of absence.",
  "Region, prior consent, A/B tests, CMP configuration, bot protections, and blocked scans can affect results."
];

const faqs = [
  {
    question: "What is a GDPR website privacy scanner?",
    answer:
      "A GDPR website privacy scanner reviews public website behavior that may be relevant to privacy and data-protection review. CertScore focuses on automated public-web observations for review, including consent timing, cookies, tracking, replay, fingerprinting-related activity, and disclosures."
  },
  {
    question: "What is pre-consent tracking?",
    answer:
      "Pre-consent tracking means classified non-essential request, cookie, storage, analytics, advertising, replay, measurement, or identifier-bearing activity observed before CertScore records a consent choice or prior consent state for that purpose."
  },
  {
    question: "Does GDPR require cookie consent?",
    answer:
      "Cookie and device-access review often involves both GDPR and ePrivacy context. Some storage or access may require consent unless an exception applies. CertScore surfaces runtime evidence for review and does not decide which legal basis or exception applies."
  },
  {
    question: "Can CertScore tell me if my website is GDPR compliant?",
    answer:
      "No. CertScore provides automated public-web observations for review. It does not provide legal advice, certification, proof of non-compliance, or a GDPR compliance determination."
  },
  {
    question: "How does CertScore detect tracking before consent?",
    answer:
      "CertScore records a clean browser sequence with page start, consent-surface observations, consent state, network requests, cookies, storage, vendors, and timing. A finding requires retained runtime anchors; it is not inferred from a banner, CMP, tag manager, vendor name, cookie name, or policy text alone."
  },
  {
    question: "What is the difference between a CMP scan and runtime consent evidence?",
    answer:
      "A CMP scan can describe consent-tool presence or configuration. Runtime consent evidence shows what the browser observed: what loaded, what wrote cookies or storage, what transmitted identifiers, and what appeared before or after consent interactions."
  },
  {
    question: "What should I review first after a GDPR-related finding?",
    answer:
      "Start with the retained evidence, consent state, timing, vendor purpose, affected page, and whether the observed behavior matches intended CMP, tag-manager, and disclosure configuration. Then route the item to privacy, legal, engineering, or vendor owners as needed."
  },
  {
    question: "Does CertScore scan behind logins?",
    answer:
      "This page describes public-web scanning. Protected routes, authenticated-only areas, paywalls, bot protections, and blocked scans can limit coverage unless a separate approved workflow is configured."
  },
  {
    question: "What does \"not detected\" mean?",
    answer:
      "\"Not detected\" means the signal was not observed in the scan scope. It is not proof of absence, and results can vary by region, prior consent, A/B tests, CMP configuration, browser state, timing, and coverage."
  }
];

function Bar({ percentLabel, widthClass }: { percentLabel: string; widthClass: string }) {
  return (
    <div className="space-y-2">
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full bg-sky-500 ${widthClass}`} />
      </div>
      <p className="text-xs font-medium text-slate-500">{percentLabel}</p>
    </div>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} rel="noopener noreferrer" target="_blank" className="text-sm font-medium text-sky-700 hover:text-sky-800">
      {label}
    </a>
  );
}

function CtaButtons({ location }: { location: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button
        asChild
        className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_10px_24px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
      >
        <Link href="#scan" data-analytics-cta-location={location} data-analytics-event="guide_cta_clicked">
          Run a free scan &rarr;
        </Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href="/findings">Browse findings</Link>
      </Button>
    </div>
  );
}

export default function GdprPage() {
  const findingsById = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));
  const schemas = [
    createPublicWebPageSchema({
      title: pageTitle,
      description: pageDescription,
      path: pagePath
    }),
    createPublicArticleSchema({
      title: pageTitle,
      description: pageDescription,
      path: pagePath,
      type: "TechArticle",
      about: [
        "GDPR",
        "ePrivacy",
        "cookie consent",
        "pre-consent tracking",
        "runtime evidence",
        "privacy review"
      ]
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "GDPR privacy scanner", path: pagePath }
    ]),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer
        }
      }))
    }
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      {schemas.map((schema) => (
        <script key={JSON.stringify(schema)} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-6">
            <Badge tone="neutral">GDPR privacy scanner</Badge>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                GDPR website privacy signals from real browser behavior
              </h1>
              <p className="text-lg leading-8 text-slate-600">
                CertScore scans public websites for GDPR-relevant consent, cookie, tracking, and data-protection review signals - including pre-consent tracking, third-party cookie activity before consent, consent UX friction, session replay signals, fingerprinting-related activity, and policy/runtime gaps.
              </p>
            </div>
            <CtaButtons location="gdpr_hero" />
            <div className="flex flex-wrap gap-2">
              {heroChips.map((chip) => (
                <span key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  {chip}
                </span>
              ))}
            </div>
            <div className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-slate-700">
              <p className="font-semibold text-slate-950">{disclaimer}</p>
            </div>
          </div>

          <Card className="border-slate-800 bg-slate-950 text-slate-100 shadow-[0_22px_60px_rgba(2,6,23,0.28)]">
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Production example, sanitized</p>
              <CardTitle className="text-xl text-white">Runtime evidence card</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {productionEvidenceRows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[10rem_1fr] gap-3 border-b border-slate-800 pb-3 last:border-b-0 last:pb-0">
                  <span className="font-mono text-xs text-slate-500">{label}</span>
                  <span className="min-w-0 break-words font-medium text-slate-100">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="border border-slate-200 bg-white p-5 text-base leading-7 text-slate-700">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Direct answer</h2>
          <p className="mt-3">
            CertScore provides GDPR website privacy scanning that surfaces automated public-web observations about consent timing, cookies, tracking, and privacy disclosures. It does not provide legal advice, certification, or a GDPR compliance determination.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="max-w-3xl space-y-3">
          <Badge tone="neutral">Runtime evidence</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">A cookie banner is not the same as consent enforcement</h2>
          <p className="text-base leading-7 text-slate-600">
            CMPs and privacy policies are only part of GDPR/ePrivacy review. Reviewers need evidence of what loads, writes cookies or storage, transmits identifiers, or continues after reject. CertScore compares live browser behavior with consent controls, cookies, trackers, and disclosures.
          </p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {runtimeCards.map((card) => (
            <Card key={card.title} className="border-slate-200 bg-white shadow-none">
              <CardHeader>
                <CardTitle className="text-lg text-slate-950">{card.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-slate-600">{card.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="max-w-3xl space-y-3">
            <Badge tone="neutral">Production scan context</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              GDPR/ePrivacy signals observed in recent production scans
            </h2>
            <p className="text-base leading-7 text-slate-600">
              Across recent CertScore production scan batches covering public websites, the most common GDPR/ePrivacy-relevant review signal was tracking before a recorded consent choice. These are automated public-web observations for review, not legal conclusions, certification, or compliance determinations.
            </p>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {gdprSignalBenchmarks.slice(0, 3).map((metric) => (
                <Card key={metric.id} className="border-slate-200 bg-slate-50 shadow-none">
                  <CardHeader className="pb-2">
                    <p className="text-3xl font-semibold text-slate-950">{metric.displayPercent}</p>
                    <CardTitle className="text-base text-slate-950">{metric.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm leading-6 text-slate-600">
                    <p>{metric.gdprRelevance}</p>
                    <p className="text-xs leading-5 text-slate-500">{metric.caveat}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="border-slate-200 bg-slate-50 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl text-slate-950">Signal mix</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {gdprSignalBenchmarks.map((metric, index) => (
                  <div key={metric.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{metric.label}</p>
                        <p className="text-xs leading-5 text-slate-500">{metric.gdprRelevance}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-slate-950">{metric.displayPercent}</p>
                    </div>
                    <Bar
                      percentLabel={metric.count && metric.denominatorApprox ? `${metric.count} / ${metric.denominatorApprox}` : metric.caveat}
                      widthClass={index === 0 ? "w-[72%]" : index === 1 ? "w-[44%]" : index === 2 ? "w-[50%]" : index === 3 ? "w-[20%]" : "w-[14%]"}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-500">
            Recent production scan batches may include incomplete coverage, protected routes, regional variance, and overlapping windows. Percentages are directional context for prioritizing review, not a legal or statistical conclusion.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="max-w-3xl space-y-3">
          <Badge tone="neutral">Finding registry examples</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
            GDPR-relevant examples from the CertScore findings registry
          </h2>
          <p className="text-base leading-7 text-slate-600">
            These are GDPR/ePrivacy-relevant examples from the 23-finding registry. They are review signals backed by retained evidence, not a statement that every registry item is a GDPR finding.
          </p>
        </div>
        <div className="mt-8 grid gap-6">
          {findingClusters.map((cluster) => (
            <div key={cluster.title} className="space-y-4">
              <h3 className="text-xl font-semibold tracking-tight text-slate-950">{cluster.title}</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {cluster.ids.map((id) => {
                  const finding = findingsById.get(id);
                  return (
                    <Card key={id} className="border-slate-200 bg-white shadow-none">
                      <CardHeader>
                        <p className="font-mono text-xs text-slate-400">{id}</p>
                        <CardTitle className="text-base leading-6 text-slate-950">{finding?.title ?? id}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                        <p>
                          <span className="font-semibold text-slate-800">What CertScore observes: </span>
                          {finding?.observed ?? "Runtime evidence that may be relevant to privacy review."}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-800">Why it may matter for review: </span>
                          {finding?.regulatoryContext?.primaryConcern.displayCopy ?? "The retained evidence can help reviewers prioritize consent, cookie, tracking, disclosure, or data-protection questions."}
                        </p>
                        <Link href={finding ? `/findings/${finding.id}` : "/findings"} className="inline-flex text-sm font-medium text-sky-700 hover:text-sky-800">
                          View finding detail
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="max-w-3xl space-y-3">
            <Badge tone="neutral">Regulatory context</Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Mapped to privacy and data-protection review contexts</h2>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {regulatoryContexts.map((context) => (
              <Card key={context.title} className="border-slate-200 bg-slate-50 shadow-none">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-950">{context.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
                  <p>{context.body}</p>
                  {context.links.length > 0 ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {context.links.map((link) => (
                        <ExternalLink key={link.href} href={link.href} label={link.label} />
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="max-w-3xl space-y-3">
          <Badge tone="neutral">Methodology</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">From public page load to reviewable evidence</h2>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            {methodologySteps.map((step, index) => (
              <Card key={step} className="border-slate-200 bg-white shadow-none">
                <CardContent className="flex gap-4 p-5 text-sm leading-6 text-slate-600">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
                    {index + 1}
                  </span>
                  <p>{step}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Evidence guardrails</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-6 text-slate-600">
                {guardrails.map((guardrail) => (
                  <li key={guardrail} className="flex gap-3">
                    <span className="mt-[0.6rem] h-1.5 w-1.5 flex-none rounded-full bg-sky-500" aria-hidden="true" />
                    <span>{guardrail}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="max-w-3xl space-y-3">
          <Badge tone="neutral">FAQ</Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">GDPR website privacy scanner FAQ</h2>
        </div>
        <div className="mt-8 grid gap-4">
          {faqs.map((faq) => (
            <details key={faq.question} className="border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer text-base font-semibold text-slate-950">{faq.question}</summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="scan" className="mx-auto max-w-6xl px-6 py-16">
        <div className="border border-slate-200 bg-white p-6">
          <DomainScanForm
            buttonLabel="Run a free scan"
            helperText="Public website scans surface automated observations for review."
            inputLabel="Website domain"
            mode="preview"
            scanSource="unknown"
          />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
