import assert from "node:assert/strict";
import test from "node:test";
import {
  getPolicyActionableFlags,
  getPolicyRightsSignals,
  prioritizePublicPolicySurfaces
} from "./policy-enrichment-row";

test("getPolicyRightsSignals filters mixed raw arrays down to strings", () => {
  const result = getPolicyRightsSignals({
    policy_rights_signals: ["access_request", { bad: true }, 4, "", "delete_request", null]
  });

  assert.deepEqual(result, ["access_request", "delete_request"]);
});

test("getPolicyRightsSignals falls back to snippet arrays and filters non-string entries", () => {
  const result = getPolicyRightsSignals({}, {
    policy_rights_signals: ["opt_out_request", false, "appeal_request", { nope: true }]
  });

  assert.deepEqual(result, ["opt_out_request", "appeal_request"]);
});

test("getPolicyActionableFlags filters mixed raw arrays down to strings", () => {
  const result = getPolicyActionableFlags({
    policy_actionable_flags: ["low_confidence", { bad: true }, false, "llm_provider_error", ""]
  });

  assert.deepEqual(result, ["low_confidence", "llm_provider_error"]);
});

test("public policy projection keeps at most five first-party, semantically useful surfaces", () => {
  const surfaces = prioritizePublicPolicySurfaces([
    { type: "privacy_policy", url: "https://www.aruba.it/informativa_arubaspa.pdf" },
    { type: "cookie_policy", url: "https://www.aruba.it/cookie-policy.aspx" },
    { type: "terms_of_service", url: "https://www.aruba.it/terms.aspx" },
    { type: "privacy_policy", url: "https://hosting.aruba.it/privacy.aspx" },
    { type: "privacy_choice", url: "https://www.aruba.it/privacy-center.aspx" },
    { type: "privacy_policy", url: "https://www.aruba.it/privacy-extra.aspx" },
    { type: "privacy_policy", url: "https://www.cloudflare.com/privacypolicy/" },
    { type: "privacy_policy", url: "https://www.cookiebot.com/en/privacy-policy/" },
    { type: "privacy_policy", url: "https://www.aruba.it/informativa_arubaspa.pdf#section" }
  ], { siteDomain: "aruba.it" });

  assert.equal(surfaces.length, 5);
  assert.ok(surfaces.every((surface) => new URL(surface.url!).hostname.endsWith("aruba.it")));
  assert.equal(surfaces.filter((surface) => surface.url?.includes("informativa_arubaspa.pdf")).length, 1);
  assert.equal(surfaces[0]?.url, "https://www.aruba.it/informativa_arubaspa.pdf");
});
