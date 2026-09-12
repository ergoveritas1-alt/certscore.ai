import type { ApiV2PreConsentRuntimePreview } from "@certscore/api-contracts";

/** Synthetic checkpoint for local UI and contract regressions; never scan evidence. */
export const runtimePreviewFixture: ApiV2PreConsentRuntimePreview = {
  type: "certscore_pre_consent_preview", resultStage: "preliminary", final: false,
  sourceLane: "runtime_evidence", generatedAt: "2026-09-06T00:00:06.000Z",
  runtimeCoverage: { status: "limited_partial", limitationKeys: ["six_second_passive_checkpoint"] },
  summary: { cookieCount: 0, trackerCount: 0, trackingVendorCount: 0, operationalVendorCount: 2, thirdPartyRequestCount: 4, vendorCount: 4 },
  cookies: [], trackers: [],
  operationalVendors: [
    { vendor: "BST DSGVO Cookie", product: "BST DSGVO Cookie notice plugin, non-TCF", purpose: "consent_management", confidence: 1, domains: ["fixture.test"] },
    { vendor: "Google", product: "Google Fonts", purpose: "infrastructure", confidence: 1, domains: ["fonts.googleapis.com"] },
  ],
  resources: [
    { kind: "request", vendor: "BST DSGVO Cookie", product: "BST DSGVO Cookie notice plugin, non-TCF", purpose: "Consent management", confidence: 1, domains: ["fixture.test"], party: "first_party", observedAtMs: 1000, requestCount: 6 },
    { kind: "request", vendor: "Google", product: "Google Fonts", purpose: "Font delivery", confidence: 1, domains: ["fonts.googleapis.com", "fonts.gstatic.com"], party: "third_party", observedAtMs: 1100, requestCount: 2 },
    { kind: "request", vendor: "Google", product: "Google Maps embed", purpose: "Embedded maps", confidence: 1, domains: ["google.com"], party: "third_party", observedAtMs: 1200, requestCount: 1 },
    { kind: "request", vendor: "Facebook", product: "Facebook Page Plugin", purpose: "Social media embed", confidence: 1, domains: ["facebook.com"], party: "third_party", observedAtMs: 1300, requestCount: 1 },
    { kind: "embed", vendor: "Google", product: "Google Maps embed", purpose: "Embedded maps", confidence: 1, domains: ["google.com"], party: "third_party", observedAtMs: 1400, requestCount: 0 },
    { kind: "embed", vendor: "Facebook", product: "Facebook Page Plugin", purpose: "Social media embed", confidence: 1, domains: ["facebook.com"], party: "third_party", observedAtMs: 1500, requestCount: 0 },
  ],
  truncated: { cookies: false, trackers: false, operationalVendors: false, resources: false },
  mustContinuePolling: true, observationOnlyDisclaimer: "Synthetic preliminary observations; not findings or final totals.",
};
