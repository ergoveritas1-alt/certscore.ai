import type { Metadata } from "next";

export const SITE_URL = "https://certscore.ai";
export const SITE_NAME = "CertScore.ai";

type CreatePageMetadataInput = {
  title: string;
  description: string;
  path: string;
};

export function createPageMetadata({ title, description, path }: CreatePageMetadataInput): Metadata {
  const url = new URL(path, SITE_URL).toString();

  return {
    title,
    description,
    alternates: {
      canonical: url
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}

type BreadcrumbItem = {
  name: string;
  path: string;
};

type PublicArticleSchemaInput = {
  title: string;
  description: string;
  path: string;
  type?: "Article" | "TechArticle";
  about?: string[];
};

export function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

export function createBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path)
    }))
  };
}

export function createPublicArticleSchema({
  about = ["website scanning", "tracking", "cookies", "consent", "accessibility", "privacy review"],
  description,
  path,
  title,
  type = "Article"
}: PublicArticleSchemaInput) {
  return {
    "@context": "https://schema.org",
    "@type": type,
    headline: title,
    name: title,
    description,
    url: absoluteUrl(path),
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL
    },
    about
  };
}

export function createPublicWebPageSchema({
  description,
  path,
  title
}: Pick<PublicArticleSchemaInput, "description" | "path" | "title">) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: absoluteUrl(path)
  };
}

export function createBenchmarkDatasetSchema({
  description,
  path,
  title
}: Pick<PublicArticleSchemaInput, "description" | "path" | "title">) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: title,
    description,
    url: absoluteUrl(path),
    creator: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL
    },
    measurementTechnique:
      "Automated homepage-oriented observation of public website behavior. Results are risk signals for review, not legal advice, certification, or compliance determinations."
  };
}
