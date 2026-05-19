import {
  PULSE_API_VERSION,
  PULSE_FEEDBACK_EMAIL,
  PULSE_PROJECTION_VERSION,
  PULSE_SCHEMA_VERSION,
  PULSE_STANDARD_DISCLAIMER,
  PULSE_VERSION
} from "./constants";
import type { PulseDetail, PulseFormat } from "./types";

export function buildPulseError(input: {
  code: string;
  message: string;
  retryAfterSeconds?: number | null;
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
      retryAfterSeconds: input.retryAfterSeconds ?? null
    },
    feedback: {
      email: PULSE_FEEDBACK_EMAIL
    },
    disclaimer: PULSE_STANDARD_DISCLAIMER
  };
}
