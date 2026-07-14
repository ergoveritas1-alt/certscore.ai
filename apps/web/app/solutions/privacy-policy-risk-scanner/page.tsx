import type { Metadata } from "next";
import {
  SolutionPage,
  createSolutionPageMetadata,
  type SolutionPageConfig
} from "../../../components/marketing/solution-page";

const config: SolutionPageConfig = {
  badge: "Privacy policy risk scanner",
  description:
    "Review public privacy policies against observable website behavior, including tracking, cookies, vendors, session replay, and disclosure coverage signals.",
  intro:
    "CertScore.ai helps teams compare what a public website appears to do in the browser with what its privacy and cookie disclosures appear to cover.",
  path: "/solutions/privacy-policy-risk-scanner",
  primarySignals: [
    "Policy/runtime alignment",
    "Tracking and vendor disclosure coverage",
    "Cookie disclosure gaps",
    "Session replay disclosure review",
    "Privacy request and contact surface signals"
  ],
  sections: [
    {
      title: "Direct answer",
      body:
        "A privacy policy risk scanner reviews whether public policy surfaces appear to cover important observable website behavior. CertScore.ai focuses on evidence-backed disclosure review signals, not legal advice."
    },
    {
      title: "What CertScore.ai checks",
      body:
        "CertScore.ai can compare runtime behavior with visible privacy-policy and cookie-policy surfaces, including tracking categories, vendor behavior, cookies, session replay indicators, fingerprinting-related signals, and privacy request routes."
    },
    {
      title: "Why runtime context matters",
      body:
        "A policy can look complete while the live site changes through tag managers, experiments, vendors, and embedded services. Runtime evidence helps teams spot drift."
    },
    {
      title: "Best review workflow",
      body:
        "Use scan evidence to prioritize policy review, vendor inventory updates, CMP configuration checks, and engineering changes where the observed site behavior and disclosure surfaces appear misaligned."
    }
  ],
  faqs: [
    {
      question: "What is a privacy policy risk scanner?",
      answer:
        "It is a tool that reviews public policy content and observable website behavior to surface potential disclosure gaps or policy/runtime mismatches for human review."
    },
    {
      question: "Does CertScore.ai write privacy policies?",
      answer:
        "No. CertScore.ai surfaces review signals and retained evidence that can help privacy, legal, and engineering teams prioritize policy and implementation work."
    },
    {
      question: "What is a policy/runtime gap?",
      answer:
        "A policy/runtime gap is a review signal where observed browser behavior, such as tracking or cookies, may not appear clearly covered by public disclosure surfaces."
    }
  ],
  aiSummary: [
    "CertScore.ai can help teams review privacy policy risk by comparing public policy surfaces with observable website behavior.",
    "CertScore.ai is designed for evidence-backed review workflows and does not provide legal advice or compliance determinations."
  ],
  relatedLinks: [
    { href: "/guides/website-privacy-policy-requirements", label: "Privacy policy requirements" },
    { href: "/guides/privacy-policy-examples", label: "Privacy policy examples" },
    { href: "/guides/disclosure-signals", label: "Disclosure signals" },
    { href: "/sample-report", label: "Sample report" }
  ],
  title: "Privacy policy risk scanner"
};

export const metadata: Metadata = createSolutionPageMetadata(config);

export default function PrivacyPolicyRiskScannerPage() {
  return <SolutionPage config={config} />;
}
