import {
  PULSE_API_VERSION,
  PULSE_FEEDBACK_EMAIL,
  PULSE_PROJECTION_VERSION,
  PULSE_SCHEMA_VERSION,
  PULSE_STANDARD_DISCLAIMER,
  PULSE_VERSION
} from "./constants";
import { buildPulseAgentInterpretation } from "./agent-interpretation";
import type { PulseDetail, PulseFormat } from "./types";
import type { ApiReadRateProfile, ApiReadRateScope, ApiReadRateWindowId } from "@website-signal-risk-scanner/shared";

type PulseRateLimit = {
  limitUnits: number;
  policyVersion: string;
  profile: ApiReadRateProfile;
  requestedUnits: number;
  scope: ApiReadRateScope;
  usedUnits: number;
  windowId: ApiReadRateWindowId;
  windowSeconds: number;
};

export type PulseCreationRateLimit = {
  kind: "new_scan" | "concurrency";
  limit: number;
  remaining: number;
  scope: "session" | "ip" | "surface" | "requester";
  used: number;
  windowId: "burst" | "daily" | "concurrent";
  windowSeconds: number | null;
};

export function buildPulseError(input: {
  code: string;
  creationRateLimit?: PulseCreationRateLimit;
  message: string;
  rateLimit?: PulseRateLimit;
  recommendedNextAction?: string;
  retryAfterSeconds?: number | null;
  resolution?: { label: string; url: string } | null;
  url?: string | null;
  detail?: PulseDetail;
  format?: PulseFormat;
}) {
  return {
    type: "certscore_pulse_error",
    meta: {
      apiVersion: PULSE_API_VERSION,
      schemaVersion: PULSE_SCHEMA_VERSION,
      pulseVersion: PULSE_VERSION,
      projectionVersion: PULSE_PROJECTION_VERSION,
      generatedAt: new Date().toISOString()
    },
    request: {
      url: input.url ?? null,
      detail: input.detail ?? "standard",
      format: input.format ?? "json"
    },
    error: {
      code: input.code,
      message: input.message,
      retryAfterSeconds: input.retryAfterSeconds ?? null,
      recommendedNextAction: input.recommendedNextAction ?? null,
      rateLimit: input.rateLimit ?? null,
      creationRateLimit: input.creationRateLimit ?? null
    },
    resolution: input.resolution ?? null,
    feedback: {
      email: PULSE_FEEDBACK_EMAIL
    },
    agentInterpretation: buildPulseAgentInterpretation({
      responseClass: input.code === "pulse_throttled" || input.code === "rate_limited" ? "rate_limited" : "api_error",
      safeSummaryUse: false
    }),
    disclaimer: PULSE_STANDARD_DISCLAIMER
  };
}
