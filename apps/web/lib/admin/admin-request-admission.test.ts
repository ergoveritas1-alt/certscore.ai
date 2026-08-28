import assert from "node:assert/strict";
import test from "node:test";
import { projectAdminRequestAdmission } from "./admin-request-admission";

test("projects a rejected rate-limited request as not admitted", () => {
  assert.deepEqual(projectAdminRequestAdmission({
    interruptionReason: "Anonymous scan daily limit reached.",
    linkedScanId: null,
    requestResolutionMode: "rate_limited",
    rowKind: "request",
    status: "rejected"
  }), {
    detail: "Anonymous scan daily limit reached.",
    freshnessLabel: "Not admitted",
    label: "Rate limited"
  });
});

test("projects other terminal unlinked requests without inventing scan outcomes", () => {
  assert.equal(projectAdminRequestAdmission({
    linkedScanId: null,
    requestResolutionMode: null,
    rowKind: "request",
    status: "rejected"
  })?.label, "Rejected");
  assert.equal(projectAdminRequestAdmission({
    linkedScanId: null,
    requestResolutionMode: null,
    rowKind: "request",
    status: "expired"
  })?.label, "Expired");
});

test("does not override linked scans or active requests", () => {
  assert.equal(projectAdminRequestAdmission({
    linkedScanId: "03b4f2ba-9f87-4ca8-a009-b0f45ca86c81",
    requestResolutionMode: "reused_existing_scan",
    rowKind: "request",
    status: "completed"
  }), null);
  assert.equal(projectAdminRequestAdmission({
    linkedScanId: null,
    requestResolutionMode: "queued_new_scan",
    rowKind: "request",
    status: "queued"
  }), null);
});
