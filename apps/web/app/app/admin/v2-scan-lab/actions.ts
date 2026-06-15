"use server";

import { redirect } from "next/navigation";
import { requirePlatformAdminContext } from "../../../../server/admin/platform-admin";
import {
  isV2ScanLabConsentDagEligibleProfile,
  isV2ScanLabRunProfile,
  runV2ScanLabArtifactChain,
  type V2ScanLabRunProfile,
} from "../../../../server/admin/v2-scan-lab-runner";

export async function submitV2ScanLabAction(formData: FormData) {
  await requirePlatformAdminContext();

  const url = getFormString(formData, "url");
  const profile = parseProfile(getFormString(formData, "profile"));
  const freshRescan = formData.get("freshRescan") === "yes";
  const consentDag = formData.get("consentDag") === "yes" && isV2ScanLabConsentDagEligibleProfile(profile);
  const scanStartedAtMs = parseTimestampMs(getFormString(formData, "scanStartedAtMs")) ?? Date.now();

  if (!url) {
    redirectWithParams({ consentDag, profile, scanMessage: "Enter a URL or domain.", scanStatus: "invalid" });
  }

  if (!freshRescan) {
    redirectWithParams({ consentDag, profile, url });
  }

  let plan: Awaited<ReturnType<typeof runV2ScanLabArtifactChain>>;
  try {
    plan = await runV2ScanLabArtifactChain({ consentScenarioDag: consentDag, profile, url });
  } catch (error) {
    redirectWithParams({
      consentDag,
      profile,
      scanMessage: error instanceof Error ? error.message : "Fresh v2 scan failed.",
      scanStatus: "failed",
      url,
    });
  }

  redirectWithParams({
    chain: plan.chainKey,
    consentDag,
    profile: plan.profile,
    scanStatus: "complete",
    scanTimeSec: Math.max(0, Math.round((Date.now() - scanStartedAtMs) / 1_000)),
    url: plan.domain,
  });
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseProfile(value: string): V2ScanLabRunProfile {
  return isV2ScanLabRunProfile(value) ? value : "full";
}

function parseTimestampMs(value: string) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function redirectWithParams(input: {
  chain?: string;
  consentDag?: boolean;
  profile: V2ScanLabRunProfile;
  scanMessage?: string;
  scanStatus?: "complete" | "failed" | "invalid";
  scanTimeSec?: number;
  url?: string;
}): never {
  const params = new URLSearchParams({ profile: input.profile });
  if (input.url) {
    params.set("url", input.url);
  }
  if (input.chain) {
    params.set("chain", input.chain);
  }
  if (input.consentDag) {
    params.set("consentDag", "yes");
  }
  if (input.scanStatus) {
    params.set("scanStatus", input.scanStatus);
  }
  if (input.scanMessage) {
    params.set("scanMessage", input.scanMessage.slice(0, 600));
  }
  if (typeof input.scanTimeSec === "number" && Number.isFinite(input.scanTimeSec)) {
    params.set("scanTimeSec", String(Math.max(0, Math.round(input.scanTimeSec))));
  }
  redirect(`/app/admin/v2-scan-lab?${params.toString()}`);
}
