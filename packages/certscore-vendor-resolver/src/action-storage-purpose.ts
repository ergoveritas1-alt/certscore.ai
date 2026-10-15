import type { PostRefusalStorageItem } from "@certscore/contracts";
import { resolveCanonicalVendor, resolveCanonicalCookieClassification } from "./index";

/** Shared exact-purpose policy for fresh action captures. Unknown is never essential. */
export function resolveCanonicalActionStoragePurpose(input: { storageType: "cookie" | "local_storage" | "session_storage"; name: string; hostname: string }) {
  let purpose: NonNullable<PostRefusalStorageItem["purpose"]> = "unknown";
  let essentiality: "essential" | "non_essential" | "unknown" = "unknown";
  let vendor: string | undefined;
  if (input.storageType === "cookie") {
    const classification = resolveCanonicalCookieClassification(input.name, { cookieDomain: input.hostname });
    return { purpose: classification.category, nonEssential: classification.essentiality === "non_essential",
      ...(classification.provider ? { vendor: classification.provider.vendor } : {}),
      purposeAssessment: { version: "action_storage_purpose.v2" as const, essentiality: classification.essentiality, cookieClassification: classification } };
  } else {
    const observation = resolveCanonicalVendor({ type: "cmp_runtime", storageKey: input.name, hostname: input.hostname, matchSource: "storage_key" }).observation;
    if (observation?.registryAttribution?.matchKind === "runtime_signature") {
      purpose = observation.purpose;
      vendor = observation.vendor;
      essentiality = purpose === "consent_management" ? "essential"
        : ["analytics", "advertising", "session_replay"].includes(purpose) ? "non_essential" : "unknown";
    }
  }
  return { purpose, ...(vendor ? { vendor } : {}), nonEssential: essentiality === "non_essential",
    purposeAssessment: { version: "action_storage_purpose.v1" as const, essentiality } };
}
