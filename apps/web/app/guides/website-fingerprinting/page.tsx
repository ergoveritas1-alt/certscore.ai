import type { Metadata } from "next";
import { GuideTemplate } from "../../../components/marketing/guide-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Website Fingerprinting Signals Guide",
  description:
    "Learn how CertScore.ai surfaces fingerprinting-related and device-signal evidence from observable public website behavior.",
  path: "/guides/website-fingerprinting"
});

export default function WebsiteFingerprintingPage() {
  return (
    <GuideTemplate
      eyebrow="Privacy guide"
      title="Website Fingerprinting Signals"
      intro="Website fingerprinting signals are observable behaviors that may help identify a browser or device through script, request, or vendor patterns. CertScore.ai treats these as review signals, not proof of a specific downstream use."
      pagePath="/guides/website-fingerprinting"
      questionTitle="What are website fingerprinting signals?"
      whyItMatters={[
        "Fingerprinting-related behavior can be harder for teams to see than ordinary cookies because it may involve scripts, browser APIs, or device-signal vendors.",
        "Teams should review whether these behaviors are expected, disclosed, and controlled consistently with their consent and vendor-management approach.",
        "A structured scan helps separate an observable runtime cue from speculation about downstream identity use."
      ]}
      commonIssues={[
        "Device-signal or fraud scripts are added without clear ownership or review.",
        "Fingerprinting-related vendors appear on pages where teams expected only basic analytics.",
        "Policy or consent language does not clearly explain high-entropy device or browser signals."
      ]}
      examples={[
        "A page may load a script associated with device intelligence or bot detection before a recorded consent choice.",
        "A runtime capture may show browser API signals such as canvas, WebGL, or device capability reads that deserve review.",
        "A vendor may be legitimate for fraud prevention while still requiring internal documentation and disclosure review."
      ]}
      automatedScanningHelp={[
        "Automated scanning can identify known vendor patterns, suspicious script hosts, and selected runtime indicators.",
        "It can connect those indicators to consent timing, policy text, and other privacy findings from the same scan.",
        "The result is a triage view that helps teams decide whether a deeper vendor or engineering review is needed."
      ]}
      certScoreHelp={[
        "CertScore.ai surfaces fingerprinting-related findings as evidence-backed review cues.",
        "It keeps the output focused on what was observed: script hosts, vendor names, device-signal categories, and supporting snippets.",
        "Teams can use repeat scans to confirm whether vendor or tag-manager changes reduce the observed signal."
      ]}
      certScoreFlagExample="The scan could flag a fingerprinting-related vendor script, a device-signal endpoint, or browser API activity that appears during the page-load window."
      relatedGuides={[
        { href: "/guides/privacy-scanner-vs-cookie-scanner", label: "Privacy scanner vs cookie scanner" },
        { href: "/guides/rtb-cookie-syncing", label: "RTB cookie syncing" },
        { href: "/guides/website-privacy-policy-requirements", label: "Privacy policy requirements" }
      ]}
    />
  );
}
