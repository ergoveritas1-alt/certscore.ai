import { projectExecutiveRuntimeCards } from "../../../lib/scans/executive-runtime-cards";
import { inventoryLayoutFixture, type InventoryScenario } from "./inventory-fixture";
import { SHADOW_REPORT } from "../../../components/scans/report-lab/shadow-report-data";
import type { SitePriorityFinding } from "../../../lib/scans/full-site-priority-review";
import type { CollectionSurfaceTableRow } from "../../../components/scans/collection-surfaces-table";
import { siteIntegrityProjectionFixture, siteIntegrityCodeProofFixture } from "../../../../../packages/certscore-contracts/src/site-integrity.fixture";
import { buildUnifiedFindingDisplayPackets } from "../../../lib/scans/unified-findings";
import { selectSiteIntegrityFinding } from "../../../lib/scans/site-integrity-report";

// Development-only layout data. Never persisted or used as canonical scan evidence.
const homepage = { id: "preview-homepage", url: "https://www.pferdeklinik-roentorf.de/", homepage: true };
const fixtureForm: CollectionSurfaceTableRow = {
  id: "layout-form", capturePhase: "after_accept_click", capturedAt: "2026-09-17T07:22:36Z", snapshot: { status: "unavailable" },
  form: { formRef: "layout-contact", structure: "native_form", surfaceType: "contact", title: "Illustrative contact form", pageUrl: "https://example.test/contact", method: "post", actionRelationship: "same_site", candidateFieldCount: 5, retainedFieldCount: 5, fieldsTruncated: false, confidence: 1, directVsInferred: "direct", evidenceRefs: [],
    privacyDisclosure: { version: 1, truncated: false, excerpts: [{ text: "I have taken note of the privacy policy and agree that my personal data may be stored and processed for the purpose of handling my request.", association: "inside_form", links: [{ label: "Privacy policy (illustrative)", url: "https://example.test/privacy" }] }] },
    fields: ["Name", "Email", "Phone", "Subject", "Message"].map((label, index) => ({ fieldRef: `layout-field-${index}`, elementType: "input", inputType: "text", semanticCategory: "unknown", label, required: false, disabled: false, readOnly: false, confidence: 1, directVsInferred: "direct", evidenceRefs: [] })),
  },
};
// Illustrative multi-page embed coverage; never interpreted as a new scan.
const embedPages = [homepage, ...Array.from({ length: 9 }, (_, index) => ({
  id: `preview-page-${index + 2}`, url: `https://example.test/preview-page-${index + 2}`, homepage: false,
}))];
const priorities: SitePriorityFinding[] = [
  {
    id: "preview-refusal", rank: 1, title: "Decline consent control", status: "Potential gap",
    summary: "No first-layer refusal control was observed. The acknowledgment control does not establish that consent was registered.",
    correctionSteps: ["Provide a clear refusal choice and verify that relevant optional integrations respect the visitor’s choice."],
    evidence: ["Illustrative layout fixture; no new scan was run."], evidenceJson: { fixture: true }, pages: [homepage],
  },
  {
    id: "preview-integrations", rank: 2, title: "Third-party embeds before consent", status: "Potential gap",
    summary: "Third-party embedded content loaded before consent. Review its purpose and whether it should wait for the visitor’s choice.",
    correctionSteps: ["Check each integration’s purpose and ensure consent-dependent activity is gated on the corresponding choice."],
    evidence: ["Illustrative grouped issue; no tracking timestamp or product-specific attribution is inferred from inventory counts."],
    evidenceJson: { fixture: true }, pages: embedPages,
    observations: [{ id: "preview-embedded-content", title: "Third-party embedded content", summary: "Illustrative embed evidence across the scanned pages; no tracking request is established by this layout fixture.", pages: embedPages }],
  },
];

export function buildInventoryPreviewData(scenario: InventoryScenario) {
  const fixture = inventoryLayoutFixture(scenario, SHADOW_REPORT.scan.id);
  // Isolated synthetic contract, projected through the same concern/policy path.
  // Keep it outside the report snapshot, score, exports and real-site findings.
  const sampleIntegrityFinding = selectSiteIntegrityFinding(buildUnifiedFindingDisplayPackets({
    runtimeArtifacts: { siteIntegrity: {
      ...siteIntegrityProjectionFixture,
      observation: { ...siteIntegrityProjectionFixture.observation,
        documentUrl: "https://sample-site.example/",
        links: siteIntegrityProjectionFixture.observation.links.map((link, index) => ({
          ...link, destinationDomain: index === 0 ? "destination-one.example" : "destination-two.example",
          ...(index === 0 ? {codeProof: {...siteIntegrityCodeProofFixture, lines: siteIntegrityCodeProofFixture.lines.map(line => line.replace("pharmacy.example", "destination-one.example"))}} : {}),
        })),
      },
    } },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(),
  }));
  // Illustrative projected assessment states, separate from the inventory volume fixture.
  const executiveRuntimeCards = projectExecutiveRuntimeCards([
    { id: "pre_consent_cookies_storage", assessmentStatus: "checked", status: "Not observed" },
    { id: "pre_consent_third_party_tracking", assessmentStatus: "coverage_limitation", status: "Not confirmed" },
    ...["third_party_iframe_pre_consent", "embedded_content_pre_consent"].map(id => ({ id,
      assessmentStatus: (scenario === "empty" || scenario === "single") ? "checked" : "review_signal", status: (scenario === "empty" || scenario === "single") ? "Not observed" : "Review signal",
      retainedEvidence: (scenario === "empty" || scenario === "single") ? {} : { embeddedContentHosts: ["www.facebook.com"] },
    })),
  ]);
  const snapshot = {
    ...SHADOW_REPORT,
    inventorySummary: fixture.metrics,
    resourceInventory: fixture.inventory,
    executiveRuntimeCards,
    timeline: SHADOW_REPORT.timeline.map(event => event.label === "Third-party request" ? { ...event, detail: "Third-party request first observed", tone: "neutral" as const } : event),
    scan: { ...SHADOW_REPORT.scan, url: homepage.url, host: "www.pferdeklinik-roentorf.de", createdAt: "Sep 17, 2026, 7:22:36 AM UTC", origin: "California", originCode: "california", duration: "1m 35s", visualEvidenceHref: null },
    metrics: { ...SHADOW_REPORT.metrics, vendors: 3, domains: 3 },
    consentVendor: "BST DSGVO Cookie notice plugin, non-TCF",
    consentControlBehavior: "The observed control is a contextual acknowledgment. Its presence does not prove that consent was registered.",
    trackerVendors: ["BST DSGVO Cookie notice plugin, non-TCF", "Google Fonts", "Facebook"],
    acceptPath: null, rejectPath: null,
  };
  return { snapshot, fixture, priorities, fixtureForm, sampleIntegrityFinding };
}
