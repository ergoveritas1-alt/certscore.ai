import assert from "node:assert/strict";
import test from "node:test";
import {
  getFindingReferenceHrefForReportFindingId,
  getFindingReferenceIdForReportFindingId
} from "./finding-reference-links";

test("getFindingReferenceHrefForReportFindingId maps report aliases to public finding pages", () => {
  assert.equal(
    getFindingReferenceHrefForReportFindingId("preconsent_tracking"),
    "/findings/pre_consent_tracking_detected"
  );
  assert.equal(
    getFindingReferenceHrefForReportFindingId("session_replay_observed"),
    "/findings/session_recording_services_detected"
  );
  assert.equal(
    getFindingReferenceHrefForReportFindingId("reject_did_not_reduce_tracking"),
    null
  );
  assert.equal(
    getFindingReferenceHrefForReportFindingId("tracking_cookies_set_before_consent"),
    "/findings/third_party_cookie_pre_consent"
  );
  assert.equal(
    getFindingReferenceHrefForReportFindingId("fingerprinting_observed"),
    "/findings/probable_fingerprinting"
  );
});

test("getFindingReferenceIdForReportFindingId returns direct registry IDs when available", () => {
  assert.equal(getFindingReferenceIdForReportFindingId("rtb_cookie_sync_observed"), "rtb_cookie_sync_observed");
  assert.equal(getFindingReferenceIdForReportFindingId("probable_fingerprinting"), "probable_fingerprinting");
});

test("getFindingReferenceHrefForReportFindingId omits non-registry report findings", () => {
  assert.equal(getFindingReferenceHrefForReportFindingId("privacy_policy_missing_surface"), null);
});
