export type RuntimeMode =
  | "playwright-local"
  | "playwright-cdp"
  | "playwright-remote-cdp"
  | "selenium-chrome";

export type RunClassification =
  | "edge_block"
  | "verification_interstitial"
  | "error_404"
  | "error_502"
  | "dns_failure"
  | "origin_timeout"
  | "connection_closed"
  | "partial_html"
  | "early_runtime"
  | "full_runtime"
  | "unknown";

export type PhaseReached =
  | "navigation_started"
  | "main_document"
  | "dom_content_loaded"
  | "page_title"
  | "html_snapshot"
  | "first_party_subresources"
  | "third_party_signals";

export type VendorCategory = "analytics" | "advertising" | "functional" | "unknown";

export type NavigationOutcome = "ok" | "error" | "timeout";

export type ConsoleLevel = "log" | "info" | "warning" | "error" | "debug" | "unknown";

export type FingerprintingAttributeCategory =
  | "audio"
  | "canvas_webgl"
  | "fonts_plugins"
  | "hardware"
  | "input_touch"
  | "media_devices"
  | "network_device_state"
  | "screen_viewport"
  | "storage"
  | "timezone_locale";

export type RequestRecord = {
  id: string;
  frameUrl: string | null;
  initiatorType: string | null;
  initiatorUrl: string | null;
  method: string;
  resourceType: string | null;
  timestampMs: number;
  url: string;
};

export type ResponseRecord = {
  frameUrl: string | null;
  headers: Record<string, string> | null;
  requestId: string | null;
  resourceType: string | null;
  setCookieHeaders: string[] | null;
  status: number | null;
  timestampMs: number;
  url: string;
};

export type RedirectRecord = {
  from: string;
  status: number | null;
  timestampMs: number;
  to: string;
};

export type CookieRecord = {
  domain: string | null;
  expires: number | null;
  httpOnly: boolean | null;
  name: string;
  path: string | null;
  sameSite: string | null;
  secure: boolean | null;
  valuePreview: string;
};

export type CookieSnapshot = {
  cookieCount: number;
  cookies: CookieRecord[];
  label: "0.5s" | "2s" | "5s" | "10s" | "final";
  timestampMs: number;
};

export type CookieDiffRecord = {
  appeared: Array<{
    cookieDomain: string | null;
    cookieName: string;
    firstSeenTimestampMs: number;
  }>;
  fromLabel: CookieSnapshot["label"] | "start";
  toLabel: CookieSnapshot["label"];
};

export type ConsoleRecord = {
  level: ConsoleLevel;
  text: string;
  timestampMs: number;
};

export type PageErrorRecord = {
  message: string;
  stack: string | null;
  timestampMs: number;
};

export type VendorSummary = {
  categories: Record<VendorCategory, number>;
  normalizedVendors: string[];
  rawDomains: string[];
  vendorCounts: Record<string, number>;
};

export type PreConsentVendorSummary = {
  categories: Record<VendorCategory, number>;
  normalizedVendors: string[];
  vendorCounts: Record<string, number>;
};

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export type SignalFinding = {
  category: "cookie" | "vendor" | "timeline";
  evidence: string[];
  severity: FindingSeverity;
  title: string;
};

export type FindingStatus = "confirmed" | "likely" | "possible" | "not_observed" | "inconclusive";

export type FindingPacketItem = {
  confidence: number;
  cookieNames: string[];
  evidence: string[];
  firstSeenTimestampMs: number | null;
  id: string;
  kind: "cookie" | "vendor" | "timeline" | "consent_ui" | "reject_persistence" | "cname";
  requestHosts: string[];
  severity: FindingSeverity | "none";
  sourceArtifacts: string[];
  status: FindingStatus;
  title: string;
  vendorNames: string[];
};

export type FindingPacket = {
  generatedAt: string;
  items: FindingPacketItem[];
  summary: {
    confirmed: number;
    inconclusive: number;
    likely: number;
    notObserved: number;
    possible: number;
  };
  targetUrl: string;
};

export type ConsentUiSummary = {
  acceptPresent: boolean;
  detected: boolean;
  firstDetectedTimestampMs: number | null;
  managePresent: boolean;
  rejectPresent: boolean;
  selectorHint: string | null;
  textSnippet: string | null;
};

export type PreConsentRequestRecord = {
  category: VendorCategory;
  resourceType: string | null;
  timestampMs: number;
  url: string;
  vendorName: string | null;
  beforeConsentUi: boolean | null;
};

export type CookieDetectionRecord = {
  cookieDomain: string | null;
  cookieName: string;
  firstSeenTimestampMs: number;
  valuePreview: string;
};

export type LeakMapRecord = {
  category: VendorCategory;
  endpointHostname: string;
  firstSeenTimestampMs: number;
  requestCount: number;
  vendorName: string | null;
};

export type DomainVendorRegistryRecord = {
  beforeConsentUiRequestCount: number;
  beforeConsentUiSetCookieResponseCount: number;
  category: VendorCategory;
  cnameChain: string[] | null;
  cnameMatchedTrackerHost: string | null;
  cnameMatchedVendor: string | null;
  endpointHostname: string;
  firstSeenTimestampMs: number;
  initiatorTypes: string[];
  isCnameCloaked: boolean;
  isHighSignalVendor: boolean;
  requestCount: number;
  responseCount: number;
  resourceTypes: string[];
  sampleUrls: string[];
  setCookieResponseCount: number;
  vendorName: string | null;
};

export type ConsentSignalTimingSummary = {
  earliestSignalTimestampMs: number | null;
  firstConsentUiTimestampMs: number | null;
  firstCookieTimestampMs: number | null;
  firstHighSignalCookieTimestampMs: number | null;
  firstThirdPartyRequestTimestampMs: number | null;
  signalsPrecededConsentUi: "yes" | "no" | "inconclusive";
};

export type CookieRiskSummaryRecord = {
  confidence: number;
  cookieDomains: string[];
  cookieNames: string[];
  firstSeenTimestampMs: number | null;
  id: string;
  observed: boolean;
  severity: FindingSeverity;
  title: string;
  vendorNames: string[];
  beforeConsentUi: "yes" | "no" | "inconclusive";
};

export type RunQualitySummary = {
  blockerInterference: boolean;
  evidenceDepth: "thin" | "moderate" | "full";
  likelySufficientForFindings: boolean;
  overallConfidence: number;
  rationale: string[];
  usedEscalation: boolean;
};

export type FingerprintingCategorySignal = {
  firstSeenMs: number;
  hits: number;
  name: FingerprintingAttributeCategory;
};

export type FingerprintingCollectionPattern = "isolated" | "multi_category_burst" | "multi_stage";

export type FingerprintingRawSignalSummary = {
  attributeCategories: FingerprintingCategorySignal[];
  attributeCategoryCount: number;
  burstDetected: boolean;
  collectionPattern: FingerprintingCollectionPattern;
  firstPartyInvolved: boolean | null;
  identifierShapingDetected: boolean;
  knownBotLibraryMatch: string | null;
  knownFingerprintLibraryMatch: string | null;
  networkAfterCollection: boolean;
  preConsent: "true" | "false" | "unknown";
  thirdPartyInvolved: boolean | null;
  thirdPartyAfterCollection: boolean;
};

export type FingerprintingSummary = {
  confidence: "low" | "medium" | "high";
  reasons: string[];
  signals: FingerprintingRawSignalSummary;
  summary: string;
  tier: 0 | 1 | 2 | 3;
};

export type FingerprintingCollectorSnapshot = {
  categories: Array<{
    firstSeenMs: number | null;
    hits: number;
    name: string;
  }>;
  eventSamples: Array<{
    api: string;
    category: string;
    scriptOrigin: "first_party" | "third_party" | "unknown";
    tsMs: number;
  }>;
  identifierShapingDetected: boolean;
  knownBotLibraryMatch: string | null;
  knownFingerprintLibraryMatch: string | null;
};

export type NetworkSummary = {
  collectionEndpointCount: number;
  deviceDataLikeRequestCount: number;
  firstPartyRequestCount: number;
  identifierLikeRequestCount: number;
  preConsentRequestCount: number;
  preConsentThirdPartyRequestCount: number;
  redirectCount: number;
  requestBurstScore: "low" | "medium" | "high";
  requestTypeCounts: Record<"beacon" | "document" | "fetch" | "iframe" | "image" | "other" | "script" | "xhr", number>;
  suspiciousQueryKeyCount: number;
  thirdPartyDomainCount: number;
  thirdPartyIdentifierLikeRequestCount: number;
  thirdPartyRequestCount: number;
  thirdPartyScriptCount: number;
  totalRequestCount: number;
};

export type RequestObservation = {
  deviceDataLike: boolean;
  domain: string;
  frameContext: "iframe" | "top_frame" | "unknown";
  identifierLike: boolean;
  loadTimeMs: number | null;
  mimeType: string | null;
  pathSample: string;
  queryKeysSample: string[];
  requestSizeBytes: number | null;
  resourceType: string | null;
  responseSizeBytes: number | null;
  responseTimeMs: number | null;
  scriptInitiator: string | null;
  statusCode: number | null;
  thirdParty: boolean;
  tsMs: number;
};

export type VendorSummaryExtended = {
  ambiguousVendorCount: number;
  normalizedVendors: string[];
  postInteractionOnlyVendorCount: number;
  preConsentVendorCount: number;
  rawThirdPartyDomains: string[];
  vendorCategoryCounts: Record<
    "ads" | "analytics" | "cdn_infra" | "fraud_security" | "identity" | "personalization" | "session_replay" | "social" | "unknown",
    number
  >;
};

export type RequestToVendorObservation = {
  category: keyof VendorSummaryExtended["vendorCategoryCounts"];
  confidence: "low" | "medium" | "high";
  evidenceSource: "hostname" | "path" | "script_url" | "signature";
  hostname: string;
  preConsent: boolean | null;
  vendor: string;
};

export type ConsentSummary = {
  acceptPresent: boolean;
  bannerDisappearedWithoutChoice: boolean | null;
  bannerPresent: boolean;
  clicksToAccept: number | null;
  clicksToReject: number | null;
  closePresent: boolean | null;
  cmpDetected: boolean;
  contentObstructed: boolean | null;
  cookieWallDetected: boolean | null;
  firstVisibleMs: number | null;
  managePresent: boolean;
  pageInteractionBlocked: boolean | null;
  precheckedCategoryCount: number | null;
  precheckedCategoryLabels: string[];
  rejectDepthClass: "absent" | "deeper_layer" | "same_layer" | "unknown";
  rejectPresent: boolean;
  rejectRequiresMoreClicks: boolean | null;
  requestsBeforeAnyConsentAction: boolean | null;
  secondLayerPresent: boolean | null;
  surfaceType: "banner" | "footer" | "interstitial" | "modal" | "unknown";
};

export type ConsentVisualSummary = {
  acceptOnly: boolean | null;
  acceptContrastRatio: number | null;
  acceptProminence: "high" | "low" | "medium" | "unknown";
  contrastAsymmetryDetected: boolean | null;
  ctaImbalanceDetected: boolean | null;
  rejectHidden: boolean | null;
  rejectContrastRatio: number | null;
  rejectLowContrast: boolean | null;
  rejectProminence: "high" | "low" | "medium" | "none" | "unknown";
};

export type UiSummary = {
  dismissalPresent: boolean | null;
  forcedActionRequired: boolean | null;
  fullScreenTakeover: boolean | null;
  interstitialDetected: boolean;
  modalDetected: boolean;
  overlayDetected: boolean;
  popupCount: number;
  repeatedResurfacing: boolean | null;
  scrollLocked: boolean | null;
  stickyTakeoverDetected: boolean | null;
};

export type StorageSummary = {
  cookiesBeforeConsentCount: number;
  cookiesSeenCount: number;
  identifierLikeStorageKeyCount: number;
  indexeddbUsed: boolean;
  localStorageKeySample: string[];
  localStorageWriteDetected: boolean;
  sessionStorageKeySample: string[];
  sessionStorageWriteDetected: boolean;
  setCookieResponseCount: number;
  storageWrittenBeforeConsent: boolean | null;
  thirdPartyCookieBeforeConsentCount: number;
  thirdPartyCookieCount: number;
  vendorLinkedStorageWriteCount: number;
};

export type CookieWriteObservation = {
  beforeConsent: boolean | null;
  cookieChangedDuringOnPageAction: boolean | null;
  cookieChangedDuringPageLoad: boolean | null;
  cookieDuration: number | null;
  cookieExpirationDate: string | null;
  cookieExpirationType: "persistent" | "session" | "unknown" | null;
  cookieHttpInitiatorCount: number | null;
  cookieHttpOnly: boolean | null;
  cookieInitiatorDomain: string | null;
  cookieInitiatorType: "app" | "http" | "js" | "tag" | "unknown";
  cookieInitiatorVendor: string | null;
  cookieInstanceCount: number | null;
  cookieJsInitiatorCount: number | null;
  cookieName: string;
  cookiePartyType: "first_party" | "third_party" | "unknown" | null;
  cookiePath: string | null;
  cookieSameSite: string | null;
  cookieSecure: boolean | null;
  cookieSetMethod: "http_header" | "javascript" | "tag" | "unknown";
  cookieSizeBytes: number | null;
  cookieTagInitiatorCount: number | null;
  domain: string;
  setAtMs: number | null;
  thirdParty: boolean;
};

export type MediaSummary = {
  adVideoUnitDetected: boolean | null;
  audioPresent: boolean;
  autoplayAttrAudioCount: number;
  autoplayAttrVideoCount: number;
  autoplayAudioObserved: boolean;
  autoplayBeforeConsent: boolean | null;
  autoplayVideoObserved: boolean;
  mutedAutoplayVideo: boolean | null;
  thirdPartyEmbedCount: number;
  videoPresent: boolean;
};

export type NavigationSummary = {
  affiliateOrTrackerRedirectDetected: boolean | null;
  autoRedirect: boolean | null;
  clientRedirectCount: number;
  consentRelatedRedirectDetected: boolean | null;
  crossDomainHopCount: number;
  finalUrl: string | null;
  initialUrl: string;
  jsNavigationDetected: boolean;
  metaRefreshDetected: boolean;
  redirectDelayMs: number | null;
  redirectHopCount: number;
  serverRedirectCount: number;
};

export type BrowserObservationCollectorSnapshot = {
  consentDismissedWithoutChoice: boolean;
  firstInteractionMs: number | null;
  inputListenerRegistrations: Array<{
    capture: boolean;
    eventType: "beforeinput" | "change" | "input" | "keydown" | "keypress" | "keyup" | "paste";
    targetKind: "contenteditable" | "document" | "form" | "input" | "other" | "textarea" | "window";
    tsMs: number;
  }>;
  inputProbeRuns: Array<{
    endMs: number | null;
    fieldTag: string;
    fieldType: string | null;
    targetKind: "contenteditable" | "input" | "textarea";
    typedCharCount: number;
    valueLength: number | null;
    startMs: number;
  }>;
  indexedDbUsed: boolean;
  jsCookieWrites: Array<{
    cookieName: string;
    tsMs: number;
  }>;
  jsNavigationDetected: boolean;
  localStorageKeys: string[];
  localStorageWrites: Array<{
    key: string;
    tsMs: number;
  }>;
  popupCount: number;
  sessionStorageKeys: string[];
  sessionStorageWrites: Array<{
    key: string;
    tsMs: number;
  }>;
  textInputEventSamples: Array<{
    eventType: "beforeinput" | "change" | "input" | "keydown" | "keypress" | "keyup" | "paste";
    inputType: string | null;
    targetKind: "contenteditable" | "input" | "textarea";
    tsMs: number;
    valueLength: number | null;
  }>;
  userInteracted: boolean;
};

export type KeyloggingSummary = {
  inputListenerRegistrationCount: number;
  keyloggingRisk: "likely" | "none" | "possible";
  probeRunCount: number;
  requestCountDuringTyping: number;
  thirdPartyRequestCountDuringTyping: number;
  totalTextInputEventCount: number;
  vendorNamesDuringTyping: string[];
};

export type PageSnapshotSummary = {
  consent: {
    acceptPresent: boolean;
    bannerPresent: boolean;
    clicksToAccept: number | null;
    clicksToReject: number | null;
    closePresent: boolean;
    cmpDetected: boolean;
    contentObstructed: boolean | null;
    cookieWallDetected: boolean | null;
    firstVisibleMs: number | null;
    managePresent: boolean;
    pageInteractionBlocked: boolean | null;
    precheckedCategoryCount: number | null;
    precheckedCategoryLabels: string[];
    rejectPresent: boolean;
    rejectRequiresMoreClicks: boolean | null;
    secondLayerPresent: boolean | null;
    surfaceType: "banner" | "footer" | "interstitial" | "modal" | "unknown";
  };
  consentVisual: {
    acceptOnly: boolean | null;
    acceptContrastRatio: number | null;
    acceptProminence: "high" | "low" | "medium" | "unknown";
    contrastAsymmetryDetected: boolean | null;
    ctaImbalanceDetected: boolean | null;
    rejectHidden: boolean | null;
    rejectContrastRatio: number | null;
    rejectLowContrast: boolean | null;
    rejectProminence: "high" | "low" | "medium" | "none" | "unknown";
  };
  media: {
    adVideoUnitDetected: boolean | null;
    audioPresent: boolean;
    autoplayAttrAudioCount: number;
    autoplayAttrVideoCount: number;
    autoplayAudioObserved: boolean;
    autoplayVideoObserved: boolean;
    firstAutoplayMs: number | null;
    mutedAutoplayVideo: boolean | null;
    thirdPartyEmbedCount: number;
    videoPresent: boolean;
  };
  navigation: {
    metaRefreshDetected: boolean;
  };
  ui: {
    dismissalPresent: boolean | null;
    forcedActionRequired: boolean | null;
    fullScreenTakeover: boolean | null;
    interstitialDetected: boolean;
    modalDetected: boolean;
    overlayDetected: boolean;
    repeatedResurfacing: boolean | null;
    scrollLocked: boolean | null;
    stickyTakeoverDetected: boolean | null;
  };
};

export type VendorLeaderboardSummary = {
  byCategory: Record<VendorCategory, number>;
  topCookieSettingHosts: Array<{
    endpointHostname: string;
    requestCount: number;
    setCookieResponseCount: number;
    vendorName: string | null;
  }>;
  topDomains: Array<{
    category: VendorCategory;
    endpointHostname: string;
    requestCount: number;
    vendorName: string | null;
  }>;
  topHighSignalVendors: Array<{
    requestCount: number;
    vendorName: string;
  }>;
  topVendors: Array<{
    category: VendorCategory | "mixed";
    requestCount: number;
    vendorName: string;
  }>;
};

export type BatchScoreboardRow = {
  blockerOutcome: ClassificationSummary["blockerSummary"]["outcome"];
  blockerVendorHint: string | null;
  challengeDetected: boolean;
  classification: RunClassification;
  confirmedFindingCount: number;
  cookieCount: number;
  domain: string;
  evidenceDepth: RunQualitySummary["evidenceDepth"];
  finalStatus: number | null;
  highSignalCookieCount: number;
  initialStatus: number | null;
  mode: RuntimeMode;
  outcomeBucket: "broken_or_nonusable" | "meaningfully_blocked" | "useful_signal";
  overallConfidence: number;
  terminalKind: string;
  thirdPartyDomains: number;
  usedEscalation: boolean;
  vendorCount: number;
};

export type CnameCloakRecord = {
  chain: string[];
  cloakedHost: string;
  matchedTrackerHost: string | null;
  vendorName: string | null;
};

export type CnameObservation = {
  cnameChain: string[];
  matchedTracker: string | null;
  subdomain: string;
  terminalHost: string | null;
  vendor: string | null;
};

export type CnameCandidate = {
  appearsFirstParty: boolean;
  firstSeenMs: number | null;
  requestCount: number;
  sampleUrls: string[];
  subdomain: string;
};

export type PostRejectPersistenceSummary = {
  attempted: boolean;
  newThirdPartyRequestsAfterReject: number;
  observedRejectTimestampMs: number | null;
  persistedVendors: string[];
  rejectFound: boolean;
  rejectWorked: boolean;
  thirdPartyRequestsAfterReject: number;
};

export type TimingSummary = {
  challengeToRecoveryMs: number | null;
  finalDocumentStatus: number | null;
  firstChallengeTimestampMs: number | null;
  firstConsentUiTimestampMs: number | null;
  firstCookieTimestampMs: number | null;
  firstHighSignalCookieTimestampMs: number | null;
  firstRecoveryTimestampMs: number | null;
  firstThirdPartyRequestTimestampMs: number | null;
  initialDocumentStatus: number | null;
  navigationStartTimestampMs: number;
  observationEndedTimestampMs: number;
};

export type RunStopReason =
  | "adaptive_stabilization"
  | "cdp_blocked_stabilization"
  | "observe_window_elapsed"
  | "stalled_main_document_response"
  | "stalled_dom_content_loaded"
  | "stalled_post_dom_no_signal"
  | "runtime_wall_time_cap"
  | "timeout"
  | "navigation_error"
  | "snapshot_fallback";

export type RunStopSummary = {
  detail: string | null;
  reason: RunStopReason;
  timestampMs: number | null;
};

export type ClassificationSummary = {
  blockerSummary: {
    confidence: number;
    evidence: string[];
    outcome: "hard_block" | "challenge_wall" | "challenge_markers_runtime_reached" | "no_blocker_detected";
    vendorHint: string | null;
  };
  challengeDetected: boolean;
  classifierNotes: string[];
  classification: RunClassification;
  maxPhaseReached: PhaseReached;
  originLikelyReached: boolean;
  stopReason: string;
  verificationVendorHint: string | null;
};

export type MainDocumentSummary = {
  headers: Record<string, string> | null;
  setCookieHeaders: string[] | null;
  status: number | null;
  url: string | null;
};

export type RuntimeCapabilities = {
  consoleMessages: boolean;
  htmlSnapshot: boolean;
  mainDocumentHeaders: boolean;
  pageErrors: boolean;
  requestEvents: boolean;
  responseEvents: boolean;
};

export type RuntimeMetadata = {
  autoEscalated: boolean;
  browserFamily: string;
  browserVersion: string | null;
  mode: RuntimeMode;
  observeBudgetMs: number;
  timeoutMs: number;
  userAgent: string | null;
};

export type RuntimeRunResult = {
  browserCollector: BrowserObservationCollectorSnapshot | null;
  bodyTextExcerpt: string | null;
  capabilities: RuntimeCapabilities;
  cnameCandidates: CnameCandidate[];
  cnameCloaking: CnameCloakRecord[];
  cnameObservations: CnameObservation[];
  classification: ClassificationSummary;
  consoleMessages: ConsoleRecord[];
  consentSummary: ConsentSummary;
  consentVisual: ConsentVisualSummary;
  consentUi: ConsentUiSummary;
  consentSignalTiming: ConsentSignalTimingSummary;
  cookiesBeforeConsent: CookieDetectionRecord[];
  cookieRiskSummary: CookieRiskSummaryRecord[];
  cookieWriteObservations: CookieWriteObservation[];
  cookieDiffs: CookieDiffRecord[];
  cookieSnapshots: CookieSnapshot[];
  domainVendorRegistry: DomainVendorRegistryRecord[];
  errors: string[];
  finalUrl: string | null;
  findings: SignalFinding[];
  fingerprintApiEventSamples: FingerprintingCollectorSnapshot["eventSamples"];
  htmlSnapshotPath: string | null;
  keyloggingSummary: KeyloggingSummary;
  leakMap: LeakMapRecord[];
  mainDocument: MainDocumentSummary;
  mediaSummary: MediaSummary;
  mode: RuntimeMode;
  navigationOutcome: NavigationOutcome;
  navigationSummary: NavigationSummary;
  networkSummary: NetworkSummary;
  outputDir: string;
  pageErrors: PageErrorRecord[];
  pageSnapshotSummary: PageSnapshotSummary | null;
  postRejectPersistence: PostRejectPersistenceSummary | null;
  fingerprinting: FingerprintingSummary;
  findingPacket: FindingPacket;
  preConsentTimeline: PreConsentRequestRecord[];
  preConsentVendorSummary: PreConsentVendorSummary;
  redirectChain: RedirectRecord[];
  requestedUrl: string;
  requestObservations: RequestObservation[];
  requestToVendorObservations: RequestToVendorObservation[];
  requests: RequestRecord[];
  runQualitySummary: RunQualitySummary;
  runtimeMetadata: RuntimeMetadata;
  responses: ResponseRecord[];
  screenshotPath: string | null;
  storageSummary: StorageSummary;
  stopSummary: RunStopSummary;
  thirdPartyDomainCount: number;
  timings: TimingSummary;
  timestamp: string;
  title: string | null;
  uiSummary: UiSummary;
  vendorLeaderboard: VendorLeaderboardSummary;
  vendorSummary: VendorSummary;
  vendorSummaryExtended: VendorSummaryExtended;
  wallTimeMs: number;
};

export type AutoDecisionReason =
  | "edge_block"
  | "verification_interstitial"
  | "thin_runtime"
  | "thin_success"
  | "http_block_status"
  | "origin_not_reached"
  | "not_needed";

export type AutoDecisionSummary = {
  decision: "escalated_to_cdp" | "stayed_local";
  localMode: RuntimeMode;
  reason: AutoDecisionReason;
  reasonDetail: string;
  targetUrl: string;
  timestamp: string;
};

export type ComparisonConclusion = {
  confidenceNotes: string[];
  furthestRuntime: RuntimeMode | null;
  richestVendorRuntime: RuntimeMode | null;
  summary: string;
};

export type ComparisonReport = {
  conclusion: ComparisonConclusion;
  modes: RuntimeRunResult[];
  targetUrl: string;
  timestamp: string;
};

export type RuntimeOptions = {
  chromeRemoteDebuggingUrl: string | null;
  mode: RuntimeMode;
  observeMs: number;
  outputDir: string;
  remoteCdpWsEndpoint: string | null;
  timeoutMs: number;
  userAgent: string | null;
};

export type RuntimeLogger = {
  log: (message: string) => void;
};

export interface UnifiedRuntime {
  close(): Promise<void>;
  init(): Promise<void>;
  navigate(url: string): Promise<void>;
  observe(ms: number): Promise<void>;
  snapshot(): Promise<RuntimeRunResult>;
}
