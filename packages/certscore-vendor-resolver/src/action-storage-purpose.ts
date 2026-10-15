import type { PostRefusalStorageItem } from "@certscore/contracts";
import { COOKIE_PURPOSE_POLICY, resolveCanonicalCookieKnowledge } from "./cookie-knowledge-base";
import { resolveCanonicalVendor } from "./index";

/** Shared exact-purpose policy for fresh action captures. Unknown is never essential. */
export function resolveCanonicalActionStoragePurpose(input: { storageType: "cookie" | "local_storage" | "session_storage"; name: string; hostname: string }) {
  let purpose: NonNullable<PostRefusalStorageItem["purpose"]> = "unknown";
  let essentiality: "essential" | "non_essential" | "unknown" = "unknown";
  let vendor: string | undefined;
  if (input.storageType === "cookie") {
    const knowledge = resolveCanonicalCookieKnowledge(input.name, { purposePolicyVersion: COOKIE_PURPOSE_POLICY, cookieDomain: input.hostname });
    if (["analytics", "advertising", "session_replay", "consent_management", "security", "infrastructure", "tag_management"].includes(knowledge.category))
      purpose = knowledge.category as NonNullable<PostRefusalStorageItem["purpose"]>;
    essentiality = knowledge.essentiality;
    const identity = resolveCanonicalVendor({ type: "cookie", cookieName: input.name, hostname: input.hostname, matchSource: "cookie_name" }).observation;
    vendor = identity?.purpose === purpose && ["cookie_name", "cookie_context"].includes(identity.registryAttribution?.matchKind ?? "")
      ? identity.vendor : knowledge.vendor ?? undefined;
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
