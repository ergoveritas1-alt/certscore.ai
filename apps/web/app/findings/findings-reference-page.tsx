import { Badge } from "@website-signal-risk-scanner/ui";
import Link from "next/link";
import { FindingAtlasBrowser } from "../../components/marketing/findings/finding-atlas-browser";
import { getCertScoreGptUrl } from "../../lib/marketing/certscore-gpt";
import {
  GDPR_EPRIVACY_CHECKLIST_STATUS_REFERENCE,
  getGdprEprivacyChecklistReferenceGroups,
  getGdprEprivacyChecklistReferenceItems,
  type GdprEprivacyChecklistReferenceItem
} from "../../lib/marketing/gdpr-eprivacy-checklist-reference";
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
const SECTION_IDS = {
  checklist: "gdpr-eprivacy-checklist-directory",
  directFindings: "findings-registry-directory",
  statusLanguage: "checklist-status-language",
  referenceGuide: "reference-guide",
  referenceNotes: "reference-notes",
  relatedReading: "related-reading"
} as const;

function getFindingPath(findingId: string) {
  return `/findings/${findingId}`;
}

function anchorSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getChecklistCategoryAnchorId(category: string) {
  return anchorSlug(category);
}

function getPageTitle(activeFinding?: FindingReferenceItem) {
  return activeFinding ? `${activeFinding.title} finding reference` : "CertScore findings and evidence checklist reference";
}

function getPageDescription(activeFinding?: FindingReferenceItem) {
  return activeFinding
    ? `${activeFinding.observed} Review the evidence context, methodology, common causes, and reviewer questions for this CertScore finding.`
    : "Review CertScore direct findings, GDPR/ePrivacy evidence checklist rows, regulatory gap top findings, retained evidence, source-signal limitations, and reviewer context.";
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
      title: "CertScore findings and evidence checklist reference",
      description:
        "Canonical CertScore direct finding terms and GDPR/ePrivacy evidence checklist references for automated public-web observations, retained evidence, runtime signals, and review-oriented findings.",
      path: "/findings",
      terms: findingTermInputs
    }),
    createItemListSchema({
      name: "CertScore findings and evidence checklist index",
      description: "Index of CertScore direct finding reference pages.",
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
      return "Choice architecture and policy/runtime alignment findings for review of public claims and observed behavior.";
  }
}

function DirectFindingReferencesSection({ findings }: { findings: FindingReferenceItem[] }) {
  const featuredFinding = findings.find((finding) => finding.id === DEFAULT_FINDING_ID);
  const groupedFindings = getFindingsByCategory(findings.filter((finding) => finding.id !== featuredFinding?.id));

  return (
    <section className="mt-8 scroll-mt-24 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby={SECTION_IDS.directFindings}>
      <div className="max-w-3xl">
        <h2 id={SECTION_IDS.directFindings} className="text-xl font-semibold tracking-tight text-slate-950">
          Direct unified finding references
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Browse public direct-finding references that still map to report findings. These pages document observed signals,
          evidence expectations, common causes, review questions, limitations, and related checklist rows where applicable.
        </p>
      </div>

      {featuredFinding ? (
        <Link
          href={getFindingPath(featuredFinding.id)}
          className="group mt-5 block border border-sky-200 bg-sky-50 p-4 hover:border-sky-300 hover:bg-sky-100"
        >
          <span className="inline-flex rounded-full border border-sky-200 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
            Featured example
          </span>
          <span className="mt-3 block text-base font-semibold leading-6 text-sky-800 group-hover:text-sky-900">
            {featuredFinding.title}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {featuredFinding.criticality} priority · {featuredFinding.benchmark.contextLabel}
          </span>
          <span className="mt-2 block max-w-3xl text-sm leading-6 text-slate-700">{featuredFinding.observed}</span>
        </Link>
      ) : null}

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
          Review adjacent CertScore finding references that commonly help explain the same evidence cluster, consent path, cookie behavior, or disclosure context.
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

type TocItem = {
  children?: Array<{ href: string; label: string }>;
  href: string;
  label: string;
};

function FindingsTableOfContents({ checklistRows }: { checklistRows: GdprEprivacyChecklistReferenceItem[] }) {
  const checklistCategories = getGdprEprivacyChecklistReferenceGroups().map((group) => ({
    href: `#${getChecklistCategoryAnchorId(group.category)}`,
    label: group.category
  }));
  const tocItems: TocItem[] = [
    {
      children: checklistCategories,
      href: `#${SECTION_IDS.checklist}`,
      label: "GDPR/ePrivacy evidence checklist"
    },
    {
      href: `#${SECTION_IDS.directFindings}`,
      label: `Direct unified finding references (${getFindingReferenceItems().length})`
    },
    {
      href: `#${SECTION_IDS.statusLanguage}`,
      label: "Checklist status language"
    },
    {
      href: `#${SECTION_IDS.referenceGuide}`,
      label: "Reference guide"
    },
    {
      href: `#${SECTION_IDS.referenceNotes}`,
      label: "Reference notes"
    },
    {
      href: `#${SECTION_IDS.relatedReading}`,
      label: "Related reading"
    }
  ];

  const list = (
    <nav aria-label="Findings page sections">
      <ul className="space-y-2 text-sm leading-6">
        {tocItems.map((item) => (
          <li key={item.href}>
            <a href={item.href} className="font-semibold text-slate-700 hover:text-sky-700">
              {item.label}
            </a>
            {item.children && item.children.length > 0 ? (
              <ul className="mt-2 grid gap-1 border-l border-slate-200 pl-3 text-xs leading-5 sm:grid-cols-2 lg:grid-cols-3">
                {item.children.map((child) => (
                  <li key={child.href}>
                    <a href={child.href} className="text-slate-500 hover:text-sky-700">
                      {child.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <section className="mt-8" aria-label="On this page">
      <details className="border border-slate-200 bg-white p-4 md:hidden">
        <summary className="cursor-pointer text-sm font-semibold text-slate-950">On this page</summary>
        <div className="mt-4">{list}</div>
      </details>
      <div className="sticky top-20 z-30 hidden border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur md:block">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">On this page</h2>
          <span className="text-xs text-slate-500">{checklistRows.length} checklist rows</span>
        </div>
        {list}
      </div>
    </section>
  );
}

function EvidenceModelOverview({
  checklistRowCount,
  directFindingCount
}: {
  checklistRowCount: number;
  directFindingCount: number;
}) {
  const modelItems = [
    {
      title: "Direct unified findings",
      body: `${directFindingCount} public finding references describe direct report findings promoted from retained runtime, public-surface, or accessibility evidence.`
    },
    {
      title: "GDPR/ePrivacy evidence checklist",
      body: `${checklistRowCount} checklist rows describe what the scan checks, which evidence can support each row, and when coverage remains limited or not testable.`
    },
    {
      title: "Regulatory gap top findings",
      body: "Checklist rows can be promoted into top findings with IDs like regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking when retained evidence indicates a potential concern."
    }
  ];

  return (
    <div className="border border-slate-200 bg-white p-5 sm:p-6">
      <div className="max-w-3xl">
        <p className="mt-2 text-sm leading-6 text-slate-600">
          CertScore now separates direct findings from GDPR/ePrivacy checklist evidence. A checklist row can be observed,
          projected as a possible gap, retained as a review signal, or marked not testable when source evidence is incomplete.
        </p>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {modelItems.map((item) => (
          <section key={item.title} className="border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

function ReferenceGuideSection({
  checklistRowCount,
  directFindingCount
}: {
  checklistRowCount: number;
  directFindingCount: number;
}) {
  const detailsClass = "group border border-slate-200 bg-white p-4";
  const summaryClass = "cursor-pointer text-sm font-semibold text-slate-950";

  return (
    <section className="mt-8 scroll-mt-24 border border-slate-200 bg-slate-50 p-5 sm:p-6" aria-labelledby={SECTION_IDS.referenceGuide}>
      <div className="max-w-3xl">
        <h2 id={SECTION_IDS.referenceGuide} className="text-xl font-semibold tracking-tight text-slate-950">
          Reference guide: how findings and statuses work
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          These notes explain the evidence model without placing the reference material ahead of the catalog.
        </p>
      </div>
      <div className="mt-5 space-y-3">
        <details className={detailsClass}>
          <summary className={summaryClass}>How to read this reference</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Use direct findings for specific report findings and GDPR/ePrivacy checklist rows for evidence coverage,
            source-signal gaps, retained artifacts, and status language used in the scan report.
          </p>
        </details>
        <details className={detailsClass}>
          <summary className={summaryClass}>How regulatory gap top findings work</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            When checklist evidence indicates a potential concern, the report may surface a top finding with an ID like
            <code className="mx-1 rounded bg-slate-50 px-1 py-0.5 font-mono text-[12px] text-slate-700">regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking</code>.
            That is a review signal from retained checklist evidence, not a legal determination.
          </p>
        </details>
        <details className={detailsClass}>
          <summary className={summaryClass}>Current scan-report evidence model</summary>
          <div className="mt-3">
            <EvidenceModelOverview checklistRowCount={checklistRowCount} directFindingCount={directFindingCount} />
          </div>
        </details>
      </div>
    </section>
  );
}

function ChecklistStatusLegend() {
  return (
    <section className="mt-8 scroll-mt-24 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby={SECTION_IDS.statusLanguage}>
      <div className="max-w-3xl">
        <h2 id={SECTION_IDS.statusLanguage} className="text-xl font-semibold tracking-tight text-slate-950">
          Checklist status language
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Statuses describe retained evidence and scan coverage. They are not legal conclusions, certifications, or compliance determinations.
        </p>
      </div>
      <dl className="mt-5 grid gap-3 md:grid-cols-2">
        {GDPR_EPRIVACY_CHECKLIST_STATUS_REFERENCE.map((item) => (
          <div key={item.status} className="border border-slate-200 bg-slate-50 p-4">
            <dt className="text-sm font-semibold text-slate-950">{item.status}</dt>
            <dd className="mt-2 text-sm leading-6 text-slate-600">{item.meaning}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function GdprEprivacyChecklistDirectory({
  rows
}: {
  rows: GdprEprivacyChecklistReferenceItem[];
}) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const groups = getGdprEprivacyChecklistReferenceGroups();

  return (
    <section className="mt-8 scroll-mt-24 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby={SECTION_IDS.checklist}>
      <div className="max-w-3xl">
        <h2 id={SECTION_IDS.checklist} className="text-xl font-semibold tracking-tight text-slate-950">
          GDPR/ePrivacy evidence checklist
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Browse the public reference for each current GDPR/ePrivacy checklist row. These rows explain retained evidence,
          missing source signals, coverage limitations, and reviewer context used by the scan report.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {groups.map((group) => (
          <a
            key={group.category}
            href={`#${getChecklistCategoryAnchorId(group.category)}`}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
          >
            {group.category}
          </a>
        ))}
      </div>
      <div className="mt-6 space-y-5">
        {groups.map((group) => (
          <section
            key={group.category}
            id={getChecklistCategoryAnchorId(group.category)}
            className="scroll-mt-24"
          >
            <h3 className="text-base font-semibold text-slate-950">{group.category}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {group.rows.map((groupRow) => {
                const row = rowsById.get(groupRow.id) ?? groupRow;
                return (
                  <Link
                    key={row.id}
                    href={row.path}
                    className="group block border border-slate-200 bg-slate-50 p-4 hover:border-sky-200 hover:bg-sky-50"
                  >
                    <span className="block text-sm font-semibold leading-5 text-sky-700 group-hover:text-sky-800">
                      {row.label}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] leading-5 text-slate-500">{row.id}</span>
                    <span className="mt-2 block text-sm leading-6 text-slate-600">{row.explanation}</span>
                    <span className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
                      Default signal: {row.defaultStatus}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function RelatedChecklistRowsSection({
  activeFinding,
  rows
}: {
  activeFinding: FindingReferenceItem;
  rows: GdprEprivacyChecklistReferenceItem[];
}) {
  const relatedRows = rows.filter((row) => row.findingIds.includes(activeFinding.id));

  if (relatedRows.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="related-checklist-rows">
      <div className="max-w-3xl">
        <h2 id="related-checklist-rows" className="text-xl font-semibold tracking-tight text-slate-950">
          Related GDPR/ePrivacy checklist rows
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This direct finding can support the following checklist rows when retained evidence passes the report’s coverage rules.
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {relatedRows.map((row) => (
          <Link
            key={row.id}
            href={row.path}
            className="group block border border-slate-200 bg-slate-50 p-4 hover:border-sky-200 hover:bg-sky-50"
          >
            <span className="block text-sm font-semibold leading-5 text-sky-700 group-hover:text-sky-800">
              {row.label}
            </span>
            <span className="mt-1 block font-mono text-[11px] leading-5 text-slate-500">{row.regulatoryGapFindingId}</span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">{row.explanation}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FindingsReferencePage({ activeFinding }: FindingsReferencePageProps) {
  const findings = getFindingReferenceItems();
  const checklistRows = getGdprEprivacyChecklistReferenceItems();
  const certscoreGptUrl = getCertScoreGptUrl();
  const initialFindingId = activeFinding?.id ?? DEFAULT_FINDING_ID;
  const { pageDescription, pagePath, pageTitle } = getFindingReferencePageCopy(activeFinding);
  const headingTitle = activeFinding?.title ?? "CertScore findings and evidence checklist reference";
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
              CertScore findings and checklist rows are automated public-web observations for review. They are not legal conclusions, certifications, compliance determinations, or proof of non-compliance.
            </p>
            <p className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              Use this page to see what a CertScore scan checks. Confirm jurisdiction, user journey, consent state,
              coverage limitations, and business context before relying on any automated observation.
            </p>
          </div>
        )}
      </div>

      {!activeFinding ? (
        <>
          <FindingsTableOfContents checklistRows={checklistRows} />
          <GdprEprivacyChecklistDirectory rows={checklistRows} />
          <DirectFindingReferencesSection findings={findings} />
          <ChecklistStatusLegend />
          <ReferenceGuideSection checklistRowCount={checklistRows.length} directFindingCount={findings.length} />
        </>
      ) : null}

      {activeFinding ? (
        <div className="mt-10">
          <FindingAtlasBrowser findings={findings} initialFindingId={initialFindingId} />
        </div>
      ) : null}

      {activeFinding ? <RelatedChecklistRowsSection activeFinding={activeFinding} rows={checklistRows} /> : null}
      {activeFinding ? <RelatedFindingsSection activeFinding={activeFinding} findings={findings} /> : null}

      <section className="mt-8 scroll-mt-24 border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby={SECTION_IDS.referenceNotes}>
        <h2 id={SECTION_IDS.referenceNotes} className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Reference notes</h2>
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
        <section id={SECTION_IDS.relatedReading} className="mt-8 scroll-mt-24 space-y-4 border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Related reading</h2>
          <p>
            CertScore's finding references are reviewed periodically and updated when material regulatory or accessibility guidance changes.
            Guidance families monitored include EDPB consent and ePrivacy materials, ICO cookie guidance, CNIL tracker recommendations, FTC
            privacy and dark-pattern materials, and accessibility guidance where applicable.
          </p>
          <div className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-slate-700">
            <p>Want to test these findings on a public website? Use the CertScore GPT to scan a public website from ChatGPT.</p>
            <p className="mt-1 text-slate-600">
              Results are automated public-web observations for review, not legal advice or a compliance determination.
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
              Open CertScore GPT
            </a>
          </div>
        </section>
      ) : null}
    </section>
  );
}
