"use server";

import type { ValidationRunMode } from "@website-signal-risk-scanner/shared";
import { redirect } from "next/navigation";
import { getValidationQueueAvailability } from "../queue/validation-queue";
import {
  addValidationTargetAction,
  queueManualValidationRunAction,
  queueValidationRescanAction,
  removeValidationTargetAction,
  updateValidationSettingsAction,
  updateValidationTargetStateAction
} from "./repository";

export type ValidationRescanActionState = {
  error: string | null;
};

export async function submitValidationSettingsAction(formData: FormData) {
  const runMode = String(formData.get("runMode") ?? "manual") === "automatic" ? "automatic" : "manual";
  const pipelineEnabled = String(formData.get("pipelineEnabled") ?? "0") === "1";
  const automaticIntervalMinutes = Number.parseInt(String(formData.get("automaticIntervalMinutes") ?? ""), 10);

  await updateValidationSettingsAction({
    automaticIntervalMinutes: Number.isFinite(automaticIntervalMinutes) ? automaticIntervalMinutes : undefined,
    pipelineEnabled,
    runMode: runMode as ValidationRunMode
  });
}

export async function submitManualValidationRunAction(formData: FormData) {
  const targetId = String(formData.get("targetId") ?? "").trim();
  if (!targetId) {
    throw new Error("Missing validation target.");
  }

  const result = await queueManualValidationRunAction({ targetId });
  redirect(`/app/scans/${result.scanId}`);
}

export async function submitValidationTargetAction(formData: FormData) {
  const targetId = String(formData.get("targetId") ?? "").trim();
  const action = String(formData.get("targetAction") ?? "").trim();
  if (!targetId || !action) {
    throw new Error("Missing validation target action.");
  }

  if (action === "clear-backoff") {
    await updateValidationTargetStateAction({
      clearBackoff: true,
      targetId
    });
    return;
  }

  if (action === "deny") {
    await updateValidationTargetStateAction({
      denyReason: String(formData.get("denyReason") ?? "").trim() || "Suppressed by operator.",
      denylisted: true,
      targetId
    });
    return;
  }

  if (action === "restore") {
    await updateValidationTargetStateAction({
      denylisted: false,
      targetId
    });
    return;
  }

  if (action === "remove") {
    await removeValidationTargetAction({
      targetId
    });
    return;
  }

  throw new Error("Unsupported validation target action.");
}

export async function submitValidationTargetAddAction(formData: FormData) {
  const hostname = String(formData.get("hostname") ?? "").trim();
  if (!hostname) {
    throw new Error("Missing hostname.");
  }

  await addValidationTargetAction({ hostname });
}

export async function submitValidationRescanAction(formData: FormData) {
  const domainId = String(formData.get("domainId") ?? "").trim();
  if (!domainId) {
    throw new Error("Missing validation domain.");
  }

  const result = await queueValidationRescanAction({ domainId });
  redirect(`/app/scans/${result.scanId}`);
}

const initialValidationRescanState: ValidationRescanActionState = {
  error: null
};

export async function submitValidationRescanFormAction(
  _previousState: ValidationRescanActionState = initialValidationRescanState,
  formData: FormData
): Promise<ValidationRescanActionState> {
  const queueAvailability = getValidationQueueAvailability();
  if (!queueAvailability.enabled) {
    return {
      error: queueAvailability.reason
    };
  }

  const domainId = String(formData.get("domainId") ?? "").trim();
  if (!domainId) {
    return {
      error: "Missing validation domain."
    };
  }

  const result = await queueValidationRescanAction({ domainId });
  redirect(`/app/scans/${result.scanId}`);
}
