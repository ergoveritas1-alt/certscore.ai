import type { Metadata } from "next";
import { createPageMetadata } from "../../lib/seo";
import { FindingsReferencePage } from "./findings-reference-page";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "CertScore.ai findings reference",
    description:
      "Review CertScore.ai findings, evidence, signals, and observations surfaced from public-web runtime scans.",
    path: "/findings"
  }),
  title: {
    absolute: "CertScore.ai findings reference | CertScore.ai"
  }
};

export default function FindingsGuidePage() {
  return <FindingsReferencePage />;
}
