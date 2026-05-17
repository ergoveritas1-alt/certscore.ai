import type { Metadata } from "next";

export const SITE_URL = "https://certscore.ai";
export const SITE_NAME = "CertScore.ai";

type CreatePageMetadataInput = {
  title: string;
  description: string;
  path: string;
  robots?: Metadata["robots"];
};

export function createPageMetadata({ title, description, path, robots }: CreatePageMetadataInput): Metadata {
  const url = new URL(path, SITE_URL).toString();

  return {
    title,
    description,
    robots,
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

type ItemListSchemaItem = {
  description?: string;
  identifier?: string;
  name: string;
  path: string;
};

type DefinedTermSchemaInput = {
  category?: string;
  description: string;
  inDefinedTermSetPath: string;
  name: string;
  path: string;
  termCode: string;
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

export function createItemListSchema({
  description,
  items,
  name,
  path
}: {
  description?: string;
  items: ItemListSchemaItem[];
  name: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    url: absoluteUrl(path),
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(item.path),
      name: item.name,
      ...(item.identifier ? { identifier: item.identifier } : {}),
      ...(item.description ? { description: item.description } : {})
    }))
  };
}

export function createDefinedTermSchema({
  category,
  description,
  inDefinedTermSetPath,
  name,
  path,
  termCode
}: DefinedTermSchemaInput) {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name,
    termCode,
    description,
    url: absoluteUrl(path),
    inDefinedTermSet: absoluteUrl(inDefinedTermSetPath),
    ...(category ? { additionalType: category } : {})
  };
}

export function createDefinedTermSetSchema({
  description,
  terms,
  title,
  path
}: {
  description: string;
  terms: DefinedTermSchemaInput[];
  title: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: title,
    description,
    url: absoluteUrl(path),
    hasDefinedTerm: terms.map(({ category, description: termDescription, name, path: termPath, termCode }) => ({
      "@type": "DefinedTerm",
      name,
      termCode,
      description: termDescription,
      url: absoluteUrl(termPath),
      ...(category ? { additionalType: category } : {})
    }))
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
      "Automated homepage-oriented observation of public website behavior. Results are risk signals for review, not legal advice or legal determinations."
  };
}
