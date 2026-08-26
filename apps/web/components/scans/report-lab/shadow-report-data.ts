export const SHADOW_REPORT_SCAN_ID = "333757ef-ddc0-4d68-aef8-f220859706c9";

export const SHADOW_REPORT_SOURCE_URL =
  "https://certscore.ai/scan/333757ef-ddc0-4d68-aef8-f220859706c9";

export const SHADOW_PRIVACY_NOTICE_EVIDENCE = {
  capturedAt: "Aug 24, 2026, 10:08:25 PM PDT",
  documentTitle: "Datenschutz – Pferdeklinik-Roentorf.de",
  sourceUrl: "https://pferdeklinik-roentorf.de/datenschutz",
  sections: [
    {
      heading: "Datenschutzerklärung",
      excerpt:
        "Personenbezogene Daten (nachfolgend zumeist nur ‘Daten’ genannt) werden von uns nur im Rahmen der Erforderlichkeit sowie zum Zwecke der Bereitstellung eines funktionsfähigen und nutzerfreundlichen Internetauftritts, inklusive seiner Inhalte und der dort angebotenen Leistungen, verarbeitet."
    },
    {
      heading: "I. Informationen über uns als Verantwortliche",
      excerpt:
        "Verantwortlicher Anbieter dieses Internetauftritts im datenschutzrechtlichen Sinne ist: Pferdeklinik Röntorf Tierärztliche Klinik für Pferde, Dr. med. vet. Bernhard Zöttl, Röntorf 3, D – 32689 Kalletal."
    },
    {
      heading: "II. Rechte der Nutzer und Betroffenen",
      excerpt:
        "Mit Blick auf die nachfolgend noch näher beschriebene Datenverarbeitung haben die Nutzer und Betroffenen das Recht auf Bestätigung, Auskunft, Berichtigung, Löschung, Einschränkung und Datenübertragbarkeit sowie auf Beschwerde gegenüber der Aufsichtsbehörde."
    }
  ]
} as const;

export const SHADOW_REPORT_VARIANTS = [
  {
    id: "briefing",
    label: "Briefing",
    shortLabel: "01",
    description: "Verdict-first editorial hierarchy"
  },
  {
    id: "triage",
    label: "Triage",
    shortLabel: "02",
    description: "Compact action and ownership view"
  },
  {
    id: "timeline",
    label: "Timeline",
    shortLabel: "03",
    description: "Observed sequence as the lead story"
  },
  {
    id: "scorecard",
    label: "Scorecard",
    shortLabel: "04",
    description: "Balanced domain and coverage matrix"
  },
  {
    id: "minimal",
    label: "Minimal",
    shortLabel: "05",
    description: "Quiet progressive disclosure"
  }
] as const;

export type ShadowReportVariant = (typeof SHADOW_REPORT_VARIANTS)[number]["id"];

export function isShadowReportVariant(value: string): value is ShadowReportVariant {
  return SHADOW_REPORT_VARIANTS.some((variant) => variant.id === value);
}

export type ShadowFinding = {
  correctionSteps: string[];
  evidenceJson: Record<string, unknown>;
  id: string;
  rank: number;
  title: string;
  status: "Potential gap" | "Partial concern" | "Not confirmed" | "Observed";
  summary: string;
  focus: string;
  evidence: string[];
  vendors: string[];
};

export type ShadowEvidenceStatus = ShadowFinding["status"] | "Not observed" | "Context" | "Limited";

export type ShadowEvidenceRow = {
  canonicalEvidenceJson?: string;
  correctionSteps: string[];
  evidenceRefs?: string[];
  evidenceJson: Record<string, unknown>;
  id: string;
  policyEvidence?: {
    capturedAt: string;
    documentTitle: string;
    sourceUrl: string;
    sections: Array<{ excerpt: string; heading: string }>;
  };
  status: ShadowEvidenceStatus;
  summary: string;
  title: string;
};

export type ShadowReportData = {
  scan: {
    benchmark: string;
    createdAt: string;
    duration: string;
    host: string;
    id: string;
    observedWindow: string;
    origin: string;
    originCode: string;
    reportUrl?: string;
    url: string;
    visualEvidenceHref?: string | null;
  };
  score: { label: string; value: number };
  metrics: {
    domains: number;
    fields: number;
    forms: number;
    nonEssentialStorage: number | null;
    thirdPartyRequests: number;
    vendors: number;
  };
  controls: { accept: string; options: string; reject: string };
  consentVendor: string | null;
  coverage: {
    concern: number;
    contextual: number;
    limited: number;
    partial: number;
    positive: number;
    review: number;
    rows: number;
    usableEvidence: number;
  };
  verdict: string;
  executiveHeadline: string;
  nextStep: string;
  timeline: Array<{
    at: string;
    atMs: number;
    detail: string;
    label: string;
    tone: "concern" | "neutral" | "positive";
    vendor?: string;
  }>;
  findings: ShadowFinding[];
  relatedRows: Array<{ id: string; status: ShadowEvidenceStatus; summary: string; title: string }>;
  consentRows: ShadowEvidenceRow[];
  trackingExternalRows: ShadowEvidenceRow[];
  preConsentRuntimeRows: ShadowEvidenceRow[];
  gdprTransparencyRows: ShadowEvidenceRow[];
  transportRows: ShadowEvidenceRow[];
  trackerVendors: string[];
  inventory: Array<{
    category: string;
    confidence: string;
    controllingEntity: string;
    domains: string;
    evidence: string;
    evidenceJson?: Record<string, unknown>;
    entityRelationship: string;
    observed: string;
    priority: string;
    purpose: string;
    relationship: string;
    requestNames: string;
    serverLocation: string;
    transferMechanism: string;
    type: string;
    vendor: string;
    recordCount: number;
    requestCount: number | null;
  }>;
  collectionFields?: string[];
  collectionLimitations?: string[];
  collectionStatus?: string;
  collectionSurfaces?: Array<{
    actionHostname?: string;
    actionRelationship: string;
    confidence: string;
    fields: Array<{
      confidence: string;
      evidenceRefs: string[];
      inputType: string;
      label: string;
      required: boolean;
      semanticCategory: string;
      state: string;
    }>;
    fieldsTruncated: boolean;
    method: string;
    pageUrl: string;
    title: string;
  }>;
};

export const SHADOW_REPORT: ShadowReportData = {
  scan: {
    id: SHADOW_REPORT_SCAN_ID,
    url: "https://www.pferdeklinik-roentorf.de/kontakt-anfahrt/",
    host: "www.pferdeklinik-roentorf.de",
    createdAt: "Aug 24, 2026, 10:08:07 PM PDT",
    duration: "31 sec",
    observedWindow: "25.1 sec",
    origin: "Germany (EU)",
    originCode: "EU-DE",
    benchmark: "Veterinary",
    reportUrl: `/scan/${SHADOW_REPORT_SCAN_ID}`,
    visualEvidenceHref: "https://certscore.ai/api/scans/333757ef-ddc0-4d68-aef8-f220859706c9/visual-evidence/local_v2%3Ascreenshot_pre_consent_settled"
  },
  score: {
    value: 58,
    label: "Watch"
  },
  metrics: {
    thirdPartyRequests: 8,
    nonEssentialStorage: 0,
    vendors: 3,
    domains: 4,
    forms: 1,
    fields: 5
  },
  controls: {
    accept: "Observed",
    reject: "Not observed",
    options: "Not observed"
  },
  consentVendor: "BST DSGVO Cookie",
  coverage: {
    rows: 29,
    usableEvidence: 19,
    concern: 4,
    partial: 1,
    positive: 7,
    review: 0,
    contextual: 9,
    limited: 8
  },
  verdict:
    "Overall, this scan points to a focused review rather than a site-wide breakdown. The clearest issue is visitor choice: Accept was retained on the first layer, while Reject and Options were not. Tracking activity and embedded services also appeared before the first consent surface at 9.6s. Transport security checks were observed. Eight checklist items remain technically limited and should be verified manually.",
  executiveHeadline: "4 issues to review",
  nextStep:
    "Start with the first-layer refusal path, then review tag and embed gating before any recorded consent action.",
  timeline: [
    { at: "0s", atMs: 0, label: "Scan start", detail: "Public page observation began", tone: "neutral" },
    {
      at: "5.71s",
      atMs: 5710,
      label: "Third-party request",
      detail: "Tracking-classified activity first observed",
      tone: "concern"
    },
    {
      at: "5.71s",
      atMs: 5710,
      label: "Embedded content",
      detail: "Third-party embedded content first observed",
      tone: "concern"
    },
    {
      at: "6.61s",
      atMs: 6610,
      label: "Social/media embed",
      detail: "Meta/Facebook evidence first observed",
      tone: "concern"
    },
    {
      at: "9.6s",
      atMs: 9600,
      label: "Consent banner",
      detail: "Accept observed; Reject and Options not observed",
      tone: "positive"
    },
    { at: "25.1s", atMs: 25100, label: "Observation end", detail: "Retained scan window closed", tone: "neutral" }
  ],
  findings: [
    {
      id: "decline-consent-control",
      rank: 1,
      title: "Decline consent control",
      status: "Potential gap",
      summary:
        "The sufficiently retained first-layer consent surface did not show a reject, necessary-only, or equivalent refusal option.",
      focus: "Consent controls",
      vendors: ["BST DSGVO Cookie"],
      evidence: [
        "Accept control: Observed",
        "Reject control: Not observed",
        "Options control: Not observed",
        "First-layer presentation expectations can vary by jurisdiction; manual review is recommended."
      ],
      correctionSteps: [
        "Add a first-layer reject, necessary-only, or equivalent refusal action appropriate to the tested jurisdiction.",
        "Keep the refusal action available without requiring an Accept action first.",
        "Re-scan from the same region and verify the retained first-layer control inventory."
      ],
      evidenceJson: {
        findingId: "decline-consent-control",
        status: "potential_gap",
        controls: { accept: "observed", reject: "not_observed", options: "not_observed" },
        evidenceScope: "sufficiently_retained_first_layer"
      }
    },
    {
      id: "pre-consent-tracking",
      rank: 2,
      title: "Pre-consent non-essential tracking",
      status: "Potential gap",
      summary:
        "Tracking-classified third-party requests fired before any recorded consent action; first seen 5.71s after scan start.",
      focus: "Tag gating",
      vendors: ["Google"],
      evidence: [
        "First tracking-classified third-party request: 5.71s",
        "Consent banner first observed: 9.6s",
        "Third-party requests in the report summary: 8"
      ],
      correctionSteps: [
        "Review tracking-classified tags and their consent prerequisites.",
        "Gate non-essential requests until an applicable consent state is established.",
        "Re-scan and confirm the first classified request no longer precedes the consent surface."
      ],
      evidenceJson: {
        findingId: "pre-consent-tracking",
        status: "potential_gap",
        firstObservedMs: 5710,
        consentSurfaceObservedMs: 9600,
        thirdPartyRequestCount: 8
      }
    },
    {
      id: "third-party-iframes",
      rank: 3,
      title: "Third-party iframes before consent",
      status: "Potential gap",
      summary:
        "Known third-party iframe embeds were retained before a recorded consent action on the scanned page.",
      focus: "Embed gating",
      vendors: ["Google"],
      evidence: [
        "Embedded content first observed: 5.71s",
        "Map embed evidence: google.com and www.google.com",
        "Review retained domains by purpose before changing implementation."
      ],
      correctionSteps: [
        "Review iframe initialization and retained domain purpose before changing behavior.",
        "Where the embed is non-essential, defer its network initialization until the required choice is recorded.",
        "Verify the placeholder and delayed-load path in a same-region re-scan."
      ],
      evidenceJson: {
        findingId: "third-party-iframes",
        status: "potential_gap",
        firstObservedMs: 5710,
        observedDomains: ["google.com", "www.google.com"],
        phase: "before_recorded_consent_action"
      }
    },
    {
      id: "social-media-embeds",
      rank: 4,
      title: "Social/media embeds or plugins before consent",
      status: "Potential gap",
      summary:
        "A social/media embed, plugin, widget, or pixel loaded before any recorded consent action: Meta/Facebook; first seen 6.61s.",
      focus: "Social embeds",
      vendors: ["Meta/Facebook"],
      evidence: [
        "Observed vendor family: Meta/Facebook",
        "First seen: 6.61s after scan start",
        "The report treats this as observed pre-consent embed evidence, not a legal conclusion."
      ],
      correctionSteps: [
        "Review the Meta/Facebook embed, plugin, widget, or pixel initialization path.",
        "Use a non-networked placeholder until the applicable visitor choice is recorded where appropriate.",
        "Re-scan and confirm the social/media request sequence against the retained consent timeline."
      ],
      evidenceJson: {
        findingId: "social-media-embeds",
        status: "potential_gap",
        vendorFamily: "Meta/Facebook",
        firstObservedMs: 6610,
        phase: "before_recorded_consent_action"
      }
    }
  ] satisfies ShadowFinding[],
  relatedRows: [
    {
      id: "embedded-services",
      title: "Embedded third-party services before consent",
      status: "Partial concern",
      summary:
        "Map, social, and lower-risk font/static resource evidence was retained before a recorded consent action."
    },
    {
      id: "international-transfer",
      title: "International transfer disclosure",
      status: "Not confirmed",
      summary:
        "An obsolete EU-US Privacy Shield reference was observed; the current transfer basis was not established by this scan."
    },
    {
      id: "consent-mechanism",
      title: "Consent mechanism",
      status: "Observed",
      summary: "A verified first-layer consent surface with actionable controls was retained in the tested context."
    },
    {
      id: "privacy-notice",
      title: "Privacy notice link/surface discovered",
      status: "Observed",
      summary: "Public privacy-policy surface evidence was retained for the scanned site."
    }
  ],
  consentRows: [
    {
      id: "consent-surface",
      title: "Consent mechanism",
      status: "Observed",
      summary:
        "Observed in scan evidence; A verified first-layer consent surface with actionable controls was retained in the tested context.",
      correctionSteps: ["Preserve the verified first-layer consent surface and revalidate it after CMP or template changes."],
      evidenceJson: { status: "observed", evidenceType: "verified_first_layer_consent_surface" }
    },
    {
      id: "consent-management-framework",
      title: "Consent-management framework signal",
      status: "Observed",
      summary:
        "Observed in scan evidence; A consent-management framework signal was retained: BST DSGVO Cookie notice plugin, non-TCF.",
      correctionSteps: ["Keep the CMP implementation attributable and verify its retained first-layer controls after configuration changes."],
      evidenceJson: { status: "observed", cmp: "BST DSGVO Cookie", standard: "non-TCF" }
    },
    {
      id: "decline-consent-control",
      title: "Decline consent control",
      status: "Potential gap",
      summary:
        "The sufficiently retained first-layer consent surface did not show a reject, necessary-only, or equivalent refusal option. First-layer presentation expectations can vary by jurisdiction, so manual review is recommended.",
      correctionSteps: [
        "Add a first-layer reject, necessary-only, or equivalent refusal action appropriate to the tested jurisdiction.",
        "Keep the refusal action available without requiring an Accept action first.",
        "Re-scan from the same region and verify the retained first-layer control inventory."
      ],
      evidenceJson: {
        status: "potential_gap",
        controls: { accept: "observed", reject: "not_observed", options: "not_observed" },
        evidenceScope: "sufficiently_retained_first_layer"
      }
    },
    {
      id: "accept-consent-control",
      title: "Accept consent control",
      status: "Observed",
      summary:
        "An accept consent control was observed from structured consent-control evidence. This confirms availability, not post-click behavior.",
      correctionSteps: ["Preserve the attributable first-layer Accept control and continue validating it through structured retained evidence."],
      evidenceJson: { status: "observed", control: "accept", postClickBehaviorVerified: false }
    },
    {
      id: "options-consent-control",
      title: "Options/settings consent control",
      status: "Not observed",
      summary:
        "No separate options/settings control was observed alongside the retained Accept control. Because no reject or equivalent refusal control was retained either, this is supporting context for the refusal-path review rather than a standalone options-control gap.",
      correctionSteps: ["Review the first-layer choice design and ensure visitors can reach granular settings without first accepting optional processing."],
      evidenceJson: { status: "not_observed", control: "options", standaloneGap: false }
    },
    {
      id: "cookie-notice-policy",
      title: "Cookie notice or policy surface",
      status: "Observed",
      summary:
        "Observed in scan evidence; A durable cookie disclosure surface was retained in the tested context; a granular named-cookie inventory or preference interface was not confirmed.",
      correctionSteps: ["Preserve the durable cookie disclosure and review whether a granular named-cookie inventory and preference interface should be added."],
      evidenceJson: { status: "observed", durableDisclosureSurface: true, granularInventoryConfirmed: false }
    }
  ] satisfies ShadowEvidenceRow[],
  trackingExternalRows: [
    {
      id: "pre-consent-third-party-tracking",
      title: "Pre-consent non-essential tracking",
      status: "Potential gap",
      summary:
        "Tracking-classified 3rd party requests fired before any recorded consent action; first seen 5.71s after scan start.",
      correctionSteps: [
        "Gate tracking-classified third-party requests until the applicable visitor choice is recorded.",
        "Re-scan from the same region and verify the retained request sequence."
      ],
      evidenceJson: { status: "potential_gap", firstObservedMs: 5710, phase: "before_recorded_consent_action" }
    },
    {
      id: "third-party-iframe-pre-consent",
      title: "3rd party iframes before consent",
      status: "Potential gap",
      summary:
        "Potential issue based on scan evidence; Known 3rd party iframe embeds were retained before a recorded consent action on the scanned page.",
      correctionSteps: [
        "Gate non-essential third-party iframe initialization until the applicable visitor choice is recorded.",
        "Use a non-networked placeholder for embedded services where appropriate."
      ],
      evidenceJson: {
        status: "potential_gap",
        observationCount: 4,
        retainedHosts: ["google.com", "facebook.com", "fonts.googleapis.com", "www.google.com", "www.facebook.com"]
      }
    },
    {
      id: "social-media-embed-pre-consent",
      title: "Social/media embeds or plugins loaded before consent",
      status: "Potential gap",
      summary:
        "A social/media embed, plugin, widget, or pixel loaded before any recorded consent action: Meta/Facebook; first seen 6.61s after scan start.",
      correctionSteps: [
        "Review the Meta/Facebook embed, plugin, widget, or pixel initialization path.",
        "Use a non-networked placeholder until the applicable visitor choice is recorded where appropriate."
      ],
      evidenceJson: { status: "potential_gap", vendorFamily: "Meta/Facebook", host: "facebook.com", firstObservedMs: 6610 }
    },
    {
      id: "embedded-third-party-services-pre-consent",
      title: "Embedded third-party services before consent",
      status: "Partial concern",
      summary:
        "3rd party embedded content loaded before any recorded consent action, including map embed evidence (google.com and www.google.com), social embed evidence (facebook.com and www.facebook.com), lower-risk font/static resource evidence (fonts.googleapis.com). Review retained domains by purpose; first seen 5.71s after scan start.",
      correctionSteps: [
        "Review each retained embedded domain by purpose and gate non-essential services until the applicable visitor choice is recorded.",
        "Keep lower-risk static-resource evidence distinct from tracking-classified activity during remediation."
      ],
      evidenceJson: {
        status: "partial_concern",
        observationCount: 6,
        firstObservedMs: 5710,
        retainedHosts: ["google.com", "www.google.com", "facebook.com", "www.facebook.com", "fonts.googleapis.com"]
      }
    }
  ] satisfies ShadowEvidenceRow[],
  preConsentRuntimeRows: [
    {
      id: "pre-consent-cookies-storage",
      title: "Non-essential pre-consent cookies/storage",
      status: "Not observed",
      summary: "No eligible cookie or browser-storage write was observed before a recorded consent action.",
      correctionSteps: ["Continue validating cookies and browser-storage writes after tag, CMP, or embedded-service changes."],
      evidenceJson: { status: "not_observed", eligibleObservationCount: 0, reconciliation: "reconciled" }
    },
    {
      id: "session-replay-signal",
      title: "Session replay signal",
      status: "Not observed",
      summary: "No eligible session replay or behavioral-recording vendor was observed in retained runtime evidence.",
      correctionSteps: ["Continue monitoring retained runtime evidence after analytics or customer-experience tooling changes."],
      evidenceJson: { status: "not_observed", context: "browser_api_retained", observedHost: "www.pferdeklinik-roentorf.de" }
    },
    {
      id: "device-identification-fingerprinting",
      title: "Device identification / fingerprinting signal",
      status: "Not observed",
      summary: "No eligible device-identification or fingerprinting signal was observed in retained runtime evidence.",
      correctionSteps: ["Continue monitoring retained browser API evidence after analytics, fraud, or personalization changes."],
      evidenceJson: {
        status: "not_observed",
        contextualApis: ["CanvasRenderingContext2D.getImageData", "HTMLCanvasElement.toDataURL", "canvas"]
      }
    }
  ] satisfies ShadowEvidenceRow[],
  gdprTransparencyRows: [
    {
      id: "privacy-notice-surface",
      title: "Privacy notice link/surface discovered",
      status: "Observed",
      summary:
        "Observed in policy-surface evidence; Privacy notice evidence was retained in public policy-surface evidence; policy surface: https://pferdeklinik-roentorf.de/datenschutz and https://pferdeklinik-roentorf.de/sitemap; 25695 policy-text characters retained.",
      correctionSteps: ["Preserve discoverable privacy-notice links and revalidate them after navigation or policy-template changes."],
      evidenceJson: { status: "observed", policySurfaceCount: 2, retainedPolicyTextCharacters: 25695 }
    },
    {
      id: "controller-contact",
      title: "Controller/contact disclosure",
      status: "Observed",
      summary:
        "Policy text included matching disclosure evidence: \"der Nutzer und Betroffenen III. Informationen zur Datenverarbeitung I. Informationen über uns als Verantwortliche Verantwortlicher Anbieter dieses...[more evidence available]\"",
      correctionSteps: ["Preserve the attributable controller/contact wording and keep it reachable from the retained policy surface."],
      evidenceJson: { status: "observed", evidenceType: "policy_topic_match", topic: "controller_contact" }
    },
    {
      id: "processing-purposes",
      title: "Processing purposes disclosure",
      status: "Not confirmed",
      summary: "Not confirmed by scan evidence; No production-approved topic match was established. This neutral result does not establish that the disclosure is absent.",
      correctionSteps: ["Review the retained policy text for clear processing-purpose language and confirm scanner coverage before editing."],
      evidenceJson: { status: "not_confirmed", reason: "no_production_approved_topic_match", absenceEstablished: false }
    },
    {
      id: "legal-basis",
      title: "Legal basis disclosure",
      status: "Not confirmed",
      summary: "Not confirmed by scan evidence; No production-approved topic match was established. This neutral result does not establish that the disclosure is absent.",
      correctionSteps: ["Review whether applicable legal-basis language is explicit and attributable in the retained policy surface."],
      evidenceJson: { status: "not_confirmed", reason: "no_production_approved_topic_match", absenceEstablished: false }
    },
    {
      id: "recipient-categories",
      title: "Recipients/vendor categories disclosed",
      status: "Not confirmed",
      summary: "Not confirmed by scan evidence; No production-approved topic match was established. This neutral result does not establish that the disclosure is absent.",
      correctionSteps: ["Review whether named recipients or substantive recipient categories are disclosed in the retained policy surface."],
      evidenceJson: { status: "not_confirmed", reason: "no_production_approved_topic_match", absenceEstablished: false }
    },
    {
      id: "retention",
      title: "Retention disclosure",
      status: "Observed",
      summary:
        "Policy text included matching disclosure evidence: \"übermittelt werden, wenn Sie ein Video auch tatsächlich starten. Ohne diesen 'Erweiterten Datenschutz' wird eine löschung von daten Darüber hinaus ist...[more evidence available]\"",
      correctionSteps: ["Preserve substantive retention wording and verify it remains associated with the relevant processing context."],
      evidenceJson: { status: "observed", evidenceType: "policy_topic_match", topic: "retention" }
    },
    {
      id: "data-subject-rights",
      title: "Data subject rights disclosure",
      status: "Not confirmed",
      summary: "Not confirmed by scan evidence; No production-approved topic match was established. This neutral result does not establish that the disclosure is absent.",
      correctionSteps: ["Review whether substantive rights language is explicit and attributable in the retained policy surface."],
      evidenceJson: { status: "not_confirmed", reason: "no_production_approved_topic_match", absenceEstablished: false }
    },
    {
      id: "international-transfer",
      title: "International transfer disclosure",
      status: "Not confirmed",
      summary:
        "Not confirmed by scan evidence; An obsolete EU-US Privacy Shield reference was observed. Privacy Shield was invalidated on 16 July 2020; the current transfer basis was not established by this scan. Review the policy wording and the safeguards actually in use.",
      correctionSteps: ["Review the transfer wording and the safeguards actually in use, then update obsolete framework references where appropriate."],
      evidenceJson: { status: "not_confirmed", obsoleteFrameworkObserved: "EU-US Privacy Shield", invalidatedOn: "2020-07-16" }
    },
    {
      id: "privacy-contact-point",
      title: "Privacy contact point",
      status: "Not confirmed",
      summary: "Not confirmed by scan evidence; No production-approved topic match was established. This neutral result does not establish that the disclosure is absent.",
      correctionSteps: ["Review whether a usable privacy contact channel is explicit and attributable in the retained policy surface."],
      evidenceJson: { status: "not_confirmed", reason: "no_production_approved_topic_match", absenceEstablished: false }
    },
    {
      id: "supervisory-authority",
      title: "Supervisory authority complaint",
      status: "Not confirmed",
      summary: "Not confirmed by scan evidence; No production-approved topic match was established. This neutral result does not establish that the disclosure is absent.",
      correctionSteps: ["Review whether complaint or supervisory-authority information is explicit in the retained policy surface."],
      evidenceJson: { status: "not_confirmed", reason: "no_production_approved_topic_match", absenceEstablished: false }
    },
    {
      id: "automated-decision-making",
      title: "Automated decision-making / profiling disclosure",
      status: "Not confirmed",
      summary: "Not confirmed by scan evidence; No production-approved topic match was established. This neutral result does not establish that the disclosure is absent.",
      correctionSteps: ["Review whether applicable automated-decision or profiling language is explicit in the retained policy surface."],
      evidenceJson: { status: "not_confirmed", reason: "no_production_approved_topic_match", absenceEstablished: false }
    }
  ],
  transportRows: [
    {
      id: "https-delivery",
      title: "HTTPS delivery for scanned pages",
      status: "Observed",
      summary: "Observed in scan evidence; The scanned page was served over HTTPS in the retained transport observation.",
      correctionSteps: ["Preserve HTTPS delivery across the scanned route and verify it after hosting or certificate changes."],
      evidenceJson: { status: "observed", scheme: "https" }
    },
    {
      id: "certificate-validity",
      title: "Valid SSL/TLS certificate",
      status: "Observed",
      summary:
        "Observed in scan evidence; Retained certificate validation verified the HTTPS origin certificate. Retained certificate evidence: https://www.pferdeklinik-roentorf.de/ presented CN=pferdeklinik-roentorf.de certificate valid Jul 7-Oct 5, 2026.",
      correctionSteps: ["Preserve automated certificate renewal and monitor the origin certificate before its expiry window."],
      evidenceJson: { status: "observed", commonName: "pferdeklinik-roentorf.de", validFrom: "2026-07-07", validTo: "2026-10-05" }
    },
    {
      id: "http-redirect",
      title: "HTTP redirects to HTTPS",
      status: "Observed",
      summary: "Observed in scan evidence; The explicit HTTP-origin probe redirected to HTTPS.",
      correctionSteps: ["Preserve the HTTP-to-HTTPS redirect at the origin and edge."],
      evidenceJson: { status: "observed", httpOriginRedirectedToHttps: true }
    },
    {
      id: "mixed-content",
      title: "Mixed content",
      status: "Observed",
      summary: "Observed in scan evidence; No mixed-content HTTP subresources were retained for the scanned HTTPS page.",
      correctionSteps: ["Continue serving page subresources over HTTPS and revalidate after third-party embed changes."],
      evidenceJson: { status: "observed", mixedContentHttpSubresourcesRetained: false }
    },
    {
      id: "form-transport",
      title: "Observed form transport",
      status: "Observed",
      summary: "Observed in scan evidence; No insecure observed form transport was retained for the scanned page.",
      correctionSteps: ["Preserve secure form submission targets and revalidate after form-provider changes."],
      evidenceJson: { status: "observed", insecureFormTransportRetained: false }
    }
  ],
  trackerVendors: ["Meta", "Google", "BST DSGVO Cookie"],
  inventory: [
    {
      vendor: "Facebook",
      type: "Tracker",
      purpose: "Embedded media",
      evidence: "Non-essential",
      entityRelationship: "External entity",
      observed: "6.21s",
      domains: "facebook.com",
      relationship: "Cross-site",
      confidence: "High",
      category: "Functional",
      priority: "Medium",
      requestNames: "Not retained",
      serverLocation: "IP not retained",
      controllingEntity: "Meta Platforms, Inc.",
      transferMechanism: "Unknown",
      recordCount: 1,
      requestCount: 1
    },
    {
      vendor: "BST DSGVO Cookie",
      type: "Tracker",
      purpose: "Cookie compliance",
      evidence: "Contextual",
      entityRelationship: "Unknown",
      observed: "5.57s",
      domains: "pferdeklinik-roentorf.de",
      relationship: "Same-site",
      confidence: "High",
      category: "Essential",
      priority: "Contextual",
      requestNames: "Not retained",
      serverLocation: "IP not retained",
      controllingEntity: "BST DSGVO Cookie",
      transferMechanism: "Unknown",
      recordCount: 1,
      requestCount: 1
    },
    {
      vendor: "Google",
      type: "Tracker",
      purpose: "CDN",
      evidence: "Contextual",
      entityRelationship: "External entity",
      observed: "5.71s",
      domains: "fonts.googleapis.com, fonts.gstatic.com",
      relationship: "Cross-site",
      confidence: "High",
      category: "Functional",
      priority: "Contextual",
      requestNames: "Not retained",
      serverLocation: "United States HQ context",
      controllingEntity: "Google LLC",
      transferMechanism: "SCCs assumed, unverified",
      recordCount: 1,
      requestCount: 1
    }
  ]
} as const;
