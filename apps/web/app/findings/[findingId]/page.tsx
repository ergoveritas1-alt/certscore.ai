import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFindingReferenceItems } from "../../../lib/marketing/finding-atlas";
import { createPageMetadata } from "../../../lib/seo";
import {
  FindingsReferencePage,
  getFindingReferencePageCopy,
  getFindingReferencePath
} from "../findings-reference-page";

type FindingDetailPageProps = {
  params: Promise<{
    findingId: string;
  }>;
};

export function generateStaticParams() {
  return getFindingReferenceItems().map((finding) => ({
    findingId: finding.id
  }));
}

export async function generateMetadata({ params }: FindingDetailPageProps): Promise<Metadata> {
  const { findingId } = await params;
  const finding = getFindingReferenceItems().find((item) => item.id === findingId);

  if (!finding) {
    return createPageMetadata({
      title: "Finding reference not found",
      description: "The requested CertScore finding reference could not be found.",
      path: getFindingReferencePath(findingId),
      robots: {
        index: false,
        follow: false
      }
    });
  }

  const { pageDescription, pagePath, pageTitle } = getFindingReferencePageCopy(finding);

  return {
    ...createPageMetadata({
      title: pageTitle,
      description: pageDescription,
      path: pagePath
    }),
    title: {
      absolute: `${pageTitle} | CertScore.ai`
    }
  };
}

export default async function FindingDetailPage({ params }: FindingDetailPageProps) {
  const { findingId } = await params;
  const finding = getFindingReferenceItems().find((item) => item.id === findingId);

  if (!finding) {
    notFound();
  }

  return <FindingsReferencePage activeFinding={finding} />;
}
