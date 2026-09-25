const evidenceUrl = { type: "string", format: "uri", maxLength: 800, description: "Retained HTTP(S) URL with credentials, query and fragment removed." } as const;
export const privacyAuditEvidenceOpenApi = {
  type: ["object", "null"], additionalProperties: false,
  description: "Verified starting-page privacy controls and retained notice passages. Observational only, without legal adequacy, control-absence, opt-out success or score conclusions. Null for older or insufficient-evidence reports.",
  required: ["contractVersion", "scanId", "documentUrl", "capturedAt", "sourceHash", "verificationStatus", "scoreEffect", "passagePolicy", "controls", "notices", "negativeControlCoverage", "collectionPointNoticeAssessment", "truncated"],
  properties: {
    contractVersion: { type: "string", const: "certscore.privacy-audit-evidence.v1" },
    scanId: { type: "string", minLength: 1 }, documentUrl: evidenceUrl, capturedAt: { type: "string", format: "date-time" },
    sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" }, verificationStatus: { type: "string", const: "verified" },
    scoreEffect: { type: "string", const: "none" }, passagePolicy: { type: "string", const: "california_notice_passages.v1" },
    controls: { type: "array", maxItems: 12, items: {
      type: "object", additionalProperties: false,
      required: ["kind", "label", "sourceUrl", "destinationUrl", "placement", "evidenceRef", "retrieval", "interaction"],
      properties: {
        kind: { type: "string", enum: ["do_not_sell_or_share", "your_privacy_choices", "cookie_settings"] },
        label: { type: "string", maxLength: 200 }, sourceUrl: evidenceUrl, destinationUrl: { ...evidenceUrl, type: ["string", "null"] },
        placement: { type: "string", maxLength: 80 }, evidenceRef: { type: "string", minLength: 1, maxLength: 240 },
        retrieval: { type: "string", enum: ["not_attempted", "fetched", "failed", "skipped_budget"] }, interaction: { type: "string", const: "not_tested" },
      },
    } },
    notices: { type: "array", maxItems: 4, items: {
      type: "object", additionalProperties: false,
      required: ["kind", "url", "evidenceRef", "directlyLinkedFromScannedPage", "coverage", "passages"],
      properties: {
        kind: { type: "string", enum: ["privacy_policy", "california_notice", "notice_at_collection"] }, url: evidenceUrl,
        evidenceRef: { type: "string", minLength: 1, maxLength: 240 }, directlyLinkedFromScannedPage: { type: "boolean" }, coverage: { type: "string", enum: ["complete", "partial"] },
        passages: { type: "array", maxItems: 5, items: {
          type: "object", additionalProperties: false, required: ["topic", "excerpt"], properties: {
            topic: { type: "string", enum: ["sale_sharing", "collection_purposes", "retention", "privacy_rights", "opt_out_methods"] }, excerpt: { type: "string", minLength: 1, maxLength: 480 },
          },
        } },
      },
    } },
    negativeControlCoverage: { type: "string", const: "not_verified" }, collectionPointNoticeAssessment: { type: "string", const: "not_assessed" }, truncated: { type: "boolean" },
  },
} as const;
