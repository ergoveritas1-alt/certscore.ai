import type { PULSE_FEEDBACK_RATINGS, PULSE_FEEDBACK_REASONS } from "./constants";

export type PulseFormat = "json" | "markdown";
export type PulseDetail = "tiny" | "standard" | "full" | "summary" | "evidence";
export type PulseFreshnessMode = "latest" | "refresh";
export type PulseJobStatus =
  | "queued"
  | "running"
  | "finalizing"
  | "completed"
  | "completed_limited"
  | "failed"
  | "expired"
  | "rate_limited";
export type PulseCoverageStatus = "complete" | "partial" | "limited" | "blocked" | "unknown";
export type PulseFeedbackRating = (typeof PULSE_FEEDBACK_RATINGS)[number];
export type PulseFeedbackReason = (typeof PULSE_FEEDBACK_REASONS)[number];
export type PulseAgentResponseClass = "completed_pulse" | "pending_pulse" | "api_error" | "rate_limited";

export type PulseRequestContext = {
  apiKeyId?: string | null;
  channel?: "pulse_api" | "gpt_action" | string | null;
  format: PulseFormat;
  detail: PulseDetail;
  freshness: PulseFreshnessMode;
  forceNewScan?: boolean;
  ipHash: string | null;
  mode: "url" | "scanId" | "jobId";
  quotaClass?: "scan_create" | null;
  referer: string | null;
  sourceIp: string | null;
  source?: "pulse_api" | "gpt_action" | string | null;
  userAgent: string | null;
  userId?: string | null;
  accountId?: string | null;
  waitSeconds: number;
};
