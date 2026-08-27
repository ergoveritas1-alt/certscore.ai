import type { Metadata } from "next";
import { absoluteUrl, createPageMetadata, SITE_NAME, SITE_URL } from "./seo";

export type ReleaseLink = {
  href: string;
  label: string;
};

export type ReleaseSection = {
  bullets?: readonly string[];
  heading: string;
  id: string;
  paragraphs?: readonly string[];
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
      "The launch keeps the workflow focused: start or reuse a scan, check its status when work is still active, then retrieve a bounded result bundle with findings, evidence references, limitations, and the full CertScore report URL where available."
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
          "Results link back to the full CertScore report when a report is available."
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
