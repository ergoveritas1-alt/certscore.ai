import { absoluteUrl } from "../seo";
import {
  PULSE_API_VERSION,
  PULSE_PROJECTION_VERSION,
  PULSE_SCHEMA_VERSION,
  PULSE_SOURCE,
  PULSE_STANDARD_DISCLAIMER,
  PULSE_STATUS_STEPS,
  PULSE_VERSION
} from "./constants";

type PulseStatusInput = {
  jobId: string;
  domain: string | null;
  status: string;
  phase?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  lastUpdatedAt?: string | null;
  scanId?: string | null;
  resultUrl?: string | null;
  reportUrl?: string | null;
  message?: string | null;
  retryAfterSeconds?: number | null;
};

function elapsedSeconds(createdAt: string, completedAt?: string | null) {
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const start = new Date(createdAt).getTime();
  return Number.isFinite(start) ? Math.max(0, Math.round((end - start) / 1000)) : 0;
}

function publicPhase(status: string, phase?: string | null) {
  if (phase) {
    return phase;
  }
  if (status === "completed" || status === "completed_limited") {
    return "completed";
  }
  if (status === "running") {
    return "runtime_observation";
  }
  if (status === "finalizing") {
    return "pulse_generation";
  }
  return "queued";
}

function defaultMessage(status: string, phase: string) {
  if (status === "completed" || status === "completed_limited") {
    return "Pulse generation completed from eligible public scan results.";
  }
  if (status === "failed") {
    return "The Pulse scan could not be completed. Try again later or review any available prior scan.";
  }
  if (status === "rate_limited") {
    return "A Pulse scan for this domain was requested recently. Try again in a few minutes.";
  }
  if (phase === "runtime_observation") {
    return "Observing public-page behavior and collecting automated evidence signals.";
  }
  if (phase === "pulse_generation") {
    return "Projecting eligible findings into a public Pulse summary.";
  }
  return "Pulse scan request is queued.";
}

export function buildPulseStatus(input: PulseStatusInput) {
  const phase = publicPhase(input.status, input.phase);
  const phaseIndex = Math.max(0, PULSE_STATUS_STEPS.indexOf(phase as (typeof PULSE_STATUS_STEPS)[number]));
  const completedSteps = PULSE_STATUS_STEPS.slice(0, phaseIndex).filter((step) => step !== "completed");
  const remainingSteps = PULSE_STATUS_STEPS.slice(phaseIndex + 1);
  const resultUrl = input.resultUrl ?? (input.scanId ? absoluteUrl(`/api/v1/pulse?scanId=${input.scanId}`) : null);
  const reportUrl = input.reportUrl ?? (input.scanId ? absoluteUrl(`/scan/${input.scanId}`) : null);

  return {
    type: "certscore_pulse_status",
    meta: {
      apiVersion: PULSE_API_VERSION,
      schemaVersion: PULSE_SCHEMA_VERSION,
      pulseVersion: PULSE_VERSION,
      projectionVersion: PULSE_PROJECTION_VERSION,
      generatedAt: new Date().toISOString(),
      source: PULSE_SOURCE,
      format: "json",
      detail: "standard"
    },
    jobId: input.jobId,
    scanId: input.scanId ?? null,
    scan_id: input.scanId ?? null,
    domain: input.domain,
    status: input.status,
    phase,
    message: input.message ?? defaultMessage(input.status, phase),
    createdAt: input.createdAt,
    startedAt: input.startedAt ?? null,
    lastUpdatedAt: input.lastUpdatedAt ?? input.completedAt ?? input.startedAt ?? input.createdAt,
    completedAt: input.completedAt ?? null,
    elapsedSeconds: elapsedSeconds(input.createdAt, input.completedAt),
    estimatedWaitSeconds: input.status === "queued" ? 60 : input.status === "running" ? 45 : null,
    progress: {
      currentStep: phase,
      completedSteps,
      remainingSteps
    },
    resultUrl,
    reportUrl,
    retryAfterSeconds: input.status === "rate_limited" ? input.retryAfterSeconds ?? null : null,
    disclaimer: PULSE_STANDARD_DISCLAIMER
  };
}
