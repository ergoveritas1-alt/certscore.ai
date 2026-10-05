import { SITE_INTEGRITY_LIMITS, type SiteIntegrityObservation, type SiteIntegrityProjection } from "./site-integrity";

/** Synthetic retained-contract fixture. No production website evidence. */
export const siteIntegrityObservationFixture: SiteIntegrityObservation = {
  contractVersion: "certscore.site-integrity-observation.v1",
  sourceLane: "runtime_evidence", scope: "starting_page_main_document",
  documentUrl: "https://clinic.example/", documentToken: "document-fixture",
  capturedAt: "2026-09-17T07:22:45.000Z", inspectedLinks: 40, truncated: false,
  links: [
    { evidenceRef: "site_integrity:link:1", destinationDomain: "pharmacy.example", concealment: "zero_size_container" },
    { evidenceRef: "site_integrity:link:2", destinationDomain: "promotion.example", concealment: "offscreen_position" },
    { evidenceRef: "site_integrity:link:3", destinationDomain: "promotion.example", concealment: "zero_font_size" },
  ],
};

export const siteIntegrityProjectionFixture: SiteIntegrityProjection = {
  contractVersion: "certscore.site-integrity-projection.v1", scanId: "fixture", sourceHash: "a".repeat(64),
  observationHash: "b".repeat(64), verificationStatus: "verified",
  evidenceRef: "CanonicalEvidenceBundle.json#siteIntegrityObservation", observation: siteIntegrityObservationFixture,
};

/** Synthetic sanitized excerpt; historical observation fixtures intentionally omit it. */
export const siteIntegrityCodeProofFixture: import("./site-integrity").SiteIntegrityCodeProof = {
  contractVersion: "certscore.site-integrity-code-proof.v1", format: "sanitized_dom_excerpt", sanitized: true, truncated: false,
  lines: ['<section>', '  <div style="width:0px;height:0px;overflow:hidden">', '    <a href="https://pharmacy.example/[redacted]">[link text omitted]</a>', '  </div>', '</section>'],
  highlightedLine: 1,
  computedStyle: { position: "static", overflow: "hidden", fontSizePx: 16 },
  concealingRect: { left: 0, top: 100, right: 0, bottom: 100, width: 0, height: 0 },
  linkRect: { left: 0, top: 100, right: 120, bottom: 118, width: 120, height: 18 },
};

/** Full retained-link sample with code; never used to reconstruct historical proof. */
export const siteIntegrityCodeProofObservationFixture: SiteIntegrityObservation = {
  ...siteIntegrityObservationFixture,
  links: Array.from({ length: SITE_INTEGRITY_LIMITS.retainedLinks }, (_, index) => ({
    ...siteIntegrityObservationFixture.links[0]!,
    evidenceRef: `site_integrity:link:${index}`,
    codeProof: siteIntegrityCodeProofFixture,
  })),
};
