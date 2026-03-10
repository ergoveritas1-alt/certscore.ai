import type {
  ComplianceChangeEvent,
  PolicyEnrichment,
  PolicyEvidence,
  PolicyReviewQueueItem,
  ScanAccessibilityRuleCount,
  ScanPage,
  ScanRuntimeArtifact,
  ScanSnapshot,
  ScanTrackerVendor
} from "@website-signal-risk-scanner/shared";
import type { ScanPlan } from "./scan-planner";

export type ExtractedLink = {
  href: string;
  text: string;
};

export type ExtractedScript = {
  contentSample: string | null;
  host: string | null;
  src: string | null;
};

export type ExtractedInput = {
  autocomplete: string | null;
  labelText: string | null;
  name: string | null;
  type: string | null;
};

export type ExtractedForm = {
  action: string | null;
  hasPasswordField: boolean;
  inputs: ExtractedInput[];
  textSample: string;
};

export type StaticPageResult = {
  blockedByPolicy?: boolean;
  fetchStatus: ScanPage["fetchStatus"];
  finalUrl: string | null;
  headers: Record<string, string>;
  html: string;
  language: string | null;
  links: ExtractedLink[];
  pageType: ScanPage["pageType"];
  pageUrl: string;
  redirectCount?: number;
  redirected: boolean;
  scripts: ExtractedScript[];
  statusCode: number | null;
  textContent: string;
  title: string | null;
  forms: ExtractedForm[];
};

export type BrowserPageResult = {
  accessibilityRuleCounts: ScanAccessibilityRuleCount[];
  acceptAllPresent: boolean;
  cookieBannerPresent: boolean;
  cookiePolicyLinkedFromBanner: boolean;
  darkPatternAcceptEmphasis: boolean;
  darkPatternRejectHidden: boolean;
  granularPreferencesPresent: boolean;
  mixedContentDetected: boolean;
  pageUrl: string;
  precheckedConsentBoxes: boolean;
  preconsentTrackingDetected: boolean;
  rejectAllPresent: boolean;
  timeout: boolean;
  trackerVendors: ScanTrackerVendor[];
  widgetVendor: string | null;
};

export type SnapshotBundle = {
  accessibilityRuleCounts: ScanAccessibilityRuleCount[];
  compatibilitySignals: Array<{
    category: "accessibility" | "privacy" | "disclosure" | "security" | "commerce" | "context";
    key: string;
    label: string;
    value: boolean | number | string | string[];
  }>;
  changeEvents?: ComplianceChangeEvent[];
  pages: ScanPage[];
  policyEnrichments: PolicyEnrichment[];
  policyEvidence: PolicyEvidence[];
  policyReviewQueueItems: PolicyReviewQueueItem[];
  runtimeArtifacts: ScanRuntimeArtifact;
  scanPlan: ScanPlan;
  snapshot: ScanSnapshot;
  trackerVendors: ScanTrackerVendor[];
};

export type PreviousSnapshotContext = {
  runtimeArtifacts: ScanRuntimeArtifact | null;
  snapshot: ScanSnapshot | null;
  trackers: ScanTrackerVendor[];
};
