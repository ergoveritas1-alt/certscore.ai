import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalActionStoragePurpose } from "./action-storage-purpose";

test("action storage uses the shared exact-cookie purpose and essentiality policy", () => {
  for (const [name, hostname, essentiality] of [["cookieyes-consent", "cohere.com", "essential"], ["aws-waf-token", "huggingface.co", "essential"],
    ["country", "openai.com", "essential"], ["country", "example.test", "unknown"], ["GCLB", "statsigapi.net", "unknown"],
    ["_ga", "example.test", "non_essential"], ["gb_anon_id", "x.ai", "unknown"], ["_rdt_uuid", "groq.com", "unknown"]] as const) {
    const value = resolveCanonicalActionStoragePurpose({ storageType: "cookie", name, hostname });
    assert.equal(value.purposeAssessment.essentiality, essentiality, name);
    assert.equal(value.nonEssential, essentiality === "non_essential", name);
  }
  for (const storageType of ["cookie", "local_storage"] as const) {
    const uet = resolveCanonicalActionStoragePurpose({ storageType, name: "_uetvid", hostname: "example.test" });
    assert.equal(uet.vendor, "Microsoft", "purpose knowledge must not split the canonical vendor identity");
    assert.equal(uet.nonEssential, true);
  }
  const unresolved = resolveCanonicalActionStoragePurpose({ storageType: "local_storage", name: "unclassified", hostname: "example.test" });
  assert.equal(unresolved.purposeAssessment.essentiality, "unknown");
});
