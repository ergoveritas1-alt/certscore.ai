import { Badge } from "@website-signal-risk-scanner/ui";
import Link from "next/link";
import { FindingAtlasBrowser } from "../../components/marketing/findings/finding-atlas-browser";
import { getCertScoreGptUrl } from "../../lib/marketing/certscore-gpt";
import {
  FINDING_REFERENCE_CATEGORIES,
  getFindingReferenceItems,
  type FindingReferenceCategory,
  type FindingReferenceItem
} from "../../lib/marketing/finding-atlas";
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
  return activeFinding ? `${activeFinding.title} finding reference` : "CertScore.ai findings reference";
}

function getPageDescription(activeFinding?: FindingReferenceItem) {
  return activeFinding
    ? `${activeFinding.observed} Review the evidence context, methodology, common causes, and reviewer questions for this CertScore.ai finding.`
    : "Review CertScore.ai findings, evidence, signals, and observations surfaced from public-web runtime scans.";
}

function getPagePath(activeFinding?: FindingReferenceItem) {
  return activeFinding ? getFindingPath(activeFinding.id) : "/findings";
}

export function getReferenceNotes(activeFinding?: FindingReferenceItem) {
  const commonNotes = [
    "CertScore.ai uses findings, evidence, signals, and observations consistently: signals are raw runtime or page-surface events, evidence is retained support, observations are interpreted evidence context, and findings are promoted review items.",
    "Findings are runtime evidence and public-surface observations for human and agentic review. Observed signals may surface possible concerns, but review is recommended before operational or legal reliance.",
    "Finding reference content is reviewed periodically and updated when material guidance changes. CertScore.ai monitors guidance families such as EDPB consent and ePrivacy materials, ICO cookie guidance, CNIL tracker recommendations, FTC privacy and dark-pattern materials, and relevant accessibility guidance where applicable."
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
        : "A technical reference for CertScore.ai findings, observed signals, retained evidence, and reviewer context.",
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
      title: "CertScore.ai finding registry",
      description:
        "Canonical CertScore.ai finding terms for automated public-web observations, retained evidence, runtime signals, and review-oriented findings.",
      path: "/findings",
      terms: findingTermInputs
    }),
    createItemListSchema({
      name: "CertScore.ai finding registry index",
      description: "Index of CertScore.ai finding reference pages.",
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

function getFindingsByCategory(findings: FindingReferenceItem[]) {
  return FINDING_REFERENCE_CATEGORIES.map((category) => ({
    category,
    findings: findings.filter((finding) => finding.category === category)
  })).filter((group) => group.findings.length > 0);
}

function getCategoryIntro(category: FindingReferenceCategory) {
  switch (category) {
    case "Consent":
      return "Consent timing and choice-surface findings, including pre-consent tracking, reject-path behavior, and consent UI review signals.";
    case "Cookies":
      return "Cookie and browser-storage findings for pre-consent activity, disclosure review, and retention-oriented review.";
    case "Third-party tracking":
      return "Third-party request, identifier sharing, adtech, session replay, and sensitive-surface tracking context.";
    case "Accessibility":
      return "Automated accessibility triage findings for keyboard, labels, text alternatives, contrast, and focus behavior.";
    case "Fingerprinting":
      return "Browser and device-signal findings that can support fingerprinting-oriented technical review.";
    case "Disclosure gaps":
      return "Public disclosure, privacy-choice, and policy-surface gaps that need manual business and legal review.";
    case "Consumer protection":
      return "Choice architecture and policy/runtime alignment findings for human and agentic review of public claims and observed behavior.";
  }
}

function FindingsRegistryDirectory({ findings }: { findings: FindingReferenceItem[] }) {
  const groupedFindings = getFindingsByCategory(findings);

  return (
    <section className="mt-8 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="findings-registry-directory">
      <div className="max-w-3xl">
        <h2 id="findings-registry-directory" className="text-xl font-semibold tracking-tight text-slate-950">
          Finding reference directory
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Browse every public CertScore.ai finding reference page in the registry. Each page documents observed signals, evidence expectations,
          common causes, review questions, limitations, and related findings.
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {groupedFindings.map((group) => (
          <section key={group.category} className="border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-950">{group.category}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{getCategoryIntro(group.category)}</p>
            <ul className="mt-3 space-y-2">
              {group.findings.map((finding) => (
                <li key={finding.id}>
                  <Link
                    href={getFindingPath(finding.id)}
                    className="group block border border-slate-200 bg-white p-3 hover:border-sky-200 hover:bg-sky-50"
                  >
                    <span className="block text-sm font-semibold leading-5 text-sky-700 group-hover:text-sky-800">
                      {finding.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {finding.criticality} priority · {finding.benchmark.contextLabel}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-slate-600">{finding.observed}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function RelatedFindingsSection({
  activeFinding,
  findings
}: {
  activeFinding: FindingReferenceItem;
  findings: FindingReferenceItem[];
}) {
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  const relatedFindings = activeFinding.relatedFindingIds
    .map((findingId) => findingsById.get(findingId))
    .filter((finding): finding is FindingReferenceItem => Boolean(finding))
    .slice(0, 6);

  if (relatedFindings.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="related-findings">
      <div className="max-w-3xl">
        <h2 id="related-findings" className="text-xl font-semibold tracking-tight text-slate-950">
          Related findings
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Review adjacent CertScore.ai finding references that commonly help explain the same evidence cluster, consent path, cookie behavior, or disclosure context.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {relatedFindings.map((finding) => (
          <Link
            key={finding.id}
            href={getFindingPath(finding.id)}
            className="group block border border-slate-200 bg-slate-50 p-4 hover:border-sky-200 hover:bg-sky-50"
          >
            <span className="block text-sm font-semibold leading-5 text-sky-700 group-hover:text-sky-800">
              {finding.title}
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              {finding.category} · {finding.criticality} priority
            </span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">{finding.observed}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FindingsReferencePage({ activeFinding }: FindingsReferencePageProps) {
  const findings = getFindingReferenceItems();
  const certscoreGptUrl = getCertScoreGptUrl();
  const initialFindingId = activeFinding?.id ?? DEFAULT_FINDING_ID;
  const { pageDescription, pagePath, pageTitle } = getFindingReferencePageCopy(activeFinding);
  const headingTitle = activeFinding?.title ?? "CertScore.ai findings reference";
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
              Findings are automated public-web observations for human and agentic review. They are not legal conclusions, certifications, compliance determinations, or proof of non-compliance.
            </p>
            <div className="border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <h2 className="text-sm font-semibold text-slate-950">How to read a finding</h2>
              <p className="mt-2">
                Use the badges and evidence tiers together: criticality describes review priority, confidence describes evidence strength, prevalence gives directional calibration context, and regulatory context shows review lenses that may be relevant depending on jurisdiction, purpose, and manual review.
              </p>
            </div>
            <div className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-slate-700">
              <h2 className="text-sm font-semibold text-slate-950">How top findings are calibrated</h2>
              <p className="mt-2">
                CertScore.ai ranks findings using evidence strength, directness, corroboration, affected surface, and review relevance.
                Benchmark frequency is market context only. A rare finding is not automatically critical, and a common finding is not automatically low risk.
                Findings remain automated public-web observations for human and agentic review, not legal conclusions.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-10">
        <FindingAtlasBrowser findings={findings} initialFindingId={initialFindingId} />
      </div>

      {!activeFinding ? <FindingsRegistryDirectory findings={findings} /> : null}
      {activeFinding ? <RelatedFindingsSection activeFinding={activeFinding} findings={findings} /> : null}

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

      {!activeFinding ? (
        <section className="mt-8 space-y-4 border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 sm:p-6">
          <p>
            CertScore.ai's finding references are reviewed periodically and updated when material regulatory or accessibility guidance changes.
            Guidance families monitored include EDPB consent and ePrivacy materials, ICO cookie guidance, CNIL tracker recommendations, FTC
            privacy and dark-pattern materials, and accessibility guidance where applicable.
          </p>
          <div className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-slate-700">
            <p>Want to test these findings on a public website? Use the CertScore.ai GPT to scan a public website from ChatGPT.</p>
            <p className="mt-1 text-slate-600">
              Results are automated public-web observations for human and agentic review, not legal advice or a compliance determination.
            </p>
            <a
              className="mt-3 inline-flex rounded-full border border-sky-300 bg-white px-3 py-2 font-semibold text-sky-700 hover:bg-sky-50"
              data-analytics-cta-location="guides_findings"
              data-analytics-destination-url={certscoreGptUrl}
              data-analytics-event="gpt_cta_clicked"
              href={certscoreGptUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Open CertScore.ai GPT
            </a>
          </div>
        </section>
      ) : null}
    </section>
  );
}
