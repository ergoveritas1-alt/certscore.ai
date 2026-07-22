"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL } from "../../lib/scans/canonical-shadow-score-model";
import { registerCanonicalShadowScoreCollectionPair } from "../scans/canonical-shadow-score-pair-repository";
import { requirePlatformAdminContext } from "./platform-admin";

function value(formData: FormData, name: string) {
  const input = formData.get(name);
  return typeof input === "string" ? input.trim() : "";
}

export async function registerScoreShadowPair(formData: FormData) {
  await requirePlatformAdminContext();
  const lambdaScanId = value(formData, "lambdaScanId");
  const browserScanId = value(formData, "browserScanId");
  const modelVersion = GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL.version;
  const pairKey = `sha256:${createHash("sha256")
    .update(`certscore-score-source-pair.v1\0${modelVersion}\0${lambdaScanId.toLowerCase()}\0${browserScanId.toLowerCase()}`)
    .digest("hex")}`;

  try {
    await registerCanonicalShadowScoreCollectionPair({
      browserScanId,
      lambdaScanId,
      modelVersion,
      pairKey
    });
    redirect(`/app/admin/scoring-shadow?pairStatus=registered&pairKey=${encodeURIComponent(pairKey)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/app/admin/scoring-shadow?pairStatus=failed");
  }
}
