import assert from "node:assert/strict";
import test from "node:test";
import { describePostRejectFinding, summarizePostRejectActivity } from "./post-reject-finding-copy";

const rows = [56, 57, 243, 409, 586, 774].map(msAfterReject => ({ vendor: "HubSpot", activityType: "network_request", msAfterReject }));
const evidence = {
  rejectInteractionConfirmed: true,
  postRejectNonEssentialActivityRetained: true,
  postRejectNonEssentialRequestCount: rows.length,
  postRejectNonEssentialRequests: rows.slice(0, 5),
  postRejectActivityDetails: summarizePostRejectActivity(rows),
};

test("full canonical aggregate describes six HubSpot requests despite the five-row display sample", () => {
  assert.deepEqual(describePostRejectFinding(evidence), {
    title: "HubSpot activity after Reject",
    summary: "6 non-essential HubSpot requests were observed 56–774 ms after confirmed Reject.",
  });
});

test("historical bounded samples cannot claim the full time range or attribute every activity", () => {
  const copy = describePostRejectFinding({ ...evidence, postRejectActivityDetails: undefined });
  assert.equal(copy?.title, "Non-essential activity after Reject");
  assert.match(copy!.summary, /6 non-essential activity observations.*including HubSpot/);
  assert.match(copy!.summary, /One retained observation occurred 56 ms/);
  assert.doesNotMatch(copy!.summary, /56–586|56–774/);
});

test("mixed vendors and writes stay correctly attributed with no invented missing timing", () => {
  const mixed = [rows[0]!, { vendor: "LinkedIn", activityType: "storage_write" }];
  const copy = describePostRejectFinding({ ...evidence, postRejectNonEssentialRequestCount: 2,
    postRejectNonEssentialRequests: mixed, postRejectActivityDetails: summarizePostRejectActivity(mixed) });
  assert.equal(copy?.title, "HubSpot and LinkedIn activity after Reject");
  assert.equal(copy?.summary, "2 non-essential HubSpot and LinkedIn activity observations were observed after confirmed Reject.");
});

test("unconfirmed clicks cannot be described as confirmed refusal and malformed aggregates fall back to sample facts", () => {
  assert.equal(describePostRejectFinding({ ...evidence, rejectInteractionConfirmed: false }), null);
  assert.doesNotMatch(describePostRejectFinding({ ...evidence,
    postRejectActivityDetails: { ...evidence.postRejectActivityDetails, activityCount: 99 } })!.summary, /56–774/);
});

test("contradiction and unchanged persistence retain their separate factual meaning", () => {
  assert.equal(describePostRejectFinding({ ...evidence, refusalSignalContradictsAction: true })?.title,
    "Consent state contradicted confirmed Reject");
  const copy = describePostRejectFinding({ rejectInteractionConfirmed: true, preConsentStorageNotClearedCount: 1,
    storagePresenceDoesNotEstablishActiveUse: true, scoreEffect: "none" });
  assert.equal(copy?.title, "Same non-essential identifier remained stored after Reject");
  assert.match(copy!.summary, /stored presence alone does not show active use/);
});
