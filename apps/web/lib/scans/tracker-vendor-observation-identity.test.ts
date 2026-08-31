import assert from "node:assert/strict";
import test from "node:test";
import { buildTrackerVendorObservationIdentityKey } from "./tracker-vendor-observation-identity";

test("tracker observation identity preserves distinct retained signatures", () => {
  const base = {
    detectionSource: "vendor resolver",
    scriptHost: "analytics.example.test",
    vendorName: "Example Analytics",
  };

  const requestSignature = buildTrackerVendorObservationIdentityKey({
    ...base,
    matchedSignatureId: "example_request_signature",
  });
  const scriptSignature = buildTrackerVendorObservationIdentityKey({
    ...base,
    matchedSignatureId: "example_script_signature",
  });
  const duplicateRequestSignature = buildTrackerVendorObservationIdentityKey({
    ...base,
    matchedSignatureId: "example_request_signature",
  });

  assert.notEqual(requestSignature, scriptSignature);
  assert.equal(requestSignature, duplicateRequestSignature);
});
