"use server";

import type { ValidationRunMode } from "@website-signal-risk-scanner/shared";
import { redirect } from "next/navigation";
import { getValidationQueueAvailability } from "../queue/validation-queue";
import { buildValidationOpsUrl, getValidationOpsHostState } from "./ops-host";
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

function redirectToValidationOpsIfNeeded(pathname: string) {
  if (!getValidationOpsHostState().hostedOnDedicatedOpsApp) {
    return;
  }

  const destinationUrl = buildValidationOpsUrl(pathname);
  if (destinationUrl) {
    redirect(destinationUrl);
  }
}

export async function submitValidationSettingsAction(formData: FormData) {
  redirectToValidationOpsIfNeeded("/app/validation");
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
  redirectToValidationOpsIfNeeded("/app/validation");
  const targetId = String(formData.get("targetId") ?? "").trim();
  if (!targetId) {
    throw new Error("Missing validation target.");
  }

  const trancoRank = Number.parseInt(String(formData.get("trancoRank") ?? "").trim(), 10);
  const result = await queueManualValidationRunAction({
    hostname: String(formData.get("hostname") ?? "").trim() || undefined,
    normalizedUrl: String(formData.get("normalizedUrl") ?? "").trim() || undefined,
    source: String(formData.get("source") ?? "").trim() || undefined,
    targetId,
    trancoRank: Number.isFinite(trancoRank) ? trancoRank : undefined
  });
  redirect(`/app/scans/${result.scanId}`);
}

export async function submitValidationTargetAction(formData: FormData) {
  redirectToValidationOpsIfNeeded("/app/validation");
  const targetId = String(formData.get("targetId") ?? "").trim();
  const action = String(formData.get("targetAction") ?? "").trim();
  if (!targetId || !action) {
    throw new Error("Missing validation target action.");
  }

  const sharedInput = {
    hostname: String(formData.get("hostname") ?? "").trim() || undefined,
    normalizedUrl: String(formData.get("normalizedUrl") ?? "").trim() || undefined,
    source: String(formData.get("source") ?? "").trim() || undefined,
    targetId,
    trancoRank: (() => {
      const value = Number.parseInt(String(formData.get("trancoRank") ?? "").trim(), 10);
      return Number.isFinite(value) ? value : undefined;
    })()
  };

  if (action === "clear-backoff") {
    await updateValidationTargetStateAction({
      clearBackoff: true,
      ...sharedInput
    });
    return;
  }

  if (action === "deny") {
    await updateValidationTargetStateAction({
      denyReason: String(formData.get("denyReason") ?? "").trim() || "Suppressed by operator.",
      denylisted: true,
      ...sharedInput
    });
    return;
  }

  if (action === "restore") {
    await updateValidationTargetStateAction({
      denylisted: false,
      ...sharedInput
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
  redirectToValidationOpsIfNeeded("/app/validation");
  const hostname = String(formData.get("hostname") ?? "").trim();
  if (!hostname) {
    throw new Error("Missing hostname.");
  }

  await addValidationTargetAction({ hostname });
}

export async function submitValidationRescanAction(formData: FormData) {
  redirectToValidationOpsIfNeeded("/app/validation/scans");
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
  if (getValidationOpsHostState().hostedOnDedicatedOpsApp) {
    return {
      error: buildValidationOpsUrl("/app/validation/scans") ?? "Validation controls are hosted on the dedicated validation operations app."
    };
  }

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
