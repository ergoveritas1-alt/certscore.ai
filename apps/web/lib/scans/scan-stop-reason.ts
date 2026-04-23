import {
  deriveAccessLimitationOutcome,
  type BlockPageClassification,
  type BlockVendorGuess,
  type ScanOutcomeCode,
  type ScanStopReasonCode
} from "../../../../packages/shared/src/access-limitations";

type ScanStopReasonInput = {
  accessPostureClass?: string | null;
  authWallDetected?: boolean | null;
  blockedFlag?: boolean | null;
  captchaFlag?: boolean | null;
  fallbackSourceLabel?: string | null;
  fallbackSourceReason?: string | null;
  homepageFetchHttpStatus?: number | null;
  homepageFetchStatus?: string | null;
  normalizedBodyMissing?: boolean | null;
  pagesScanned?: number | null;
  robotsAllowed?: boolean | null;
  robotsFetchHttpStatus?: number | null;
  robotsFetchStatus?: string | null;
  blockPageClassification?: BlockPageClassification | null;
  blockVendorGuess?: BlockVendorGuess | null;
  challengeSuspected?: boolean | null;
  authWallSuspected?: boolean | null;
  rateLimitSuspected?: boolean | null;
  geoBlockSuspected?: boolean | null;
  fingerprintBlockSuspected?: boolean | null;
};

export type ScanOutcomeKind = ScanOutcomeCode;

export type ScanStopReason = {
  kind: ScanStopReasonCode;
  outcome: ScanOutcomeKind;
  outcomeTitle: string;
  previewFindingTitle: string;
  reason: string;
  reviewMessage: string;
  reviewTitle: string;
  whatThisMeans: string[];
};

export function deriveScanStopReason(input: ScanStopReasonInput): ScanStopReason | null {
  return deriveAccessLimitationOutcome(input);
}
