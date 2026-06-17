"use client";

import { GdprEprivacyCoverageChecklistCard } from "../../../../components/scans/gdpr-eprivacy-coverage-checklist-card";
import { RegulatoryChecklistSection } from "../../../../components/scans/regulatory-checklist-section";
import type { CaliforniaPrivacyCoverageChecklistItem } from "../../../../lib/scans/california-privacy-coverage-checklist";
import type { GdprEprivacyCoverageChecklistItem } from "../../../../lib/scans/gdpr-eprivacy-coverage-checklist";

type V2RegulatoryReviewBetaProps = {
  californiaPrivacyItems: CaliforniaPrivacyCoverageChecklistItem[];
  gdprEprivacyItems: GdprEprivacyCoverageChecklistItem[];
};

export function V2RegulatoryReviewBeta({
  gdprEprivacyItems,
}: V2RegulatoryReviewBetaProps) {
  return (
    <section className="scroll-mt-6" id="regulatory-review-beta" data-testid="v2-regulatory-review-beta">
      <RegulatoryChecklistSection
        headingLabel="Regulatory Diagnostics"
        showAdvancedEvidenceToggle
        tabs={[
          {
            content: (
              <GdprEprivacyCoverageChecklistCard
                defaultOpen
                items={gdprEprivacyItems}
                showDebugConfidenceImprovements={false}
                showSummaryStrip={false}
              />
            ),
            id: "gdpr-eprivacy",
            label: "GDPR / ePrivacy",
            shortLabel: "GDPR/ePrivacy",
          },
        ]}
      />
    </section>
  );
}
