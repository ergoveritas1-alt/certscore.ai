import type { Metadata } from "next";
import { createPageMetadata } from "../../lib/seo";
import { FindingsReferencePage } from "./findings-reference-page";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "CertScore findings reference",
    description:
      "Review CertScore findings, evidence, signals, and observations surfaced from public-web runtime scans.",
    path: "/findings"
  }),
  title: {
    absolute: "CertScore findings reference | CertScore.ai"
  }
};

export default function FindingsGuidePage() {
  return <FindingsReferencePage />;
}
