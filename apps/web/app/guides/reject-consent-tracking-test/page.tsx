import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../../lib/marketing/sample-report";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.rejectConsentTrackingTest;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "Reject consent tracking test | CertScore.ai"
  }
};

export default function RejectConsentTrackingTestGuidePage() {
  return (
    <AiVisibilityContent
      showEvidenceExamples={false}
      badge={guide.badge}
      intro={guide.intro}
      path={guide.path}
      relatedLinks={[
        { href: "/guides/consent-report-example", label: "Read the retained owned-fixture example" },
        { href: "/guides/test-global-privacy-control", label: "Test GPC in a separate passive session" },
        { href: "/resources/consent-audit-worksheet.md", label: "Download the consent audit worksheet (Markdown)" },
        { href: AUTHENTIC_SAMPLE_REPORT_URL, label: "Explore the sample report" },
        { href: "/guides/consent-enforcement-testing", label: "how Accept and Reject Path confirmation works" },
        { href: "/findings/reject_tracking_persists_after_reject", label: "reject tracking persists finding" },
        { href: "/findings/pre_consent_tracking_detected", label: "tracking started before consent finding" },
        { href: "/guides/website-consent-audit-checklist", label: "website consent audit checklist" },
        { href: "/guides/detect-tracking-before-consent", label: "detect tracking before consent" },
        { href: "/guides/check-third-party-cookies-before-consent", label: "third-party cookies before consent" }
      ]}
      evidence={<section className="rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="text-xl font-semibold text-slate-950">Read the request timeline</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">Illustrative sequence, not a scan result. Use retained event times and document identity to place each observation; no example timing below is a measured duration.</p>
        <ol className="mt-5 space-y-4 border-l-2 border-sky-200 pl-5 text-sm leading-7 text-slate-700">
          <li><strong>Before the click:</strong> record baseline requests and writes. A request already in flight belongs to this period even if its response arrives later.</li>
          <li><strong>At the Reject click:</strong> retain action completion. A banner disappearing does not independently confirm refusal.</li>
          <li><strong>After the click, decision unverified:</strong> retain directly observed activity as after-click facts. Only qualifying verified tracking evidence can support the separate Reject-click review signal.</li>
          <li><strong>After confirmed refusal:</strong> compare newly initiated eligible requests or writes against the refusal anchor. An unchanged cookie alone is not evidence of active use.</li>
          <li><strong>At the end of observation:</strong> state whether capture completed and list limitations. An interrupted test is not a clean pass.</li>
        </ol>
      </section>}
      schema={buildArticleSchema(guide)}
      sections={guide.sections}
      title={guide.title}
    />
  );
}
