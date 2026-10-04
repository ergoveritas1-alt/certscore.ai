import type { Metadata } from "next";
import { createPageMetadata } from "../../lib/seo";
import { FindingsReferencePage } from "./findings-reference-page";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "CertScore.ai findings reference",
    description:
      "Explore CertScore.ai website findings for cookies, tracking, consent and privacy. Understand supporting evidence, review steps and what each signal means.",
    path: "/findings"
  }),
  title: {
    absolute: "CertScore.ai findings reference | CertScore.ai"
  }
};

export default function FindingsGuidePage() {
  return <FindingsReferencePage />;
}
