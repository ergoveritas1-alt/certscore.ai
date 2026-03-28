import type { Metadata } from "next";

export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://consentcheck.site";
export const SITE_NAME = "ConsentCheck";

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
