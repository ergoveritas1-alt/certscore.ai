import type { Metadata } from "next";
import { absoluteUrl, createPageMetadata, SITE_NAME, SITE_URL } from "./seo";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "./marketing/sample-report";

export type ReleaseLink = {
  href: string;
  label: string;
};

export type ReleaseSection = {
  bullets?: readonly string[];
  heading: string;
  id: string;
  paragraphs?: readonly string[];
  sourceLinks?: readonly ReleaseLink[];
  steps?: readonly string[];
};

export type ProductRelease = {
  body: readonly string[];
  cardImage?: {
    alt: string;
    height: number;
    path: string;
    width: number;
  };
  category: string;
  ctaDescription: string;
  ctaHeading: string;
  headline: string;
  metaDescription: string;
  modifiedDate?: string;
  primaryCta: ReleaseLink;
  publicationDate: string;
  resourceLinks?: readonly ReleaseLink[];
  sections: readonly ReleaseSection[];
  seoTitle: string;
  shortDescription: string;
  slug: string;
  socialImage: {
    alt: string;
    height: number;
    path: string;
    width: number;
  };
};

const releases: readonly ProductRelease[] = [
  {
    slug: "accept-and-reject-path-testing",
    headline: "CertScore.ai now tests what happens after a visitor accepts or refuses",
    shortDescription: "Evidence-based cookie consent testing: on eligible sites, CertScore.ai compares website behavior before a choice, after a confirmed Accept, and after a confirmed Reject.",
    publicationDate: "2026-09-03",
    category: "Scanner capability",
    ctaHeading: "See choice-path evidence in a real report",
    ctaDescription: "Run a scan, review the method, or inspect an authentic report from our owned deterministic sample page.",
    seoTitle: "Cookie consent testing after Accept and Reject",
    metaDescription: "CertScore.ai tests a site after confirmed Accept or Reject—cookies, storage, trackers, and network activity. Evidence for GDPR and ePrivacy consent review.",
    body: [
      "A cookie banner shows a visitor a choice. Whether that choice changes anything is decided somewhere else—in the tags that fire afterward, the cookies and storage that get written, and the consent state the site keeps.",
      "CertScore.ai now observes that directly. Where a site presents an eligible consent control that can be actioned safely, Reject and Accept Path observers each perform one bounded, deterministic interaction in a clean browser session and retain the activity that follows.",
      "Reports show which activity is consent-dependent, whether qualifying non-essential activity followed a confirmed refusal-state transition, and whether retained consent state contradicts the choice. Unavailable, unsupported, unsuccessful, stale, or unverifiable observations remain explicit and score-neutral; they are never presented as clean results."
    ],
    sections: [
      {
        id: "whats-new",
        heading: "What’s new",
        bullets: [
          "Confirmed refusal, not just a click: a Reject Path finding requires a verified refusal-state transition plus qualifying retained activity afterward.",
          "Separate sessions: Accept and Reject cannot contaminate one another and are each compared with the pre-consent baseline.",
          "Accept is a score-neutral comparison baseline; ordinary activity after acceptance is expected and does not create a negative finding.",
          "Unavailable, unsupported, unsuccessful, stale, timed-out, and unverifiable outcomes remain explicit, score-neutral coverage limitations.",
          "Typed results are available through API v2, Pulse, the TypeScript SDK, and hosted, local, and Light MCP."
        ]
      },
      {
        id: "how-it-works",
        heading: "How it works",
        paragraphs: [
          "Each path runs in a fresh browser session. CertScore.ai locates the first-layer consent surface and performs one bounded Accept, Reject, or necessary-only-equivalent interaction only when the control can be identified and actioned safely.",
          "On the Reject Path, observation is anchored to a confirmed refusal-state transition. Activity already in flight at confirmation is excluded, and the bounded observer may stop deliberately after retaining qualifying evidence. A completed clean observation is distinct from a path that could not be observed."
        ]
      },
      {
        id: "evidence-and-coverage",
        heading: "Evidence and coverage",
        paragraphs: [
          "These are automated observations from one tested region, session, and point in time. A clean Reject observation means no qualifying activity was retained during that completed window; it does not prove that a site always honors refusal. Unchanged stored values alone are review signals, not proof of active use. Limited coverage is not a pass.",
          "CertScore.ai is not a legal certification or compliance-determination product and does not establish compliance, noncompliance, illegality, or a legal violation."
        ]
      },
      {
        id: "regulatory-relevance",
        heading: "Why this matters for privacy review",
        paragraphs: [
          "A cookie banner’s appearance does not establish what a website actually does after someone makes a choice. On eligible sites, CertScore.ai tests the resulting browser behavior—cookies, storage, trackers, and relevant network activity—after a confirmed Accept and after a confirmed Reject.",
          "For GDPR and ePrivacy review, this evidence can help teams investigate whether consent-dependent activity reflects the visitor’s choice and whether non-essential storage or access continues after a confirmed refusal. The ePrivacy Directive specifically addresses storing information on, or gaining access to information stored in, a user’s terminal equipment, subject to limited exceptions; GDPR requirements govern consent and its withdrawal. The two ask different questions of the same evidence.",
          "For CCPA and CPRA review, the evidence may be relevant where the tested control governs the sale or sharing of personal information, including sharing for cross-context behavioral advertising. An ordinary cookie-banner Reject action is not automatically a statutory CCPA/CPRA opt-out, so CertScore.ai reports the observed behavior without making that legal conclusion. This relevance depends on the specific mechanism observed, not on the presence of a Reject control.",
          "Where a choice cannot be confirmed, the report records limited coverage rather than a result."
        ],
        sourceLinks: [
          { href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679", label: "GDPR (Regulation 2016/679)" },
          { href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02002L0058-20091219", label: "Consolidated ePrivacy Directive" },
          { href: "https://oag.ca.gov/privacy/ccpa", label: "California Attorney General CCPA guidance" }
        ]
      },
      {
        id: "developer-availability",
        heading: "Developer availability",
        paragraphs: [
          "Typed choice-path results are available on API v2 scan resources and Pulse projections as postAcceptObservation, postRefusalObservation, and gpcResponse. Install @certscore/sdk@0.2.10 or newer. Hosted MCP, local MCP, and MCP Light are at 0.2.18. Read the verdict rather than reconstructing an outcome from evidence rows, and treat non-confirmed statuses as limited coverage rather than a pass."
        ]
      }
    ],
    primaryCta: { href: "/", label: "Run a free scan" },
    resourceLinks: [
      { href: AUTHENTIC_SAMPLE_REPORT_URL, label: "See the completed choice-path example" },
      { href: "/guides/consent-enforcement-testing", label: "Learn how choice-path testing works" },
      { href: "/developers/reference", label: "Read the typed result contract" },
      { href: "/findings/reject_tracking_persists_after_reject", label: "Review the Reject Path finding method" }
    ],
    socialImage: {
      alt: "CertScore.ai choice-path report showing consent observations",
      height: 1190,
      path: "/marketing/hero/scan-report-dashboard-with-privacy-details.jpg",
      width: 1438
    },
    cardImage: {
      alt: "CertScore.ai choice-path report showing consent observations",
      height: 1190,
      path: "/marketing/hero/scan-report-dashboard-with-privacy-details.jpg",
      width: 1438
    }
  },
  {
    slug: "mcp-light",
    headline: "CertScore.ai MCP Light is now available",
    shortDescription:
      "CertScore.ai website privacy scanning is now available directly to AI agents — with no account, API key, or OAuth required.",
    publicationDate: "2026-08-26",
    category: "Developer tools",
    ctaHeading: "Start with MCP Light",
    ctaDescription:
      "Connect the public endpoint, review the three-tool workflow, and run a low-volume public website scan.",
    seoTitle: "MCP Light is now available for AI agents",
    metaDescription:
      "CertScore.ai MCP Light gives MCP-capable agents a simple, no-account interface for evidence-backed public website privacy scans.",
    body: [
      "MCP Light is a deliberately simple public MCP interface for low-volume website privacy scanning. It makes CertScore.ai’s evidence-backed public website observations available inside agent workflows without requiring credential setup.",
      "The launch keeps the workflow focused: start or reuse a scan, check its status when work is still active, then retrieve a bounded result bundle with findings, evidence references, limitations, and the full CertScore.ai report URL where available."
    ],
    sections: [
      {
        id: "whats-new",
        heading: "What’s new",
        bullets: [
          "No account, API key, or OAuth is required.",
          "A public Streamable HTTP MCP endpoint works with MCP-capable agents and clients.",
          "Three focused tools cover scan creation, active-status checks, and result retrieval.",
          "Eligible recent scans can be reused instead of starting unnecessary new work.",
          "Results link back to the full CertScore.ai report when a report is available."
        ]
      },
      {
        id: "why-it-matters",
        heading: "Why it matters",
        paragraphs: [
          "Agents can bring public website privacy observations into a review workflow without asking a user to create credentials first. That makes MCP Light useful for evaluation, discovery, and occasional evidence gathering.",
          "The output remains grounded in CertScore.ai’s existing product posture: automated observations for human and agentic review, not legal advice, certification, or a compliance determination."
        ]
      },
      {
        id: "how-it-works",
        heading: "How it works",
        steps: [
          "Call certscore_scan_site with a public HTTP or HTTPS URL.",
          "If the scan is still active and a scanId was returned, call certscore_get_scan_status with that scanId.",
          "After a terminal result, call certscore_get_scan_bundle for the canonical bounded result."
        ],
        paragraphs: [
          "Depending on the retained evidence, observations can include cookies and browser storage, trackers and vendors, consent or CMP behavior, privacy-policy surfaces, and related public website signals. Coverage limitations travel with the result and should be reviewed with the evidence."
        ]
      }
    ],
    primaryCta: {
      href: "/mcp/light",
      label: "Try MCP Light"
    },
    resourceLinks: [
      { href: "/developers/mcp", label: "Read the MCP developer documentation" },
      { href: "/releases", label: "Browse all releases" }
    ],
    socialImage: {
      alt: "CertScore.ai MCP Light — website privacy scanning for AI agents",
      height: 630,
      path: "/images/releases/mcp-light-social-card.png",
      width: 1200
    },
    cardImage: {
      alt: "CertScore.ai MCP Light — website privacy scanning for AI agents",
      height: 630,
      path: "/images/releases/mcp-light-social-card.png",
      width: 1200
    }
  }
] as const;

export function getPublishedReleases() {
  return [...releases].sort((left, right) => right.publicationDate.localeCompare(left.publicationDate));
}

export function getPublishedRelease(slug: string) {
  return getPublishedReleases().find((release) => release.slug === slug) ?? null;
}

export function releasePath(release: Pick<ProductRelease, "slug">) {
  return `/releases/${release.slug}`;
}

export function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function createReleaseMetadata(release: ProductRelease): Metadata {
  const path = releasePath(release);
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(release.socialImage.path);
  const base = createPageMetadata({
    description: release.metaDescription,
    path,
    socialImage: release.socialImage,
    title: release.seoTitle
  });

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: release.publicationDate,
      ...(release.modifiedDate ? { modifiedTime: release.modifiedDate } : {}),
      url,
      images: [
        {
          alt: release.socialImage.alt,
          height: release.socialImage.height,
          url: imageUrl,
          width: release.socialImage.width
        }
      ]
    },
    twitter: {
      ...base.twitter,
      images: [imageUrl]
    }
  };
}

export function createReleaseArticleSchema(release: ProductRelease) {
  const url = absoluteUrl(releasePath(release));

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: release.headline,
    description: release.shortDescription,
    datePublished: release.publicationDate,
    ...(release.modifiedDate ? { dateModified: release.modifiedDate } : {}),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url
    },
    url,
    image: absoluteUrl(release.socialImage.path),
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/certscore-header-logo.png")
      }
    }
  };
}
