import { z } from "zod";

// Public contract mirror; parity with the canonical shared registry is enforced by tests.
export const publicScanNoGoReasonCodes = [
  "blank_or_unusable_page", "loading_or_stalled", "not_found_404", "parked_or_placeholder",
  "site_not_ready", "captcha_or_challenge", "access_denied_or_forbidden_page", "rate_limited_429",
  "server_error_5xx", "configuration_error", "maintenance_or_unavailable", "tls_or_certificate_error",
  "unsupported_region", "target_unreachable_or_unsuitable", "navigation_transport_failure", "visual_capture_failed_or_placeholder",
  "retained_visual_error_shell", "unknown",
] as const;

export const scanResultDispositionSchema = z.enum(["no_go"]);
export const scanNoGoReasonCodeSchema = z.enum(publicScanNoGoReasonCodes);
export const scanNoGoLimitationKindSchema = z.enum([
  "target_site_state",
  "scanner_access_limitation",
  "scanner_capture_limitation",
]);
export const scanNoGoResultSchema = z.object({
  reasonCode: scanNoGoReasonCodeSchema,
  title: z.string(),
  explanation: z.string(),
  summary: z.string(),
  limitationKind: scanNoGoLimitationKindSchema,
  recommendedNextAction: z.string(),
  retryLikelyToHelp: z.boolean(),
  evidenceExcerpt: z.string().max(360).optional(),
}).strict();

export type ScanResultDisposition = z.infer<typeof scanResultDispositionSchema>;
export type ScanNoGoReasonCode = z.infer<typeof scanNoGoReasonCodeSchema>;
export type ScanNoGoLimitationKind = z.infer<typeof scanNoGoLimitationKindSchema>;
export type ScanNoGoResult = z.infer<typeof scanNoGoResultSchema>;
