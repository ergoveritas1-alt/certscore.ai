import type { Metadata } from "next";
import { createPageMetadata } from "../../lib/seo";
import { FindingsReferencePage } from "./findings-reference-page";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "CertScore findings and evidence checklist reference",
    description:
      "Review CertScore direct findings, GDPR/ePrivacy evidence checklist rows, regulatory gap top findings, retained evidence, and source-signal limitations.",
    path: "/findings"
  }),
  title: {
    absolute: "CertScore findings and evidence checklist reference | CertScore.ai"
  }
};

export default function FindingsGuidePage() {
  return <FindingsReferencePage />;
}
