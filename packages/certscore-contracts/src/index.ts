import { z } from "zod";
import {
  SUPPORTED_GDPR_TRANSPARENCY_LOCALES,
  SUPPORTED_PRIVACY_EVIDENCE_LOCALES,
} from "./supported-languages";
export * from "./consent-control-label-classifier";
export * from "./gdpr-transparency-topic-classifier";
export * from "./article13-disclosure-rejection";
export * from "./privacy-surface-classifier";
export * from "./privacy-evidence-locale-registry";
export * from "./supported-languages";

export const directVsInferredSchema = z.enum([
  "direct",
  "inferred",
  "mixed",
  "unknown",
]);

export const confidenceSchema = z.number().min(0).max(1);
export const supportedPrivacyEvidenceLocaleSchema = z.enum(SUPPORTED_PRIVACY_EVIDENCE_LOCALES);
export const supportedGdprTransparencyLocaleSchema = z.enum(SUPPORTED_GDPR_TRANSPARENCY_LOCALES);
export const consentControlLocaleSchema = supportedPrivacyEvidenceLocaleSchema;
export const consentControlMatchStrengthSchema = z.enum(["direct", "equivalent", "contextual", "weak"]);
export const consentControlClassifierReasonCodesSchema = z.array(z.string().max(80)).max(16).optional();
export const consentControlInventorySourceSchema = z.enum([
  "viewport",
  "cmp_container",
  "generic_consent_surface",
  "shadow_root",
  "same_origin_frame",
  "accessibility_tree",
]);
export const consentControlInventoryRejectionReasonSchema = z.enum([
  "hidden",
  "outside_eligible_surface",
  "no_consent_context",
  "footer_nav_page_chrome",
  "classifier_other_unknown",
  "composite_control_container",
  "generic_container_fewer_than_two_classified_controls",
  "frame_inaccessible",
  "inventory_probe_failed",
  "timing_expired_before_controls_surfaced",
]);

export const endpointAttributionStatusSchema = z.enum([
  "resolved",
  "unresolved_meaningful",
  "site_owned_infrastructure",
  "ignored_noise",
]);

export const endpointGeographyStatusSchema = z.enum([
  "not_evaluated",
  "unknown",
  "region_observed",
]);
export const endpointGeographyPrecisionSchema = z.enum([
  "provider_region",
]);

export const endpointSubtypeSchema = z.enum([
  "google_analytics_collection",
  "google_ads_or_measurement",
  "google_consent_or_tag_support",
  "google_recaptcha_or_security",
  "google_owned_unresolved_meaningful",
  "google_owned_infrastructure",
]);

export const consentStateSchema = z.enum([
  "unknown",
  "not_applicable",
  "pre_consent",
  "post_accept",
  "post_reject",
  "no_ui_observed",
]);

export const pagePhaseSchema = z.enum([
  "initial_navigation",
  "dom_content_loaded",
  "network_idle",
  "post_interaction",
]);

export const scanProfileSchema = z.object({
  profileId: z.enum(["tiny", "quick", "policy", "standard", "consent", "consent_flow", "full"]),
  label: z.string(),
  targetDurationMs: z.number().int().positive(),
  internalBudgetMs: z.number().int().positive(),
  enabledModules: z.array(z.string()),
});

export const evidenceRefSchema = z.object({
  refId: z.string(),
  eventId: z.string().optional(),
  artifactId: z.string().optional(),
  eventType: z.string().optional(),
  label: z.string().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
  excerpt: z.string().optional(),
});

export const vendorMatchSourceTypeSchema = z.enum([
  "network_request",
  "network_response",
  "script_url",
  "iframe_url",
  "cookie_name",
  "set_cookie",
  "request_cookie",
  "endpoint_pattern",
  "query_param_name",
  "storage_key",
  "consent_ui",
  "cmp_runtime_probe",
  "policy_surface_placeholder",
]);

export const scanMetadataSchema = z.object({
  scanId: z.string(),
  url: z.string(),
  normalizedUrl: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  region: z.string().optional(),
  scanProfile: scanProfileSchema,
  scannerVersion: z.string(),
  schemaVersion: z.string(),
});

export const scanModuleRunSchema = z.object({
  moduleName: z.string(),
  status: z.enum(["not_run", "completed", "partial", "failed", "skipped_budget", "not_testable"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  timingBreakdown: z.array(z.object({
    label: z.string().min(1).max(80),
    durationMs: z.number().int().nonnegative(),
    detail: z.string().max(240).optional(),
  })).max(40).optional(),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  errors: z.array(z.string()).default([]),
});

const frameContextSchema = z.object({
  frameId: z.string().optional(),
  frameUrl: z.string().optional(),
  parentFrameId: z.string().optional(),
  isMainFrame: z.boolean(),
  isSubFrame: z.boolean().optional(),
});

export const safeRequestHeadersSchema = z.object({
  userAgent: z.string().optional(),
  referer: z.string().optional(),
  origin: z.string().optional(),
  secFetchSite: z.string().optional(),
  secFetchMode: z.string().optional(),
  secFetchDest: z.string().optional(),
  secGpc: z.string().optional(),
  dnt: z.string().optional(),
  cookieHeaderPresent: z.boolean().default(false),
  cookieNames: z.array(z.string()).default([]),
  authorizationHeaderPresent: z.boolean().default(false),
});

export const safeResponseHeadersSchema = z.object({
  contentType: z.string().optional(),
  cacheControl: z.string().optional(),
  expires: z.string().optional(),
  etagPresent: z.boolean().optional(),
  location: z.string().optional(),
  accessControlAllowOrigin: z.string().optional(),
  accessControlAllowCredentials: z.string().optional(),
  accessControlExposeHeaders: z.string().optional(),
});

export const requestPayloadSignalsSchema = z.object({
  bodyPresent: z.boolean().default(false),
  bodySizeBytes: z.number().int().nonnegative().optional(),
  bodyFieldNames: z.array(z.string()).default([]),
});

export const responseTimingSchema = z.object({
  startTime: z.number().optional(),
  domainLookupStart: z.number().optional(),
  domainLookupEnd: z.number().optional(),
  connectStart: z.number().optional(),
  connectEnd: z.number().optional(),
  secureConnectionStart: z.number().optional(),
  requestStart: z.number().optional(),
  responseStart: z.number().optional(),
  responseEnd: z.number().optional(),
});

export const responseSizeSchema = z.object({
  requestBodySize: z.number().int().nonnegative().optional(),
  requestHeadersSize: z.number().int().nonnegative().optional(),
  responseBodySize: z.number().int().nonnegative().optional(),
  responseHeadersSize: z.number().int().nonnegative().optional(),
});

export const setCookieMetadataSchema = z.object({
  name: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  expires: z.string().optional(),
  maxAge: z.string().optional(),
  sameSite: z.string().optional(),
  secure: z.boolean().default(false),
  httpOnly: z.boolean().default(false),
  firstParty: z.boolean().optional(),
  thirdParty: z.boolean().optional(),
});

export const runtimeEvidenceEventSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  timestampMs: z.number().int().nonnegative(),
  sourceScanner: z.string(),
  scenario: z.string(),
  consentStateAtTime: consentStateSchema,
  pagePhase: pagePhaseSchema,
  url: z.string().optional(),
  hostname: z.string().optional(),
  registrableDomain: z.string().optional(),
  firstParty: z.boolean().optional(),
  thirdParty: z.boolean().optional(),
  topLevelUrl: z.string().optional(),
  documentUrl: z.string().optional(),
  frameContext: frameContextSchema.optional(),
  initiatorType: z.string().optional(),
  initiatorUrl: z.string().optional(),
  initiatorStack: z.array(z.string()).optional(),
  normalizedVendorRef: z.string().optional(),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  confidence: confidenceSchema,
  directVsInferred: directVsInferredSchema,
});

export const networkEventSchema = runtimeEvidenceEventSchema.extend({
  eventType: z.literal("network_request"),
  requestId: z.string(),
  method: z.string(),
  resourceType: z.string().optional(),
  requestUrl: z.string(),
  normalizedUrl: z.string().optional(),
  requestHostname: z.string().optional(),
  path: z.string().optional(),
  queryParamNames: z.array(z.string()).default([]),
  identifierParamNames: z.array(z.string()).default([]),
  advertisingClickIdParamNames: z.array(z.string()).default([]),
  tagContainerParamNames: z.array(z.string()).default([]),
  hasIdentifierLikeParameters: z.boolean().default(false),
  hasAdvertisingClickIdParameters: z.boolean().default(false),
  hasTagContainerParameters: z.boolean().default(false),
  isMainFrame: z.boolean().optional(),
  isSubFrame: z.boolean().optional(),
  isThirdParty: z.boolean().optional(),
  parentRequestId: z.string().optional(),
  redirectChainRequestIds: z.array(z.string()).default([]),
  responsibleScriptUrl: z.string().optional(),
  iframeAttributionUrl: z.string().optional(),
  requestHeaders: safeRequestHeadersSchema.optional(),
  cookieHeaderPresent: z.boolean().default(false),
  cookieNamesSent: z.array(z.string()).default([]),
  authorizationHeaderPresent: z.boolean().default(false),
  collectionEndpointObserved: z.boolean().default(false),
  endpointCategory: z.string().optional(),
  endpointSubtype: endpointSubtypeSchema.optional(),
  attributionStatus: endpointAttributionStatusSchema.optional(),
  attributionReason: z.string().optional(),
  resolverBasis: z.array(z.string()).optional(),
  endpointGeographyStatus: endpointGeographyStatusSchema.optional(),
  endpointGeographyRegion: z.string().max(80).optional(),
  endpointGeographyProvider: z.string().max(80).optional(),
  endpointGeographyLocationLabel: z.string().max(120).optional(),
  endpointGeographyJurisdiction: z.string().max(24).optional(),
  endpointGeographyPrecision: endpointGeographyPrecisionSchema.optional(),
  endpointGeographyBasis: z.array(z.string().max(120)).optional(),
  relatedEvidenceRefs: z.array(evidenceRefSchema).optional(),
  requestPayloadSignals: requestPayloadSignalsSchema.optional(),
});

export const networkResponseEventSchema = runtimeEvidenceEventSchema.extend({
  eventType: z.literal("network_response"),
  requestId: z.string().optional(),
  responseUrl: z.string(),
  normalizedUrl: z.string().optional(),
  status: z.number().int().optional(),
  contentType: z.string().optional(),
  mimeType: z.string().optional(),
  setCookieHeaders: z.array(z.string()).default([]),
  setCookieMetadata: z.array(setCookieMetadataSchema).default([]),
  cookieNamesSet: z.array(z.string()).default([]),
  responseHeaders: safeResponseHeadersSchema.optional(),
  cacheHeaders: z.record(z.string()).default({}),
  locationRedirectHeader: z.string().optional(),
  accessControlHeaders: z.record(z.string()).default({}),
  timing: responseTimingSchema.optional(),
  sizes: responseSizeSchema.optional(),
});

export const cookieEventSchema = runtimeEvidenceEventSchema.extend({
  eventType: z.literal("cookie"),
  cookieName: z.string(),
  cookieDomain: z.string().optional(),
  cookiePath: z.string().optional(),
  expires: z.string().optional(),
  maxAge: z.string().optional(),
  sameSite: z.string().optional(),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  sourceRequestId: z.string().optional(),
  sourceResponseEventId: z.string().optional(),
  cookieParty: z.enum(["first_party", "third_party", "unknown"]).default("unknown"),
  vendorAssociated: z.boolean().default(false),
  associatedVendorRef: z.string().optional(),
  cookiePurpose: z.enum([
    "analytics",
    "advertising",
    "session_replay",
    "consent_management",
    "tag_management",
    "infrastructure",
    "security",
    "performance_monitoring",
    "customer_support",
    "unknown",
  ]).default("unknown"),
  cookieClassificationBasis: z.array(z.string()).default([]),
  operation: z.enum(["set_cookie_header", "browser_snapshot"]),
  valueRedacted: z.boolean().default(true),
});

export const cookieSnapshotSchema = z.object({
  artifactId: z.string(),
  capturedAtMs: z.number().int().nonnegative(),
  consentStateAtTime: consentStateSchema,
  cookies: z.array(
    z.object({
      name: z.string(),
      domain: z.string(),
      path: z.string().optional(),
      expires: z.number().optional(),
      httpOnly: z.boolean().optional(),
      secure: z.boolean().optional(),
      sameSite: z.string().optional(),
      sourceEventId: z.string().optional(),
    }),
  ),
  cookieNames: z.array(z.string()).default([]),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
});

export const storageSnapshotSchema = z.object({
  artifactId: z.string(),
  capturedAtMs: z.number().int().nonnegative(),
  consentStateAtTime: consentStateSchema,
  url: z.string(),
  localStorage: z.record(z.string()),
  sessionStorage: z.record(z.string()),
  localStorageKeys: z.array(z.string()).default([]),
  sessionStorageKeys: z.array(z.string()).default([]),
  valuesRedacted: z.boolean().default(true),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
});

export const scriptEventSchema = runtimeEvidenceEventSchema.extend({
  eventType: z.literal("script"),
  scriptUrl: z.string().optional(),
  inline: z.boolean().default(false),
  async: z.boolean().optional(),
  defer: z.boolean().optional(),
});

export const iframeEventSchema = runtimeEvidenceEventSchema.extend({
  eventType: z.literal("iframe"),
  frameUrl: z.string().optional(),
  frameName: z.string().optional(),
});

export const consentUiObservationSchema = z.object({
  observationId: z.string(),
  observedAtMs: z.number().int().nonnegative(),
  likelyPresent: z.boolean(),
  basis: z.array(z.string()),
  textExcerpt: z.string().optional(),
  layerInspected: z.enum(["first_layer", "unknown"]).optional(),
  visibleChoiceLabels: z.array(z.string().max(120)).default([]),
  defaultToggleStatesObserved: z.boolean().nullable().optional(),
  nonEssentialDefaultsOff: z.boolean().nullable().optional(),
  defaultTogglePurposeLabels: z.array(z.string().max(120)).default([]),
  precheckedOptionalPurposeCount: z.number().int().nonnegative().default(0),
  precheckedOptionalPurposeLabels: z.array(z.string().max(120)).default([]),
  acceptControlObserved: z.boolean().default(false),
  rejectControlObserved: z.boolean().default(false),
  managePreferencesControlObserved: z.boolean().default(false),
  controls: z.array(z.object({
    label: z.string().max(120),
    actionType: z.enum(["accept_all", "reject_all", "manage_preferences", "save_preferences", "do_not_sell_share", "other"]),
    tagName: z.string().max(32).optional(),
    role: z.string().max(64).optional(),
    selectorHint: z.string().max(160).optional(),
    visible: z.boolean().default(true),
    matchedTerm: z.string().max(120).optional(),
    matchedLocale: consentControlLocaleSchema.optional(),
    matchStrength: consentControlMatchStrengthSchema.optional(),
    classifierReasonCodes: consentControlClassifierReasonCodesSchema,
    classifierVariant: z.string().max(80).optional(),
  })).default([]),
  inventoryDiagnostics: z.object({
    candidateContainerCount: z.number().int().nonnegative(),
    candidateControlCount: z.number().int().nonnegative(),
    retainedControlCount: z.number().int().nonnegative(),
    inventorySources: z.array(consentControlInventorySourceSchema).default([]),
    candidateLabels: z.array(z.string().max(120)).max(24).default([]),
    rejectionReasons: z.array(consentControlInventoryRejectionReasonSchema).default([]),
    timingMarkers: z.array(z.string().max(80)).default([]),
  }).optional(),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  confidence: confidenceSchema,
});

export const collectionSurfaceObservationSchema = z.object({
  observationId: z.string(),
  observedAtMs: z.number().int().nonnegative(),
  sourceScanner: z.string(),
  scenario: z.string(),
  consentStateAtTime: consentStateSchema,
  pageUrl: z.string(),
  surfaceType: z.enum(["search", "newsletter", "contact", "account", "checkout", "generic_form", "other"]),
  controlCount: z.number().int().nonnegative(),
  fieldTypes: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
  hasEmailField: z.boolean().default(false),
  hasSensitiveFieldHint: z.boolean().default(false),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  confidence: confidenceSchema,
  directVsInferred: directVsInferredSchema,
});

const transportUrlSchema = z.string().max(500);
const transportSchemeSchema = z.enum(["http", "https", "other", "unknown"]);
const transportProbeErrorCategorySchema = z.enum([
  "dns_failure",
  "connection_failure",
  "tls_or_certificate_failure",
  "timeout",
  "http_error",
  "unsupported_url",
  "unknown",
]);

export const transportSecuritySubresourceSchema = z.object({
  url: transportUrlSchema,
  hostname: z.string().max(255).optional(),
  pageUrl: transportUrlSchema.optional(),
  resourceType: z.string().max(80).optional(),
  disposition: z.enum(["loaded", "blocked"]),
  evidenceSource: z.enum(["network_request", "request_failed", "console", "dom"]),
});

export const transportSecurityFormObservationSchema = z.object({
  formId: z.string(),
  pageUrl: transportUrlSchema,
  pageScheme: transportSchemeSchema,
  method: z.string().max(16),
  actionPresent: z.boolean(),
  actionUrl: transportUrlSchema.optional(),
  actionScheme: transportSchemeSchema,
  resolvesToHttps: z.boolean(),
  insecureTransportObserved: z.boolean(),
  fieldTypes: z.array(z.string().max(40)).max(24).default([]),
  hasEmailField: z.boolean().default(false),
  hasSensitiveFieldHint: z.boolean().default(false),
});

export const transportSecurityObservationSchema = z.object({
  observationId: z.string(),
  observedAtMs: z.number().int().nonnegative(),
  sourceScanner: z.string(),
  scenario: z.string(),
  requestedUrl: transportUrlSchema,
  normalizedUrl: transportUrlSchema,
  requestedScheme: transportSchemeSchema,
  finalUrl: transportUrlSchema.optional(),
  finalScheme: transportSchemeSchema,
  sampledPageUrls: z.array(transportUrlSchema).max(20).default([]),
  pageHttpsObserved: z.boolean(),
  httpProbe: z.object({
    attempted: z.boolean(),
    inputUrl: transportUrlSchema.optional(),
    status: z.number().int().optional(),
    finalUrl: transportUrlSchema.optional(),
    finalScheme: transportSchemeSchema.optional(),
    redirectChain: z.array(transportUrlSchema).max(12).default([]),
    redirectedToHttps: z.boolean().optional(),
    errorCategory: transportProbeErrorCategorySchema.optional(),
    errorMessage: z.string().max(240).optional(),
  }),
  tlsProbe: z.object({
    attempted: z.boolean(),
    inputUrl: transportUrlSchema.optional(),
    validCertificate: z.boolean().optional(),
    finalUrl: transportUrlSchema.optional(),
    errorCategory: transportProbeErrorCategorySchema.optional(),
    errorMessage: z.string().max(240).optional(),
  }),
  mixedContent: z.object({
    loadedHttpSubresources: z.array(transportSecuritySubresourceSchema).max(25).default([]),
    blockedHttpSubresources: z.array(transportSecuritySubresourceSchema).max(25).default([]),
    observedCount: z.number().int().nonnegative(),
  }),
  formTransports: z.array(transportSecurityFormObservationSchema).max(40).default([]),
  summary: z.object({
    scannedPagesUseHttps: z.boolean().optional(),
    validTlsCertificate: z.boolean().optional(),
    httpRedirectsToHttps: z.boolean().optional(),
    mixedContentObserved: z.boolean(),
    insecureFormTransportObserved: z.boolean(),
  }),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  confidence: confidenceSchema,
  directVsInferred: directVsInferredSchema,
});

export const consentInteractionEventSchema = runtimeEvidenceEventSchema.extend({
  eventType: z.literal("consent_interaction"),
  action: z.enum(["accept", "reject", "settings", "close", "unknown"]),
  selector: z.string().optional(),
  text: z.string().optional(),
});

export const artifactRefSchema = z.object({
  artifactId: z.string(),
  artifactType: z.enum(["screenshot", "dom_snapshot", "json", "cookie_snapshot", "storage_snapshot", "network_archive", "console_debug", "other"]),
  path: z.string().optional(),
  storageKey: z.string().optional(),
  createdAt: z.string().optional(),
  observedAtMs: z.number().int().nonnegative().optional(),
  sourceScanner: z.string().optional(),
  scenario: z.string().optional(),
  sensitivity: z.enum(["safe", "redacted", "internal_only"]).default("safe"),
  redactionStatus: z.enum(["not_needed", "redacted", "internal_only"]).default("not_needed"),
  relatedEventIds: z.array(z.string()).default([]),
  label: z.string().optional(),
});

export const consentFlowScenarioSchema = z.enum([
  "baseline_pre_consent",
  "reject_all_flow",
  "accept_all_flow",
  "preference_center",
  "gpc_enabled",
  "privacy_opt_out_flow",
  "form_collection_probe",
  "accessibility_probe",
]);

export const consentScenarioPlanningModeSchema = z.enum([
  "legacy_sequential",
  "planned_parallel",
]);

export const consentScenarioPolicyPlanningStatusSchema = z.enum([
  "policy_surface_ready_for_planning",
  "policy_surface_not_ready_for_planning",
  "policy_surface_unavailable",
]);

export const consentScenarioStatusSchema = z.enum([
  "planned",
  "completed",
  "failed",
  "skipped",
]);

export const consentScenarioSkipReasonSchema = z.enum([
  "baseline_required",
  "cmp_or_banner_not_observed",
  "action_candidate_not_observed",
  "privacy_control_not_observed",
  "profile_not_enabled",
  "capture_replay_not_enabled",
  "budget_exhausted",
  "deadline_hit",
  "policy_surface_not_ready_for_planning",
  "unsupported_in_legacy_mode",
]);

export const consentActionTypeSchema = z.enum([
  "accept_all",
  "reject_all",
  "manage_preferences",
  "save_preferences",
  "close_banner",
  "reopen_preferences",
  "do_not_sell_share",
  "unknown",
]);

export const consentActionCandidateSchema = z.object({
  actionId: z.string(),
  actionType: consentActionTypeSchema,
  labelText: z.string(),
  normalizedLabel: z.string(),
  selectorSummary: z.string().optional(),
  domLocation: z.string().optional(),
  contextTextExcerpt: z.string().max(500).optional(),
  frameContext: z.object({
    frameKind: z.enum(["main_frame", "sub_frame"]),
    frameUrl: z.string().optional(),
    frameName: z.string().optional(),
  }).optional(),
  visible: z.boolean().default(true),
  enabled: z.boolean().default(true),
  confidence: confidenceSchema,
  matchedTerm: z.string().max(120).optional(),
  matchedLocale: consentControlLocaleSchema.optional(),
  matchStrength: consentControlMatchStrengthSchema.optional(),
  classifierReasonCodes: consentControlClassifierReasonCodesSchema,
  classifierVariant: z.string().max(80).optional(),
  detectionMethod: z.enum([
    "deterministic_text",
    "role_button",
    "aria_label",
    "css_selector",
    "nano_assisted_ui_classification",
    "manual_fixture",
  ]),
  shouldClick: z.boolean().default(false),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  screenshotArtifactRefs: z.array(artifactRefSchema).default([]),
  assistMetadata: z.array(z.object({
    assistId: z.string(),
    modelAssistProvider: z.literal("nano"),
    assistType: z.literal("consent_ui_classification"),
    confidence: confidenceSchema,
    uncertaintyNotes: z.array(z.string()).default([]),
    usedForFinalFinding: z.literal(false).default(false),
  })).default([]),
});

export const consentActionAttemptSchema = z.object({
  attemptId: z.string(),
  actionType: consentActionTypeSchema,
  attempted: z.boolean(),
  succeeded: z.boolean(),
  failureReason: z.string().optional(),
  actionProof: z.object({
    proofVersion: z.literal("consent_action_proof.v1").default("consent_action_proof.v1"),
    candidateObserved: z.boolean(),
    candidateActionId: z.string().optional(),
    candidateLabelText: z.string().optional(),
    candidateNormalizedActionType: consentActionTypeSchema.optional(),
    candidateSelectorSummary: z.string().optional(),
    candidateConfidence: confidenceSchema.optional(),
    candidateDetectionMethod: z.string().optional(),
    actionPath: z.enum([
      "direct_action",
      "preference_center_reject_all_save",
      "preference_center_toggle_save",
      "preference_center_unresolved",
      "privacy_opt_out_form",
      "not_attempted",
    ]).optional(),
    cmpFamily: z.string().optional(),
    cmpProvider: z.string().optional(),
    frameContext: z.object({
      frameKind: z.enum(["main_frame", "sub_frame"]),
      frameUrl: z.string().optional(),
      frameName: z.string().optional(),
    }).optional(),
    attemptedStatus: z.enum(["not_attempted", "attempted_succeeded", "attempted_failed"]),
    failureReason: z.string().optional(),
    actionTimestampMs: z.number().int().nonnegative().optional(),
    postClickSettleMs: z.number().int().nonnegative().optional(),
    beforeScreenshotRef: artifactRefSchema.optional(),
    afterScreenshotRef: artifactRefSchema.optional(),
    beforeDomRef: artifactRefSchema.optional(),
    afterDomRef: artifactRefSchema.optional(),
    beforeDomExcerpt: z.string().max(1000).optional(),
    afterDomExcerpt: z.string().max(1000).optional(),
    preActionConsentStateMarkers: z.array(z.string().max(180)).default([]),
    postActionConsentStateMarkers: z.array(z.string().max(180)).default([]),
    evidenceRefs: z.array(evidenceRefSchema).default([]),
  }).optional(),
  viaPreferenceCenter: z.boolean().optional(),
  preferenceCenterTraversal: z.object({
    traversalId: z.string(),
    firstLayerActionId: z.string().optional(),
    opened: z.boolean(),
    openSucceeded: z.boolean(),
    secondLayerObserved: z.boolean(),
    secondLayerControlCount: z.number().int().nonnegative(),
    rejectAllControlObserved: z.boolean(),
    saveChoicesControlObserved: z.boolean(),
    acceptAllControlObserved: z.boolean(),
    categoryTogglesObserved: z.number().int().nonnegative(),
    attemptedDisableCategoryToggles: z.boolean().default(false),
    disabledCategoryToggles: z.number().int().nonnegative().default(0),
    attemptedRejectViaPreferenceCenter: z.boolean(),
    attemptedSaveChoices: z.boolean(),
    succeeded: z.boolean(),
    failureReason: z.string().optional(),
    confidence: confidenceSchema,
    evidenceRefs: z.array(evidenceRefSchema).default([]),
    screenshotArtifactRefs: z.array(artifactRefSchema).default([]),
    domArtifactRefs: z.array(artifactRefSchema).default([]),
  }).optional(),
  beforeScreenshotRef: artifactRefSchema.optional(),
  afterScreenshotRef: artifactRefSchema.optional(),
  beforeDomRef: artifactRefSchema.optional(),
  afterDomRef: artifactRefSchema.optional(),
  bannerPresentBefore: z.boolean().optional(),
  bannerPresentAfter: z.boolean().optional(),
  timestampMs: z.number().int().nonnegative(),
  scenario: consentFlowScenarioSchema,
  evidenceRefs: z.array(evidenceRefSchema).default([]),
});

export const journeyPhaseDeltaSchema = z.object({
  journeyKey: z.string(),
  displayName: z.string().optional(),
  vendor: z.string().optional(),
  product: z.string().optional(),
  cookieName: z.string().optional(),
  endpointHostname: z.string().optional(),
  observedPreConsent: z.boolean().default(false),
  observedAfterReject: z.boolean().default(false),
  observedAfterAccept: z.boolean().default(false),
  persistedAfterReject: z.boolean().default(false),
  suppressedAfterReject: z.boolean().default(false),
  appearedOnlyAfterAccept: z.boolean().default(false),
  expandedAfterAccept: z.boolean().default(false),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
});

export const consentFlowComparisonSchema = z.object({
  comparisonId: z.string(),
  comparedScenarios: z.enum([
    "fresh_pre_consent_vs_after_reject",
    "fresh_pre_consent_vs_after_accept",
    "after_reject_vs_after_accept",
    "fresh_pre_consent_vs_gpc_enabled",
    "fresh_pre_consent_vs_privacy_opt_out",
  ]),
  vendorsPersistingAfterReject: z.array(z.string()).default([]),
  vendorsSuppressedAfterReject: z.array(z.string()).default([]),
  vendorsAppearingOnlyAfterAccept: z.array(z.string()).default([]),
  vendorsPersistingAfterGpc: z.array(z.string()).default([]),
  vendorsSuppressedAfterGpc: z.array(z.string()).default([]),
  cookiesPersistingAfterReject: z.array(z.string()).default([]),
  cookiesSetAfterAccept: z.array(z.string()).default([]),
  cookiesPersistingAfterGpc: z.array(z.string()).default([]),
  cookiesSuppressedAfterGpc: z.array(z.string()).default([]),
  collectionEndpointsPersistingAfterReject: z.array(z.string()).default([]),
  collectionEndpointsSuppressedAfterReject: z.array(z.string()).default([]),
  collectionEndpointsAppearingOnlyAfterAccept: z.array(z.string()).default([]),
  collectionEndpointsPersistingAfterGpc: z.array(z.string()).default([]),
  collectionEndpointsSuppressedAfterGpc: z.array(z.string()).default([]),
  requestCountDeltaByVendor: z.record(z.number()).default({}),
  cookieCountDeltaByVendor: z.record(z.number()).default({}),
  journeyPhaseDeltas: z.array(journeyPhaseDeltaSchema).default([]),
  comparableMeasurement: z.object({
    comparable: z.boolean(),
    reason: z.string().optional(),
    preActionWindow: z.object({
      scenario: consentFlowScenarioSchema,
      consentStateAtEnd: consentStateSchema,
      startedAtMs: z.number().int().nonnegative(),
      completedAtMs: z.number().int().nonnegative(),
      networkEventCount: z.number().int().nonnegative(),
      cookieEventCount: z.number().int().nonnegative(),
    }),
    postActionWindow: z.object({
      scenario: consentFlowScenarioSchema,
      consentStateAtEnd: consentStateSchema,
      startedAtMs: z.number().int().nonnegative(),
      completedAtMs: z.number().int().nonnegative(),
      networkEventCount: z.number().int().nonnegative(),
      cookieEventCount: z.number().int().nonnegative(),
    }),
    rejectActionEvent: z.object({
      attemptId: z.string().optional(),
      attempted: z.boolean(),
      succeeded: z.boolean(),
      failureReason: z.string().optional(),
      actionTimestampMs: z.number().int().nonnegative().optional(),
      postClickSettleMs: z.number().int().nonnegative().optional(),
      proofAvailable: z.boolean(),
    }).optional(),
  }).optional(),
  confidence: confidenceSchema,
  coverageLimitations: z.array(z.object({
    limitationKey: z.string(),
    description: z.string(),
    affectedFindingKeys: z.array(z.string()).default([]),
    sourceModulesRequired: z.array(z.string()).default([]),
    sourceModulesPresent: z.array(z.string()).default([]),
  })).default([]),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
});

export const consentFlowObservationSchema = z.object({
  observationId: z.string(),
  sourceScanner: z.string().default("consent_flow_runtime"),
  scenario: consentFlowScenarioSchema,
  consentStateAtTime: consentStateSchema,
  bannerLikelyPresent: z.boolean(),
  actionCandidates: z.array(consentActionCandidateSchema).default([]),
  actionAttempts: z.array(consentActionAttemptSchema).default([]),
  textExcerpt: z.string().optional(),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  artifactRefs: z.array(artifactRefSchema).default([]),
  confidence: confidenceSchema,
  directVsInferred: directVsInferredSchema.default("direct"),
});

const consentScenarioNodeBaseSchema = z.object({
  scenario: consentFlowScenarioSchema,
  actionType: consentActionTypeSchema.optional(),
  targetUrl: z.string().optional(),
  reasonCodes: z.array(z.string().max(120)).default([]),
});

export const consentScenarioPlanArtifactSchema = z.object({
  artifactVersion: z.literal("consent_scenario_plan.v1"),
  sourceScanner: z.literal("consent_flow_runtime"),
  planningMode: consentScenarioPlanningModeSchema,
  generatedAt: z.string(),
  sourceUrl: z.string(),
  normalizedUrl: z.string(),
  policyPlanningStatus: consentScenarioPolicyPlanningStatusSchema,
  deadlines: z.object({
    policyPlanningDeadlineMs: z.number().int().nonnegative().optional(),
    consentFlowDeadlineMs: z.number().int().positive().optional(),
    scenarioConcurrency: z.number().int().positive().optional(),
  }),
  plannedScenarios: z.array(consentScenarioNodeBaseSchema),
  skippedScenarios: z.array(consentScenarioNodeBaseSchema.extend({
    skipReason: consentScenarioSkipReasonSchema,
  })).default([]),
  plannerInputs: z.object({
    baselineScenario: consentFlowScenarioSchema,
    captureReplay: z.boolean().default(false),
    seededPrivacyControlUrlCount: z.number().int().nonnegative().default(0),
    policyPrivacyControlUrlCount: z.number().int().nonnegative().default(0),
    baselineActionCandidateCount: z.number().int().nonnegative().default(0),
    baselineLikelyBannerPresent: z.boolean().default(false),
    baselineCmpEvidenceObserved: z.boolean().default(false),
  }),
  notes: z.array(z.string().max(240)).default([]),
});

export const consentScenarioExecutionArtifactSchema = z.object({
  artifactVersion: z.literal("consent_scenario_execution.v1"),
  sourceScanner: z.literal("consent_flow_runtime"),
  planningMode: consentScenarioPlanningModeSchema,
  generatedAt: z.string(),
  sourceUrl: z.string(),
  normalizedUrl: z.string(),
  policyPlanningStatus: consentScenarioPolicyPlanningStatusSchema,
  healthSummary: z.object({
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    comparisonEligible: z.number().int().nonnegative(),
    deadlineHit: z.boolean(),
    policyLate: z.boolean(),
  }),
  scenarios: z.array(consentScenarioNodeBaseSchema.extend({
    status: consentScenarioStatusSchema,
    startedAtMs: z.number().int().nonnegative().optional(),
    completedAtMs: z.number().int().nonnegative().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    phaseTimings: z.array(z.object({
      label: z.string().min(1).max(80),
      durationMs: z.number().int().nonnegative(),
      detail: z.string().max(240).optional(),
    })).max(40).default([]),
    actionProofStatus: z.enum([
      "not_required",
      "attempted_succeeded",
      "attempted_failed",
      "not_attempted",
      "not_available",
    ]),
    comparisonEligible: z.boolean().default(false),
    deadlineHit: z.boolean().default(false),
    failureReason: z.string().max(240).optional(),
    error: z.string().max(500).optional(),
  })),
  notes: z.array(z.string().max(240)).default([]),
});

export const consentFlowTraceArtifactSchema = z.object({
  artifactVersion: z.literal("consent_flow_trace.v1"),
  sourceScanner: z.literal("consent_flow_runtime"),
  generatedAt: z.string(),
  sourceUrl: z.string(),
  normalizedUrl: z.string(),
  planningMode: consentScenarioPlanningModeSchema,
  scenarioNodes: z.array(z.object({
    scenario: consentFlowScenarioSchema,
    status: consentScenarioStatusSchema,
    plannedReasonCodes: z.array(z.string().max(120)).default([]),
    actionProofStatus: z.string().max(80),
    comparisonEligible: z.boolean(),
    coverageAreas: z.array(z.string().max(120)).default([]),
    evidenceRefIds: z.array(z.string().max(160)).default([]),
    artifactRefIds: z.array(z.string().max(160)).default([]),
    signalSummary: z.object({
      networkEvents: z.number().int().nonnegative().default(0),
      cookieEvents: z.number().int().nonnegative().default(0),
      actionCandidates: z.number().int().nonnegative().default(0),
      actionAttempts: z.number().int().nonnegative().default(0),
    }),
  })),
  decisionEdges: z.array(z.object({
    from: consentFlowScenarioSchema,
    to: consentFlowScenarioSchema,
    decision: z.enum(["planned", "skipped", "failed"]),
    reasonCodes: z.array(z.string().max(120)).default([]),
  })).default([]),
  coverageTrace: z.array(z.object({
    coverageArea: z.string().max(120),
    status: z.enum(["testable", "not_testable", "not_observed", "skipped"]),
    supportingScenarios: z.array(consentFlowScenarioSchema).default([]),
    supportingComparisonIds: z.array(z.string().max(160)).default([]),
    limitationKeys: z.array(z.string().max(160)).default([]),
  })).default([]),
  artifactRefIds: z.array(z.string().max(160)).default([]),
  notes: z.array(z.string().max(240)).default([]),
});

export const consentScenarioShadowCompareArtifactSchema = z.object({
  artifactVersion: z.literal("consent_scenario_shadow_compare.v1"),
  sourceScanner: z.literal("consent_flow_runtime"),
  generatedAt: z.string(),
  profile: z.string(),
  summary: z.object({
    urlsScanned: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    truePlannedRegressionSites: z.number().int().nonnegative().default(0),
    stalePairSites: z.number().int().nonnegative().default(0),
    liveVarianceSuspectedSites: z.number().int().nonnegative().default(0),
    unstablePairRefreshSites: z.number().int().nonnegative().default(0),
    p50DurationDeltaMs: z.number().int().optional(),
    p90DurationDeltaMs: z.number().int().optional(),
    p50DurationImprovementPct: z.number().optional(),
    p90DurationImprovementPct: z.number().optional(),
    sameOrBetterLaneCoverage: z.boolean(),
    noNewProductionFacingOutputs: z.boolean(),
    completePlannedArtifacts: z.boolean(),
    traceComplete: z.boolean(),
    increasedAmbiguitySites: z.number().int().nonnegative(),
  }),
  sites: z.array(z.object({
    url: z.string(),
    normalizedUrl: z.string().optional(),
    legacyScanId: z.string().optional(),
    plannedScanId: z.string().optional(),
    status: z.enum(["completed", "failed"]),
    failureReason: z.string().max(500).optional(),
    durationMs: z.object({
      legacy: z.number().int().nonnegative().optional(),
      planned: z.number().int().nonnegative().optional(),
      delta: z.number().int().optional(),
      improvementPct: z.number().optional(),
    }),
    moduleStatuses: z.object({
      legacyConsentFlow: z.string().optional(),
      plannedConsentFlow: z.string().optional(),
    }),
    pairFreshness: z.object({
      legacyStartedAt: z.string().optional(),
      plannedStartedAt: z.string().optional(),
      legacyCompletedAt: z.string().optional(),
      plannedCompletedAt: z.string().optional(),
      captureGapMs: z.number().int().nonnegative().optional(),
      maxFreshPairGapMs: z.number().int().nonnegative(),
      status: z.enum(["fresh_pair", "stale_pair", "unknown_pair"]),
      reasonCodes: z.array(z.string().max(120)).default([]),
    }),
    laneCoverage: z.object({
      legacy: z.array(z.string().max(120)).default([]),
      planned: z.array(z.string().max(120)).default([]),
      missingInPlanned: z.array(z.string().max(120)).default([]),
      additionalInPlanned: z.array(z.string().max(120)).default([]),
      sameOrBetter: z.boolean(),
    }),
    actionAttempts: z.object({
      legacy: z.object({
        total: z.number().int().nonnegative(),
        attempted: z.number().int().nonnegative(),
        succeeded: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        notAttempted: z.number().int().nonnegative(),
      }),
      planned: z.object({
        total: z.number().int().nonnegative(),
        attempted: z.number().int().nonnegative(),
        succeeded: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        notAttempted: z.number().int().nonnegative(),
      }),
    }),
    comparisons: z.object({
      legacyComparable: z.number().int().nonnegative(),
      plannedComparable: z.number().int().nonnegative(),
      plannedNotComparableReasons: z.array(z.string().max(160)).default([]),
      increasedAmbiguity: z.boolean(),
    }),
    artifacts: z.object({
      plan: z.boolean(),
      execution: z.boolean(),
      trace: z.boolean(),
      allInternalOnly: z.boolean(),
      pathsUnique: z.boolean(),
    }),
    trace: z.object({
      scenarioNodeCount: z.number().int().nonnegative(),
      coverageAreaCount: z.number().int().nonnegative(),
      complete: z.boolean(),
    }),
    notTestableReasons: z.array(z.string().max(160)).default([]),
    productionOutputInvariant: z.object({
      noNewProductionFacingOutputs: z.boolean(),
      blockingReasons: z.array(z.string().max(240)).default([]),
    }),
    validationOutcome: z.object({
      category: z.enum([
        "healthy",
        "long_tail_only",
        "scanner_failure",
        "stale_pair",
        "live_variance_suspected",
        "true_planned_regression",
      ]),
      refreshRecommended: z.boolean(),
      reasonCodes: z.array(z.string().max(160)).default([]),
    }),
    longTailDiagnostic: z.object({
      plannedLongTail: z.boolean(),
      thresholdMs: z.number().int().nonnegative(),
      topScenario: consentFlowScenarioSchema.optional(),
      topScenarioStatus: consentScenarioStatusSchema.optional(),
      topScenarioDurationMs: z.number().int().nonnegative().optional(),
      topPhaseScenario: consentFlowScenarioSchema.optional(),
      topPhaseLabel: z.string().min(1).max(80).optional(),
      topPhaseDurationMs: z.number().int().nonnegative().optional(),
      topPhaseDetail: z.string().max(240).optional(),
      bottleneckReasonCodes: z.array(z.string().max(120)).default([]),
      bottleneckBuckets: z.array(z.object({
        bucket: z.string().min(1).max(80),
        totalMs: z.number().int().nonnegative(),
        occurrences: z.number().int().nonnegative(),
      })).max(8).default([]),
      scenarioDurations: z.array(z.object({
        scenario: consentFlowScenarioSchema,
        status: consentScenarioStatusSchema,
        durationMs: z.number().int().nonnegative().optional(),
        deadlineHit: z.boolean().default(false),
      })).max(10).default([]),
      phaseHotspots: z.array(z.object({
        scenario: consentFlowScenarioSchema,
        label: z.string().min(1).max(80),
        durationMs: z.number().int().nonnegative(),
      })).max(8).default([]),
    }).optional(),
  })).default([]),
  notes: z.array(z.string().max(240)).default([]),
});

export const consentActionRecipeResearchArtifactSchema = z.object({
  artifactVersion: z.literal("consent_action_recipe_research.v1"),
  sourceScanner: z.literal("consent_flow_runtime"),
  generatedAt: z.string(),
  sourceUrl: z.string(),
  normalizedUrl: z.string(),
  planningMode: consentScenarioPlanningModeSchema,
  baseline: z.object({
    scenario: z.literal("baseline_pre_consent"),
    candidateCount: z.number().int().nonnegative(),
    retainedCandidateCount: z.number().int().nonnegative(),
    candidates: z.array(z.object({
      candidateId: z.string().max(160),
      labelText: z.string().max(180),
      normalizedLabel: z.string().max(180),
      href: z.string().max(500).optional(),
      domLocation: z.string().max(160).optional(),
      frameKind: z.enum(["main_frame", "sub_frame"]).optional(),
      frameUrl: z.string().max(500).optional(),
      reasonCodes: z.array(z.string().max(120)).default([]),
      suggestedScenario: consentFlowScenarioSchema.optional(),
      confidence: confidenceSchema,
    })).default([]),
  }),
  hypotheses: z.array(z.object({
    hypothesisId: z.string().max(160),
    scenario: consentFlowScenarioSchema,
    actionType: consentActionTypeSchema.optional(),
    directNavigationUrl: z.string().max(500).optional(),
    candidateIds: z.array(z.string().max(160)).default([]),
    reasonCodes: z.array(z.string().max(120)).default([]),
    confidence: confidenceSchema,
  })).default([]),
  outcomes: z.array(z.object({
    scenario: consentFlowScenarioSchema,
    status: consentScenarioStatusSchema.optional(),
    actionType: consentActionTypeSchema.optional(),
    attempted: z.boolean().optional(),
    succeeded: z.boolean().optional(),
    actionProofStatus: z.string().max(80).optional(),
    actionPath: z.string().max(120).optional(),
    frameUrl: z.string().max(500).optional(),
    candidateLabelText: z.string().max(180).optional(),
    comparisonEligible: z.boolean().optional(),
  })).default([]),
  hindsightMatches: z.array(z.object({
    hypothesisId: z.string().max(160),
    scenario: consentFlowScenarioSchema,
    matched: z.boolean(),
    reasonCodes: z.array(z.string().max(120)).default([]),
  })).default([]),
  notes: z.array(z.string().max(240)).default([]),
});

export const screenshotArtifactSchema = z.object({
  artifactId: z.string(),
  capturedAtMs: z.number().int().nonnegative(),
  captureMethod: z.enum([
    "primary_full_page",
    "primary_viewport_fallback",
    "primary_placeholder",
    "fresh_context_full_page",
    "fresh_context_viewport_fallback",
    "fresh_context_placeholder",
    "independent_visual_fallback_viewport",
  ]).optional(),
  path: z.string(),
  url: z.string(),
  pagePhase: pagePhaseSchema,
  consentStateAtTime: consentStateSchema,
});

export const visualCaptureStatusSchema = z.enum(["available", "unavailable", "failed", "placeholder"]);
export const visualCaptureFailureReasonSchema = z.enum([
  "page_closed",
  "screenshot_timeout",
  "browser_crash",
  "placeholder_used",
  "skipped_by_mode",
  "unknown",
]);
export const visualCaptureSummarySchema = z.object({
  status: visualCaptureStatusSchema,
  failureReason: visualCaptureFailureReasonSchema.optional(),
  captureMethod: z.enum([
    "primary_full_page",
    "primary_viewport_fallback",
    "primary_placeholder",
    "fresh_context_full_page",
    "fresh_context_viewport_fallback",
    "fresh_context_placeholder",
    "independent_visual_fallback_viewport",
  ]).optional(),
  artifactRefs: z.array(artifactRefSchema).default([]),
  notes: z.array(z.string().max(240)).default([]),
});

export const domSnapshotArtifactSchema = z.object({
  artifactId: z.string(),
  capturedAtMs: z.number().int().nonnegative(),
  path: z.string(),
  url: z.string(),
  textExcerpt: z.string().optional(),
  pagePhase: pagePhaseSchema,
  consentStateAtTime: consentStateSchema,
});

export const policySurfaceObservationSchema = z.object({
  observationId: z.string(),
  sourceScanner: z.string().default("policy_surface"),
  scenario: z.string().default("policy_surface_review"),
  consentStateAtTime: consentStateSchema.default("not_applicable"),
  surfaceType: z.enum([
    "privacy_policy",
    "cookie_policy",
    "california_notice",
    "notice_at_collection",
    "do_not_sell_or_share",
    "your_privacy_choices",
    "cookie_settings",
    "consent_preferences",
    "terms",
    "ai_disclosure",
    "accessibility_statement",
    "unknown",
  ]),
  url: z.string(),
  normalizedUrl: z.string().optional(),
  linkText: z.string().optional(),
  selector: z.string().optional(),
  surroundingTextExcerpt: z.string().optional(),
  discoveryMethod: z.enum([
    "nano_assisted_link_classification",
    "footer_link",
    "header_link",
    "page_text_link",
    "sitemap_or_common_path",
    "robots_or_well_known",
    "guessed_common_path",
    "deterministic_keyword_match",
  ]).default("deterministic_keyword_match"),
  status: z.enum([
    "observed",
    "candidate",
    "assisted_candidate",
    "fetched",
    "failed",
    "not_observed",
    "skipped_budget",
  ]).default("observed"),
  httpStatus: z.number().int().optional(),
  fetchable: z.boolean().optional(),
  clickable: z.boolean().optional(),
  mayLeadToConsentControls: z.boolean().optional(),
  title: z.string().optional(),
  textExcerpt: z.string().optional(),
  boundedTextExcerptIds: z.array(z.string()).default([]),
  observedTopics: z.array(z.enum([
    "cookies",
    "analytics",
    "advertising",
    "targeted_advertising",
    "sale_or_share",
    "do_not_sell_or_share",
    "global_privacy_control",
    "california_privacy_rights",
    "notice_at_collection",
    "sensitive_personal_information",
    "profiling_or_automated_decision_making",
    "session_replay_or_behavioral_analytics",
    "third_party_disclosures",
    "vendor_list",
    "consent_withdrawal",
    "cookie_settings",
    "data_retention",
    "controller_contact",
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_subject_rights",
    "international_transfers",
    "dpo_contact",
    "supervisory_authority",
    "ai_generated_content",
    "ai_features",
    "contact_privacy",
    "accessibility",
    "unknown",
  ])).default([]),
  article13DisclosureSignals: z.array(z.object({
    disclosureType: z.enum([
      "controller_contact",
      "processing_purposes",
      "legal_basis",
      "recipients_or_vendor_categories",
      "data_retention",
      "data_subject_rights",
      "international_transfers",
      "dpo_contact",
      "supervisory_authority",
      "automated_decision_making_or_profiling",
    ]),
    status: z.enum(["observed", "partial"]),
    evidenceText: z.string().max(640).optional(),
    confidence: z.number().min(0).max(1).default(0.5),
    source: z.enum(["deterministic", "nano"]).default("deterministic"),
    selectedPolicySectionHeading: z.string().max(160).optional(),
    selectedPolicySectionExcerpt: z.string().max(1_200).optional(),
    selectedPolicySectionUrl: z.string().optional(),
    evidenceSource: z.enum(["deterministic", "nano", "deterministic_plus_nano"]).optional(),
    selectedEvidenceStrength: z.enum(["strong", "partial", "limited"]).optional(),
    classifierProvenance: z.literal("gdpr_transparency_topic_classifier.v1").optional(),
    matchedLocale: supportedGdprTransparencyLocaleSchema.optional(),
    matchedTerm: z.string().max(240).optional(),
    matchStrength: z.enum(["direct", "equivalent", "contextual", "weak"]).optional(),
    classifierReasonCodes: z.array(z.string().max(100)).max(16).optional(),
  })).default([]),
  gdprTransparencyTopicCandidates: z.array(z.object({
    topic: z.enum([
      "controller_contact",
      "processing_purposes",
      "legal_basis",
      "recipients_or_vendor_categories",
      "data_retention",
      "data_subject_rights",
      "international_transfers",
      "dpo_contact",
      "supervisory_authority",
      "automated_decision_making_or_profiling",
    ]),
    status: z.literal("diagnostic_only").default("diagnostic_only"),
    evidenceText: z.string().max(640),
    confidence: z.number().min(0).max(1).default(0.5),
    classifierProvenance: z.literal("gdpr_transparency_topic_classifier.v1"),
    matchedLocale: supportedGdprTransparencyLocaleSchema,
    matchedTerm: z.string().max(240),
    matchStrength: z.enum(["direct", "equivalent", "contextual", "weak"]),
    classifierReasonCodes: z.array(z.string().max(100)).max(16).default([]),
    productionCredit: z.literal(false).default(false),
  })).default([]),
  discardedArticle13DisclosureSignals: z.array(z.object({
    disclosureType: z.enum([
      "controller_contact",
      "processing_purposes",
      "legal_basis",
      "recipients_or_vendor_categories",
      "data_retention",
      "data_subject_rights",
      "international_transfers",
      "dpo_contact",
      "supervisory_authority",
      "automated_decision_making_or_profiling",
    ]),
    evidenceText: z.string().max(640).optional(),
    rejectReason: z.enum([
      "page_chrome_or_navigation",
      "table_of_contents_only",
      "insufficient_row_specific_terms",
      "generic_storage_not_retention",
      "code_or_non_policy_excerpt",
      "low_confidence_or_ambiguous",
    ]),
    confidence: z.number().min(0).max(1).optional(),
    source: z.enum(["deterministic", "nano"]).default("deterministic"),
  })).default([]),
  retainedPolicySections: z.array(z.object({
    sourceUrl: z.string(),
    heading: z.string().max(160),
    textExcerpt: z.string().max(1_200),
    charStart: z.number().int().nonnegative().optional(),
    charEnd: z.number().int().nonnegative().optional(),
    quality: z.enum(["strong", "partial", "limited"]).default("partial"),
  })).default([]),
  retainedArticle13SectionEvidence: z.array(z.object({
    coverageArea: z.enum([
      "controller_contact",
      "processing_purposes",
      "legal_basis",
      "recipients_or_vendor_categories",
      "data_retention",
      "data_subject_rights",
      "international_transfers",
      "dpo_contact",
      "supervisory_authority",
      "automated_decision_making_or_profiling",
    ]),
    selectedPolicySectionHeading: z.string().max(160),
    selectedPolicySectionExcerpt: z.string().max(1_200),
    selectedPolicySectionUrl: z.string(),
    evidenceSource: z.enum(["deterministic", "nano", "deterministic_plus_nano"]).default("deterministic"),
    selectedEvidenceStrength: z.enum(["strong", "partial", "limited"]).default("partial"),
    signalObserved: z.enum(["observed", "partial", "not_confirmed"]).default("partial"),
    extractionLimitation: z.string().max(240).optional(),
  })).default([]),
  mentionedVendors: z.array(z.string()).default([]),
  mentionedPurposes: z.array(z.string()).default([]),
  mentionedRights: z.array(z.string()).default([]),
  mentionedControls: z.array(z.string()).default([]),
  lastUpdatedText: z.string().optional(),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  artifactRefs: z.array(artifactRefSchema).default([]),
  assistMetadata: z.array(z.object({
    assistId: z.string(),
    modelAssistProvider: z.literal("nano"),
    assistType: z.enum([
      "link_classification",
      "topic_extraction",
      "vendor_mention_extraction",
      "policy_runtime_alignment",
    ]),
    inputEvidenceRefs: z.array(evidenceRefSchema).default([]),
    inputExcerptIds: z.array(z.string()).default([]),
    outputSchemaVersion: z.string(),
    confidence: confidenceSchema,
    uncertaintyNotes: z.array(z.string()).default([]),
    evidenceRefs: z.array(evidenceRefSchema).default([]),
    usedForFinalFinding: z.literal(false).default(false),
  })).default([]),
  confidence: confidenceSchema,
  directVsInferred: directVsInferredSchema.default("direct"),
});

export const normalizedVendorObservationSchema = z.object({
  observationId: z.string(),
  entity: z.string(),
  vendor: z.string(),
  product: z.string().optional(),
  purpose: z.enum([
    "analytics",
    "advertising",
    "session_replay",
    "consent_management",
    "tag_management",
    "infrastructure",
    "security",
    "performance_monitoring",
    "customer_support",
    "unknown",
  ]),
  confidence: confidenceSchema,
  basis: z.array(z.string()),
  regulatoryRelevance: z.array(z.string()).default([]),
  matchedEvidenceIds: z.array(z.string()).default([]),
  matchedEvidenceRefs: z.array(evidenceRefSchema).default([]),
  matchSources: z.array(z.object({
    source: vendorMatchSourceTypeSchema,
    sourceEventId: z.string().optional(),
    sourceEventType: z.string().optional(),
    sourceScanner: z.string().optional(),
    scenario: z.string().optional(),
    consentStateAtTime: consentStateSchema.optional(),
    matchedField: z.string(),
    matchedValueRedacted: z.string().optional(),
    matchedValueHash: z.string().optional(),
    resolverBasis: z.array(z.string()).default([]),
    confidence: confidenceSchema,
  })).default([]),
  matchedHostnames: z.array(z.string()).default([]),
  matchedUrls: z.array(z.string()).default([]),
  matchedCookieNames: z.array(z.string()).default([]),
});

export const cmpRuntimeSignalSchema = z.object({
  signalType: z.enum([
    "global",
    "dom_selector",
    "storage_key",
    "cookie_name",
    "script_url",
    "network_request",
  ]),
  matchedField: z.string(),
  matchedValueRedacted: z.string(),
  sourceEventId: z.string().optional(),
  sourceEventType: z.string().optional(),
  hostname: z.string().optional(),
  url: z.string().optional(),
  resolverBasis: z.array(z.string()).default([]),
  confidence: confidenceSchema,
});

export const cmpRuntimeObservationSchema = z.object({
  observationId: z.string(),
  observedAtMs: z.number().int().nonnegative(),
  sourceScanner: z.string(),
  scenario: z.string(),
  consentStateAtTime: consentStateSchema,
  vendorObservationId: z.string().optional(),
  entity: z.string(),
  vendor: z.string(),
  product: z.string().optional(),
  signals: z.array(cmpRuntimeSignalSchema).default([]),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  confidence: confidenceSchema,
  directVsInferred: directVsInferredSchema.default("direct"),
});

export const observedBehaviorSchema = z.enum([
  "third_party_request_observed",
  "script_loaded",
  "tag_manager_observed",
  "iframe_loaded",
  "cookie_set",
  "cookie_sent",
  "storage_written",
  "collection_endpoint_observed",
  "library_loaded_only",
  "identifier_parameter_observed",
  "advertising_click_id_observed",
  "session_replay_library_observed",
  "session_replay_collection_observed",
  "consent_management_observed",
]);

export const journeyEventRefSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  timestampMs: z.number().int().nonnegative(),
  url: z.string().optional(),
  label: z.string().optional(),
  behavior: observedBehaviorSchema.optional(),
  firstParty: z.boolean().optional(),
  thirdParty: z.boolean().optional(),
  scenario: z.string().optional(),
  consentStateAtTime: consentStateSchema.optional(),
  endpointGeographyStatus: endpointGeographyStatusSchema.optional(),
  endpointGeographyRegion: z.string().max(80).optional(),
  endpointGeographyProvider: z.string().max(80).optional(),
  endpointGeographyLocationLabel: z.string().max(120).optional(),
  endpointGeographyJurisdiction: z.string().max(24).optional(),
  endpointGeographyPrecision: endpointGeographyPrecisionSchema.optional(),
  endpointGeographyBasis: z.array(z.string().max(120)).optional(),
});

export const observedJourneySchema = z.object({
  journeyId: z.string(),
  journeyType: z.enum(["vendor", "product", "cookie", "script", "endpoint", "tracker"]),
  key: z.string(),
  displayName: z.string(),
  entity: z.string().optional(),
  vendor: z.string().optional(),
  product: z.string().optional(),
  purpose: normalizedVendorObservationSchema.shape.purpose.optional(),
  sourceScanner: z.string(),
  scenariosObserved: z.array(z.string()).default([]),
  firstObservedAtMs: z.number().int().nonnegative(),
  lastObservedAtMs: z.number().int().nonnegative(),
  firstObservedConsentState: consentStateSchema,
  consentStatesObserved: z.array(consentStateSchema).default([]),
  firstPartyOrThirdParty: z.enum(["first_party", "third_party", "mixed", "unknown"]),
  entryPoint: z.string().optional(),
  entryPointSourceEventId: z.string().optional(),
  relatedCookies: z.array(z.string()).default([]),
  relatedScripts: z.array(z.string()).default([]),
  relatedEndpoints: z.array(z.string()).default([]),
  relatedVendors: z.array(z.string()).default([]),
  relatedVendorObservationIds: z.array(z.string()).default([]),
  observedBehaviors: z.array(observedBehaviorSchema).default([]),
  endpointSubtype: endpointSubtypeSchema.optional(),
  attributionStatus: endpointAttributionStatusSchema.optional(),
  attributionReason: z.string().optional(),
  resolverBasis: z.array(z.string()).optional(),
  endpointGeographyStatus: endpointGeographyStatusSchema.optional(),
  endpointGeographyRegion: z.string().max(80).optional(),
  endpointGeographyProvider: z.string().max(80).optional(),
  endpointGeographyLocationLabel: z.string().max(120).optional(),
  endpointGeographyJurisdiction: z.string().max(24).optional(),
  endpointGeographyPrecision: endpointGeographyPrecisionSchema.optional(),
  endpointGeographyBasis: z.array(z.string().max(120)).optional(),
  relatedEvidenceRefs: z.array(evidenceRefSchema).optional(),
  eventRefs: z.array(journeyEventRefSchema).default([]),
  phaseDeltas: z.array(journeyPhaseDeltaSchema).default([]),
  confidence: confidenceSchema,
  directVsInferred: directVsInferredSchema,
  evidenceRefs: z.array(evidenceRefSchema).default([]),
});

export const journeySummarySchema = z.object({
  journeyCount: z.number().int().nonnegative().default(0),
  vendorJourneyCount: z.number().int().nonnegative().default(0),
  productJourneyCount: z.number().int().nonnegative().default(0),
  trackerJourneyCount: z.number().int().nonnegative().default(0),
  cookieJourneyCount: z.number().int().nonnegative().default(0),
  scriptJourneyCount: z.number().int().nonnegative().default(0),
  endpointJourneyCount: z.number().int().nonnegative().default(0),
  activeCollectionJourneyCount: z.number().int().nonnegative().default(0),
  consentManagementJourneyCount: z.number().int().nonnegative().default(0),
  notes: z.array(z.string()).default([]),
});

export const derivedRuntimeSignalsSchema = z.object({
  thirdPartyVendorsObserved: z.boolean().default(false),
  preConsentTrackingObserved: z.boolean().default(false),
  thirdPartyCookiesPreConsentObserved: z.boolean().default(false),
  consentBannerLikelyPresent: z.boolean().optional(),
  sessionReplayOrBehavioralAnalyticsObserved: z.boolean().default(false),
  journeySummary: journeySummarySchema.optional(),
  notes: z.array(z.string()).default([]),
});

export const runtimeCoverageSummarySchema = z.object({
  coverageStatus: z.enum(["usable", "limited_partial", "limited_none", "not_applicable"]),
  limitationKeys: z.array(z.string()).default([]),
  fallbackModesUsed: z.array(z.enum(["headed", "headless_retry", "alternate_channel"])).default([]),
  observationCounts: z.object({
    networkEvents: z.number().int().nonnegative().default(0),
    thirdPartyRequests: z.number().int().nonnegative().default(0),
    cookieEvents: z.number().int().nonnegative().default(0),
    cookiesBeforeConsent: z.number().int().nonnegative().default(0),
    normalizedVendors: z.number().int().nonnegative().default(0),
    observedJourneys: z.number().int().nonnegative().default(0),
  }),
  silentEmpty: z.boolean().default(false),
  notes: z.array(z.string()).default([]),
});

export const consentSurfaceInspectionOutcomeSchema = z.object({
  outcome: z.enum([
    "actionable_surface_observed",
    "non_actionable_surface_observed",
    "no_surface_observed_complete_coverage",
    "indeterminate_limited_coverage",
  ]),
  coverageStatus: z.enum(["complete", "limited"]),
  inspectionCompleted: z.boolean(),
  inspectedPreInteraction: z.literal(true),
  consentSurfaceObserved: z.boolean(),
  actionableControlObserved: z.boolean(),
  observedAtMs: z.number().int().nonnegative().nullable(),
  evidenceSources: z.array(z.enum([
    "consent_ui_observation",
    "control_inventory",
    "cmp_runtime",
    "dom_snapshot",
    "visual_capture",
  ])).max(5),
  limitationKeys: z.array(z.string().max(120)).max(16).default([]),
});

export function deriveConsentSurfaceInspectionOutcome(input: {
  cmpRuntimeObservations?: z.infer<typeof cmpRuntimeObservationSchema>[];
  consentUiObservations?: z.infer<typeof consentUiObservationSchema>[];
  domSnapshots?: z.infer<typeof domSnapshotArtifactSchema>[];
  modulesRun?: z.infer<typeof scanModuleRunSchema>[];
  runtimeCoverage?: z.infer<typeof runtimeCoverageSummarySchema>;
  screenshots?: z.infer<typeof screenshotArtifactSchema>[];
  visualCapture?: z.infer<typeof visualCaptureSummarySchema>;
}) {
  const observations = input.consentUiObservations ?? [];
  const visibleObservation = observations
    .filter((observation) => observation.likelyPresent)
    .sort((left, right) => left.observedAtMs - right.observedAtMs)[0] ?? null;
  const latestObservation = observations
    .slice()
    .sort((left, right) => right.observedAtMs - left.observedAtMs)[0] ?? null;
  const actionableControlObserved = observations.some((observation) =>
    observation.layerInspected === "first_layer" &&
    (
      observation.acceptControlObserved ||
      observation.rejectControlObserved ||
      observation.managePreferencesControlObserved ||
      observation.controls.some((control) =>
        control.visible !== false &&
        ["accept_all", "reject_all", "manage_preferences", "save_preferences"].includes(control.actionType)
      )
    )
  );
  const consentSurfaceObserved = Boolean(visibleObservation || (input.cmpRuntimeObservations ?? []).length > 0);
  const preConsentRun = (input.modulesRun ?? []).find((moduleRun) => moduleRun.moduleName === "preConsentRuntimeScanner");
  const observationFailed = observations.length === 0 || observations.some((observation) =>
    observation.basis.includes("bounded_capture_timeout_or_failure") ||
    observation.basis.includes("inventory:probe_failed") ||
    observation.basis.includes("geometry_capture_unavailable")
  );
  const settledInventoryCompleted = observations.some((observation) =>
    observation.basis.includes("settled_control_inventory_completed")
  );
  const materialLimitationKeys = (input.runtimeCoverage?.limitationKeys ?? []).filter(
    (key) => key !== "post_consent_flow_runtime_disabled"
  );
  const retainedVisualOrDomEvidence =
    input.visualCapture?.status === "available" ||
    (input.screenshots ?? []).some((artifact) => artifact.consentStateAtTime === "pre_consent") ||
    (input.domSnapshots ?? []).some((artifact) => artifact.consentStateAtTime === "pre_consent");
  const inspectionLimitationKeys = [
    ...materialLimitationKeys,
    !preConsentRun ? "consent_surface_inspection_runtime_not_run" : null,
    preConsentRun && preConsentRun.status !== "completed"
      ? `consent_surface_inspection_runtime_${preConsentRun.status}`
      : null,
    observations.length === 0 ? "consent_surface_inspection_observation_missing" : null,
    observationFailed ? "consent_surface_inspection_observation_incomplete" : null,
    !consentSurfaceObserved && !settledInventoryCompleted
      ? "consent_surface_inspection_settled_inventory_missing"
      : null,
    !retainedVisualOrDomEvidence ? "consent_surface_inspection_visual_or_dom_missing" : null,
  ].filter((value): value is string => value !== null)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 16);
  const inspectionCompleted =
    preConsentRun?.status === "completed" &&
    input.runtimeCoverage?.coverageStatus !== "limited_none" &&
    input.runtimeCoverage?.coverageStatus !== "not_applicable" &&
    inspectionLimitationKeys.length === 0;
  const coverageStatus = inspectionCompleted ? "complete" as const : "limited" as const;
  const evidenceSources = [
    observations.length > 0 ? "consent_ui_observation" as const : null,
    actionableControlObserved ? "control_inventory" as const : null,
    (input.cmpRuntimeObservations ?? []).length > 0 ? "cmp_runtime" as const : null,
    (input.domSnapshots ?? []).some((artifact) => artifact.consentStateAtTime === "pre_consent") ? "dom_snapshot" as const : null,
    retainedVisualOrDomEvidence && (
      input.visualCapture?.status === "available" ||
      (input.screenshots ?? []).some((artifact) => artifact.consentStateAtTime === "pre_consent")
    ) ? "visual_capture" as const : null,
  ].filter((value): value is NonNullable<typeof value> => value !== null);
  const outcome = consentSurfaceObserved
    ? actionableControlObserved
      ? "actionable_surface_observed" as const
      : "non_actionable_surface_observed" as const
    : inspectionCompleted
      ? "no_surface_observed_complete_coverage" as const
      : "indeterminate_limited_coverage" as const;

  return consentSurfaceInspectionOutcomeSchema.parse({
    outcome,
    coverageStatus,
    inspectionCompleted,
    inspectedPreInteraction: true,
    consentSurfaceObserved,
    actionableControlObserved,
    observedAtMs: visibleObservation?.observedAtMs ?? latestObservation?.observedAtMs ?? null,
    evidenceSources,
    limitationKeys: inspectionLimitationKeys,
  });
}

export const visualAccessReviewSchema = z.object({
  artifact_ref: z.string().max(160).nullable().optional(),
  artifactRef: z.string().max(160).nullable().optional(),
  confidence: confidenceSchema,
  go_no_go: z.enum(["GO", "NO_GO"]),
  goNoGo: z.enum(["GO", "NO_GO"]).optional(),
  key_visual_evidence: z.array(z.string().max(360)).max(6).default([]),
  keyVisualEvidence: z.array(z.string().max(360)).max(6).optional(),
  page_state: z.enum([
    "access_blocked",
    "auth_or_login_wall",
    "blank_or_unusable",
    "captcha_or_challenge",
    "capture_failed",
    "challenge_or_robot_page",
    "degraded_but_useful",
    "maintenance_or_unavailable",
    "missing_visual_artifact",
    "parked_or_placeholder",
    "visual_error_shell",
    "wrong_site_or_soft_404",
  ]),
  pageState: z.string().max(80).optional(),
  reason_code: z.string().max(120),
  reasonCode: z.string().max(120).optional(),
  short_explanation: z.string().max(500),
  shortExplanation: z.string().max(500).optional(),
  status: z.enum(["available", "missing_visual_artifact"]),
  version: z.literal("visual-access-review-v1"),
});

export const scanNoGoAssessmentSchema = z.object({
  status: z.enum(["available"]),
  version: z.literal("scan-no-go-assessment-v1"),
  decision: z.enum(["no_go", "continue_with_diagnostics"]),
  scanNoGoConfidence: confidenceSchema,
  visualScreenshotNoGoConfidence: confidenceSchema.optional(),
  reasonCodes: z.array(z.string().max(120)).max(16).default([]),
  corroboratorCodes: z.array(z.string().max(120)).max(16).default([]),
  contradictorCodes: z.array(z.string().max(120)).max(16).default([]),
  supportingSignals: z.record(z.union([
    z.boolean(),
    z.number(),
    z.string().max(160),
    z.null(),
  ])).default({}),
  evidenceRefs: z.array(z.string().max(160)).max(16).default([]),
});

export const evidenceExcerptKindSchema = z.enum([
  "network_request",
  "network_response",
  "cookie_set",
  "cookie_sent",
  "script_loaded",
  "iframe_loaded",
  "storage_observed",
  "consent_ui_observed",
  "screenshot",
  "dom_snapshot",
  "policy_surface_placeholder",
]);

export const displaySafeEvidenceExcerptSchema = z.object({
  excerptId: z.string(),
  sourceEventId: z.string().optional(),
  sourceEventType: z.string().optional(),
  sourceScanner: z.string().optional(),
  scenario: z.string().optional(),
  consentStateAtTime: consentStateSchema.optional(),
  pagePhase: pagePhaseSchema.optional(),
  observedAtMs: z.number().int().nonnegative().optional(),
  evidenceKind: evidenceExcerptKindSchema,
  displayLabel: z.string(),
  displayValueRedacted: z.string().optional(),
  hostname: z.string().optional(),
  path: z.string().optional(),
  queryParamNames: z.array(z.string()).default([]),
  cookieNames: z.array(z.string()).default([]),
  headerNames: z.array(z.string()).default([]),
  vendorRef: z.string().optional(),
  journeyId: z.string().optional(),
  artifactRefs: z.array(artifactRefSchema).default([]),
  sensitivity: z.enum(["safe", "redacted", "internal_only"]).default("safe"),
  redactionReason: z.string().optional(),
  confidence: confidenceSchema,
  directVsInferred: directVsInferredSchema,
});

export const canonicalEvidenceBundleSchema = z.object({
  scanId: z.string(),
  url: z.string(),
  normalizedUrl: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  region: z.string().optional(),
  scanProfile: scanProfileSchema,
  modulesRun: z.array(scanModuleRunSchema),
  runtimeTimeline: z.array(runtimeEvidenceEventSchema),
  networkEvents: z.array(networkEventSchema),
  networkResponseEvents: z.array(networkResponseEventSchema).default([]),
  cookieEvents: z.array(cookieEventSchema),
  cookieSnapshots: z.array(cookieSnapshotSchema),
  storageSnapshots: z.array(storageSnapshotSchema),
  scriptEvents: z.array(scriptEventSchema),
  iframeEvents: z.array(iframeEventSchema),
  consentUiObservations: z.array(consentUiObservationSchema),
  collectionSurfaceObservations: z.array(collectionSurfaceObservationSchema).default([]),
  consentInteractionEvents: z.array(consentInteractionEventSchema).default([]),
  consentFlowObservations: z.array(consentFlowObservationSchema).default([]),
  consentActionCandidates: z.array(consentActionCandidateSchema).default([]),
  consentActionAttempts: z.array(consentActionAttemptSchema).default([]),
  consentFlowComparisons: z.array(consentFlowComparisonSchema).default([]),
  policySurfaceObservations: z.array(policySurfaceObservationSchema).default([]),
  transportSecurityObservations: z.array(transportSecurityObservationSchema).default([]),
  cmpRuntimeObservations: z.array(cmpRuntimeObservationSchema).default([]),
  screenshots: z.array(screenshotArtifactSchema),
  domSnapshots: z.array(domSnapshotArtifactSchema),
  normalizedVendorObservations: z.array(normalizedVendorObservationSchema),
  observedJourneys: z.array(observedJourneySchema).default([]),
  derivedRuntimeSignals: derivedRuntimeSignalsSchema,
  runtimeCoverage: runtimeCoverageSummarySchema.optional(),
  consentSurfaceInspection: consentSurfaceInspectionOutcomeSchema.optional(),
  visualCapture: visualCaptureSummarySchema.optional(),
  scanNoGoAssessment: scanNoGoAssessmentSchema.optional(),
  scan_no_go_assessment: scanNoGoAssessmentSchema.optional(),
  visualAccessReview: visualAccessReviewSchema.optional(),
  visual_access_review: visualAccessReviewSchema.optional(),
  artifactRefs: z.array(artifactRefSchema),
  scannerVersion: z.string(),
  schemaVersion: z.string(),
});

export const endpointEnrichmentOverlayEntrySchema = z.object({
  basis: z.array(z.string().max(120)).default([]),
  dnsCnameChain: z.array(z.string().max(255)).default([]),
  endpointGeographyJurisdiction: z.string().max(24).optional(),
  endpointGeographyLocationLabel: z.string().max(120).optional(),
  endpointGeographyPrecision: endpointGeographyPrecisionSchema.optional(),
  endpointGeographyProvider: z.string().max(80).optional(),
  endpointGeographyRegion: z.string().max(80).optional(),
  endpointGeographyStatus: endpointGeographyStatusSchema,
  hostname: z.string().max(255),
  registryObservationCount: z.number().int().nonnegative().optional(),
});

export const endpointEnrichmentOverlaySchema = z.object({
  overlayVersion: z.literal("certscore.endpoint_enrichment_overlay.1"),
  generatedAt: z.string(),
  sourceBundleScanId: z.string(),
  sourceRegistryUpdatedAt: z.string().optional(),
  endpointOverlays: z.array(endpointEnrichmentOverlayEntrySchema).default([]),
});

export const findingEligibilityResultSchema = z.object({
  status: z.enum(["eligible", "not_eligible", "deferred"]),
  reasons: z.array(z.string()).default([]),
});

export const coverageLimitationSchema = z.object({
  limitationKey: z.string(),
  description: z.string(),
  affectedFindingKeys: z.array(z.string()).default([]),
  sourceModulesRequired: z.array(z.string()).default([]),
  sourceModulesPresent: z.array(z.string()).default([]),
});

export const findingCandidateSchema = z.object({
  findingKey: z.string(),
  title: z.string(),
  eligibility: findingEligibilityResultSchema,
  matchedCriteria: z.array(z.string()).default([]),
  missingCorroborators: z.array(z.string()).default([]),
  demotionReasons: z.array(z.string()).default([]),
  confidence: confidenceSchema,
  directVsInferred: directVsInferredSchema,
  sourceEvidenceRefs: z.array(evidenceRefSchema).default([]),
  evidenceExcerptIds: z.array(z.string()).default([]),
  relatedVendors: z.array(normalizedVendorObservationSchema).default([]),
  sourceModulesRequired: z.array(z.string()).default([]),
  sourceModulesPresent: z.array(z.string()).default([]),
  coverageLimitations: z.array(coverageLimitationSchema).default([]),
});

export const reportProjectionSchema = z.object({
  projectionVersion: z.string(),
  generatedAt: z.string(),
  findingKeys: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export const regulatoryReviewRowStatusSchema = z.enum([
  "checked",
  "gap_observed",
  "review_signal",
  "not_observed",
  "not_testable",
  "not_applicable",
  "litigation_risk_signal",
]);

export const regulatoryReviewEvidenceCapabilitySchema = z.enum([
  "currently_supported",
  "near_term_supported",
  "policy_mapping_only",
]);

export const regulatoryReviewRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  note: z.string(),
  status: regulatoryReviewRowStatusSchema,
  evidenceCapability: regulatoryReviewEvidenceCapabilitySchema,
  evidenceRefs: z.array(z.string()).default([]),
  regulatoryMapping: z.array(z.string()).default([]),
  sourceFindingKeys: z.array(z.string()).default([]),
  missingOrIncompleteSourceSignals: z.array(z.string()).default([]),
});

export const regulatoryReviewAreaSchema = z.object({
  id: z.string(),
  navLabel: z.string(),
  title: z.string(),
  subtitle: z.string(),
  summary: z.string(),
  maturityLabel: z.enum(["Alpha", "Beta"]).default("Beta"),
  rows: z.array(regulatoryReviewRowSchema),
  sourceStage: z.literal("certscore-review-engine"),
});

export const regulatoryReviewOutputSchema = z.object({
  reviewVersion: z.literal("certscore.v2.regulatory_review.1"),
  generatedAt: z.string(),
  sourceReviewId: z.string(),
  scanId: z.string(),
  url: z.string(),
  areas: z.array(regulatoryReviewAreaSchema),
  notes: z.array(z.string()).default([]),
});

export const reviewResultSchema = z.object({
  reviewId: z.string(),
  scanId: z.string(),
  url: z.string(),
  reviewedAt: z.string(),
  schemaVersion: z.string(),
  sourceBundleSchemaVersion: z.string(),
  sourceModulesPresent: z.array(z.string()).default([]),
  findingCandidates: z.array(findingCandidateSchema),
  evidenceExcerpts: z.array(displaySafeEvidenceExcerptSchema).default([]),
  coverageLimitations: z.array(coverageLimitationSchema).default([]),
  reportProjection: reportProjectionSchema.optional(),
  regulatoryReview: regulatoryReviewOutputSchema.optional(),
});

export type DirectVsInferred = z.infer<typeof directVsInferredSchema>;
export type ConsentState = z.infer<typeof consentStateSchema>;
export type EndpointAttributionStatus = z.infer<typeof endpointAttributionStatusSchema>;
export type EndpointGeographyStatus = z.infer<typeof endpointGeographyStatusSchema>;
export type EndpointGeographyPrecision = z.infer<typeof endpointGeographyPrecisionSchema>;
export type EndpointSubtype = z.infer<typeof endpointSubtypeSchema>;
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
export type ArtifactRef = z.infer<typeof artifactRefSchema>;
export type EvidenceExcerptKind = z.infer<typeof evidenceExcerptKindSchema>;
export type DisplaySafeEvidenceExcerpt = z.infer<typeof displaySafeEvidenceExcerptSchema>;
export type VendorMatchSourceType = z.infer<typeof vendorMatchSourceTypeSchema>;
export type ScanProfile = z.infer<typeof scanProfileSchema>;
export type ScanMetadata = z.infer<typeof scanMetadataSchema>;
export type ScanModuleRun = z.infer<typeof scanModuleRunSchema>;
export type RuntimeEvidenceEvent = z.infer<typeof runtimeEvidenceEventSchema>;
export type NetworkEvent = z.infer<typeof networkEventSchema>;
export type NetworkResponseEvent = z.infer<typeof networkResponseEventSchema>;
export type CookieEvent = z.infer<typeof cookieEventSchema>;
export type SetCookieMetadata = z.infer<typeof setCookieMetadataSchema>;
export type CookieSnapshot = z.infer<typeof cookieSnapshotSchema>;
export type StorageSnapshot = z.infer<typeof storageSnapshotSchema>;
export type ScriptEvent = z.infer<typeof scriptEventSchema>;
export type IframeEvent = z.infer<typeof iframeEventSchema>;
export type ConsentUiObservation = z.infer<typeof consentUiObservationSchema>;
export type CollectionSurfaceObservation = z.infer<typeof collectionSurfaceObservationSchema>;
export type ConsentInteractionEvent = z.infer<typeof consentInteractionEventSchema>;
export type ConsentFlowScenario = z.infer<typeof consentFlowScenarioSchema>;
export type ConsentScenarioPlanningMode = z.infer<typeof consentScenarioPlanningModeSchema>;
export type ConsentScenarioPolicyPlanningStatus = z.infer<typeof consentScenarioPolicyPlanningStatusSchema>;
export type ConsentScenarioStatus = z.infer<typeof consentScenarioStatusSchema>;
export type ConsentScenarioSkipReason = z.infer<typeof consentScenarioSkipReasonSchema>;
export type ConsentActionType = z.infer<typeof consentActionTypeSchema>;
export type ConsentActionCandidate = z.infer<typeof consentActionCandidateSchema>;
export type ConsentActionAttempt = z.infer<typeof consentActionAttemptSchema>;
export type ConsentFlowObservation = z.infer<typeof consentFlowObservationSchema>;
export type ConsentFlowComparison = z.infer<typeof consentFlowComparisonSchema>;
export type ConsentScenarioPlanArtifact = z.infer<typeof consentScenarioPlanArtifactSchema>;
export type ConsentScenarioExecutionArtifact = z.infer<typeof consentScenarioExecutionArtifactSchema>;
export type ConsentFlowTraceArtifact = z.infer<typeof consentFlowTraceArtifactSchema>;
export type ConsentScenarioShadowCompareArtifact = z.infer<typeof consentScenarioShadowCompareArtifactSchema>;
export type ConsentActionRecipeResearchArtifact = z.infer<typeof consentActionRecipeResearchArtifactSchema>;
export type JourneyPhaseDelta = z.infer<typeof journeyPhaseDeltaSchema>;
export type ScreenshotArtifact = z.infer<typeof screenshotArtifactSchema>;
export type VisualCaptureSummary = z.infer<typeof visualCaptureSummarySchema>;
export type DomSnapshotArtifact = z.infer<typeof domSnapshotArtifactSchema>;
export type PolicySurfaceObservation = z.infer<typeof policySurfaceObservationSchema>;
export type NormalizedVendorObservation = z.infer<
  typeof normalizedVendorObservationSchema
>;
export type CmpRuntimeSignal = z.infer<typeof cmpRuntimeSignalSchema>;
export type CmpRuntimeObservation = z.infer<typeof cmpRuntimeObservationSchema>;
export type TransportSecurityObservation = z.infer<typeof transportSecurityObservationSchema>;
export type DerivedRuntimeSignals = z.infer<typeof derivedRuntimeSignalsSchema>;
export type RuntimeCoverageSummary = z.infer<typeof runtimeCoverageSummarySchema>;
export type ConsentSurfaceInspectionOutcome = z.infer<typeof consentSurfaceInspectionOutcomeSchema>;
export type ScanNoGoAssessment = z.infer<typeof scanNoGoAssessmentSchema>;
export type VisualAccessReview = z.infer<typeof visualAccessReviewSchema>;
export type ObservedBehavior = z.infer<typeof observedBehaviorSchema>;
export type JourneyEventRef = z.infer<typeof journeyEventRefSchema>;
export type ObservedJourney = z.infer<typeof observedJourneySchema>;
export type JourneySummary = z.infer<typeof journeySummarySchema>;
export type CanonicalEvidenceBundle = z.infer<typeof canonicalEvidenceBundleSchema>;
export type EndpointEnrichmentOverlay = z.infer<typeof endpointEnrichmentOverlaySchema>;
export type EndpointEnrichmentOverlayEntry = z.infer<typeof endpointEnrichmentOverlayEntrySchema>;
export type FindingCandidate = z.infer<typeof findingCandidateSchema>;
export type FindingEligibilityResult = z.infer<
  typeof findingEligibilityResultSchema
>;
export type CoverageLimitation = z.infer<typeof coverageLimitationSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;
export type ReportProjection = z.infer<typeof reportProjectionSchema>;
export type RegulatoryReviewRowStatus = z.infer<typeof regulatoryReviewRowStatusSchema>;
export type RegulatoryReviewEvidenceCapability = z.infer<typeof regulatoryReviewEvidenceCapabilitySchema>;
export type RegulatoryReviewRow = z.infer<typeof regulatoryReviewRowSchema>;
export type RegulatoryReviewArea = z.infer<typeof regulatoryReviewAreaSchema>;
export type RegulatoryReviewOutput = z.infer<typeof regulatoryReviewOutputSchema>;

export const SCHEMA_VERSION = "certscore.v2.alpha.1";
