import { Badge } from "@website-signal-risk-scanner/ui";
import { FindingAtlasBrowser } from "../../components/marketing/findings/finding-atlas-browser";
import { getFindingReferenceItems, type FindingReferenceItem } from "../../lib/marketing/finding-atlas";
import { FINDING_DENSITY_BENCHMARK_SCOPE } from "../../lib/scans/finding-density-benchmarks";
import {
  createBreadcrumbSchema,
  createDefinedTermSchema,
  createDefinedTermSetSchema,
  createItemListSchema,
  createPublicArticleSchema,
  createPublicWebPageSchema
} from "../../lib/seo";

type FindingsReferencePageProps = {
  activeFinding?: FindingReferenceItem;
};

const DEFAULT_FINDING_ID = "pre_consent_tracking_detected";

function getFindingPath(findingId: string) {
  return `/findings/${findingId}`;
}

function getPageTitle(activeFinding?: FindingReferenceItem) {
  return activeFinding ? `${activeFinding.title} finding reference` : "CertScore findings reference";
}

function getPageDescription(activeFinding?: FindingReferenceItem) {
  return activeFinding
    ? `${activeFinding.observed} Review the evidence context, methodology, common causes, and reviewer questions for this CertScore finding.`
    : "Review CertScore findings, evidence, signals, and observations surfaced from public-web runtime scans.";
}

function getPagePath(activeFinding?: FindingReferenceItem) {
  return activeFinding ? getFindingPath(activeFinding.id) : "/findings";
}

export function getReferenceNotes(activeFinding?: FindingReferenceItem) {
  const commonNotes = [
    "CertScore uses findings, evidence, signals, and observations consistently: signals are raw runtime or page-surface events, evidence is retained support, observations are interpreted evidence context, and findings are promoted review items.",
    "Findings are runtime evidence and public-surface observations for review. Observed signals may surface possible concerns, but review is recommended before operational or legal reliance.",
    "Finding reference content is reviewed periodically and updated when material guidance changes. CertScore monitors guidance families such as EDPB consent and ePrivacy materials, ICO cookie guidance, CNIL tracker recommendations, FTC privacy and dark-pattern materials, and relevant accessibility guidance where applicable."
  ];

  if (activeFinding?.category === "Accessibility") {
    const accessibilityReviewNote = activeFinding.id === "visual_contrast_accessibility_issue"
      ? "WCAG 2.2 contrast guidance is relevant to text contrast, non-text contrast, large-text thresholds, inactive components, incidental content, decorative graphics, and logo or brand-mark exceptions."
      : "Automated accessibility evidence can support WCAG-oriented review, but manual review is needed to confirm context, applicable success criterion, user impact, exception status, assistive-technology behavior, keyboard behavior, and remediation quality.";

    return [
      ...commonNotes,
      accessibilityReviewNote,
      "ADA Title II, ADA Title III, Section 508, EN 301 549, and UK public-sector accessibility contexts may be relevant depending on organization type, procurement context, jurisdiction, and manual review.",
      `Prevalence labels use the ${FINDING_DENSITY_BENCHMARK_SCOPE.label}, an approximately ${FINDING_DENSITY_BENCHMARK_SCOPE.sampleSizeApprox.toLocaleString()}-scan directional calibration set.`
    ];
  }

  if (activeFinding?.id === "cpra_cba_opt_out_missing") {
    return [
      ...commonNotes,
      "CPRA opt-out, Do Not Sell or Share, and privacy-choice obligations may depend on organization scope, user region, data purpose, sale/share analysis, cross-context behavioral advertising context, exemptions, and manual review.",
      "GPC handling may require region-specific and implementation-specific review; this public finding does not determine backend preference handling.",
      "FTC privacy claims and choice-architecture materials may be relevant where public statements, opt-out paths, or runtime behavior affect user expectations, but this finding does not determine deception, unfairness, legal status, or compliance status.",
      `Prevalence labels use the ${FINDING_DENSITY_BENCHMARK_SCOPE.label}, an approximately ${FINDING_DENSITY_BENCHMARK_SCOPE.sampleSizeApprox.toLocaleString()}-scan directional calibration set.`
    ];
  }

  return [
    ...commonNotes,
    "EDPB consent guidance is relevant to consent quality and affirmative indication where consent is relied upon.",
    "EU ePrivacy cookie/tracker principles are relevant to storing information or gaining access to information on user terminal equipment.",
    "ICO cookie and similar technologies guidance is relevant to active consent, clear explanation, and essential-cookie exceptions.",
    "CNIL cookie/tracker and analytics guidance is relevant to tracker consent and limited analytics exemptions.",
    "FTC dark-pattern and commercial-surveillance materials may be relevant to hidden tracking or unclear user-choice review, but this finding does not determine deception, unfairness, or legal status.",
    `Prevalence labels use the ${FINDING_DENSITY_BENCHMARK_SCOPE.label}, an approximately ${FINDING_DENSITY_BENCHMARK_SCOPE.sampleSizeApprox.toLocaleString()}-scan directional calibration set.`
  ];
}

function createFindingSchemas({
  activeFinding,
  findings,
  pageDescription,
  pagePath,
  pageTitle
}: {
  activeFinding?: FindingReferenceItem;
  findings: FindingReferenceItem[];
  pageDescription: string;
  pagePath: string;
  pageTitle: string;
}) {
  const findingTermInputs = findings.map((finding) => ({
    category: finding.category,
    description: finding.observed,
    inDefinedTermSetPath: "/findings",
    name: finding.title,
    path: getFindingPath(finding.id),
    termCode: finding.id
  }));

  return [
    createPublicWebPageSchema({
      title: pageTitle,
      description: pageDescription,
      path: pagePath
    }),
    createPublicArticleSchema({
      title: pageTitle,
      description: activeFinding
        ? `A technical reference for the ${activeFinding.title} finding, including observed signals, retained evidence, methodology context, and review questions.`
        : "A technical reference for CertScore findings, observed signals, retained evidence, and reviewer context.",
      path: pagePath,
      type: "TechArticle",
      about: activeFinding
        ? [
            activeFinding.category,
            activeFinding.title,
            "runtime evidence",
            "public-web observations",
            "finding review"
          ]
        : [
            "website scanning",
            "runtime evidence",
            "finding registry",
            "tracking signals",
            "cookies",
            "accessibility",
            "consent methodology"
          ]
    }),
    createDefinedTermSetSchema({
      title: "CertScore finding registry",
      description:
        "Canonical CertScore finding terms for automated public-web observations, retained evidence, runtime signals, and review-oriented findings.",
      path: "/findings",
      terms: findingTermInputs
    }),
    createItemListSchema({
      name: "CertScore finding registry index",
      description: "Index of CertScore finding reference pages.",
      path: "/findings",
      items: findings.map((finding) => ({
        path: getFindingPath(finding.id),
        name: finding.title,
        identifier: finding.id,
        description: finding.observed
      }))
    }),
    ...(activeFinding
      ? [
          createDefinedTermSchema({
            category: activeFinding.category,
            description: activeFinding.observed,
            inDefinedTermSetPath: "/findings",
            name: activeFinding.title,
            path: getFindingPath(activeFinding.id),
            termCode: activeFinding.id
          })
        ]
      : []),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Findings registry", path: "/findings" },
      ...(activeFinding ? [{ name: activeFinding.title, path: getFindingPath(activeFinding.id) }] : [])
    ])
  ];
}

export function getDefaultFindingId() {
  return DEFAULT_FINDING_ID;
}

export function getFindingReferencePath(findingId: string) {
  return getFindingPath(findingId);
}

export function getFindingReferencePageCopy(activeFinding?: FindingReferenceItem) {
  return {
    pageTitle: getPageTitle(activeFinding),
    pageDescription: getPageDescription(activeFinding),
    pagePath: getPagePath(activeFinding)
  };
}

export function FindingsReferencePage({ activeFinding }: FindingsReferencePageProps) {
  const findings = getFindingReferenceItems();
  const certscoreGptUrl = process.env.NEXT_PUBLIC_CERTSCORE_GPT_URL;
  const initialFindingId = activeFinding?.id ?? DEFAULT_FINDING_ID;
  const { pageDescription, pagePath, pageTitle } = getFindingReferencePageCopy(activeFinding);
  const headingTitle = activeFinding?.title ?? "CertScore findings reference";
  const eyebrow = activeFinding ? "Finding reference" : "Technical reference";
  const schemas = createFindingSchemas({
    activeFinding,
    findings,
    pageDescription,
    pagePath,
    pageTitle
  });

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      {schemas.map((schema) => (
        <script
          key={JSON.stringify(schema)}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <div className="max-w-3xl space-y-4">
        <Badge tone="neutral">{eyebrow}</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          {headingTitle}
        </h1>
        {activeFinding ? (
          <p className="text-base leading-7 text-slate-600">{pageDescription}</p>
        ) : (
          <div className="space-y-4 text-base leading-7 text-slate-600">
            <p>
              Findings are automated public-web observations for review. They are not legal conclusions, certifications, compliance determinations, or proof of non-compliance.
            </p>
            <div className="border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <h2 className="text-sm font-semibold text-slate-950">How to read a finding</h2>
              <p className="mt-2">
                Use the badges and evidence tiers together: criticality describes review priority, confidence describes evidence strength, prevalence gives directional calibration context, and regulatory context shows review lenses that may be relevant depending on jurisdiction, purpose, and manual review.
              </p>
            </div>
            <p className="text-sm leading-6 text-slate-500">
              CertScore's finding references are reviewed periodically and updated when material regulatory or accessibility guidance changes. Guidance families monitored include EDPB consent and ePrivacy materials, ICO cookie guidance, CNIL tracker recommendations, FTC privacy and dark-pattern materials, CPRA/privacy-choice materials, and accessibility guidance where applicable.
            </p>
            <p className="text-sm leading-6">
              {certscoreGptUrl ? (
                <a className="font-semibold text-sky-700 hover:text-sky-800" href={certscoreGptUrl}>
                  Scan a website in ChatGPT
                </a>
              ) : (
                <a className="font-semibold text-sky-700 hover:text-sky-800" href="/api-pulse">
                  CertScore GPT coming soon
                </a>
              )}
            </p>
          </div>
        )}
      </div>

      <div className="mt-10">
        <FindingAtlasBrowser findings={findings} initialFindingId={initialFindingId} />
      </div>

      <section className="mt-8 border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Reference notes</h2>
        <ul className="mt-3 max-w-3xl space-y-2 text-sm leading-7 text-slate-600">
          {getReferenceNotes(activeFinding).map((note) => (
            <li key={note} className="flex gap-2">
              <span aria-hidden="true" className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
