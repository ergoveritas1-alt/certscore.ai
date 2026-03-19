"use server";

import { revalidatePath } from "next/cache";
import { getWebServerEnv } from "../../lib/env";
import { requireValidationAdminContext } from "./auth";
import {
  addValidationTarget,
  createManualValidationRun,
  updateValidationControls,
  updateValidationTargetState
} from "./repository";

function requireString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key}.`);
  }

  return value.trim();
}

function requireValidationRedisUrl() {
  const env = getWebServerEnv();

  if (!env.VALIDATION_REDIS_URL) {
    throw new Error("VALIDATION_REDIS_URL is not configured.");
  }
}

async function enqueueValidationRun(runId: string) {
  requireValidationRedisUrl();
  const { enqueueValidationCollectJob } = await import("../queue/validation-queue");
  await enqueueValidationCollectJob(runId);
}

export async function saveValidationControlsAction(formData: FormData) {
  const { user } = await requireValidationAdminContext();
  await updateValidationControls({
    automaticIntervalMinutes: Number(requireString(formData, "automaticIntervalMinutes")),
    operatorNote: (formData.get("operatorNote") as string | null)?.trim() || null,
    pipelineEnabled: formData.get("pipelineEnabled") === "on",
    runMode: requireString(formData, "runMode") as "manual" | "automatic",
    userId: user.id
  });

  revalidatePath("/app");
}

export async function addValidationTargetAction(formData: FormData) {
  await addValidationTarget(requireString(formData, "hostnameOrUrl"));
  revalidatePath("/app");
}

export async function addValidationTargetAndStartAction(formData: FormData) {
  const targetId = await addValidationTarget(requireString(formData, "hostnameOrUrl"));
  const runId = await createManualValidationRun({
    targetId
  });
  await enqueueValidationRun(runId);
  revalidatePath("/app");
  revalidatePath("/app/scans");
}

export async function startManualValidationRunAction(formData: FormData) {
  const runId = await createManualValidationRun({
    targetId: requireString(formData, "targetId")
  });
  await enqueueValidationRun(runId);
  revalidatePath("/app");
  revalidatePath("/app/scans");
}

export async function updateValidationTargetStateAction(formData: FormData) {
  const { user } = await requireValidationAdminContext();
  await updateValidationTargetState({
    action: requireString(formData, "action") as "clear_backoff" | "suppress" | "unsuppress",
    targetId: requireString(formData, "targetId"),
    userId: user.id
  });
  revalidatePath("/app");
}
