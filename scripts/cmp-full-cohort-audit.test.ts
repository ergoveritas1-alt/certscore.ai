import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { summarizeArchive, verifyArchiveRows } from "./cmp-full-cohort-audit";

function fixture(t: test.TestContext, status = "unconfirmed", completed = true) {
  const dir = mkdtempSync(join(tmpdir(), "cmp-full-cohort-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "export.json");
  const exported = { scanId: "scan-1", domain: "example.com", consentSurfaceEvidence: { consentSummary: { cmpName: "OneTrust CMP" } },
    postAcceptObservation: { status, execution: { clickCompleted: true, observationCompleted: completed }, indeterminateReason: "window_truncated" } };
  const bytes = JSON.stringify(exported); writeFileSync(file, bytes);
  const row = { scanId: "scan-1", site: "example.com", action: "accept" as const, cmp: "OneTrust CMP", click: true,
    observationCompleted: completed, registration: status, reason: "window_truncated", source: { file, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: Buffer.byteLength(bytes) } };
  return { file, exported, row };
}
test("historical aborted completed click remains a third category in the denominator", t => {
  const { row } = fixture(t, "aborted", false);
  assert.equal(verifyArchiveRows([row]).size, 1);
  const [summary] = summarizeArchive([{ ...row, provider: "OneTrust" }, { ...row, provider: "OneTrust", registration: "confirmed" }, { ...row, provider: "OneTrust", registration: "unconfirmed" }]);
  assert.equal(summary!.completedClicks, 3); assert.equal(summary!.confirmed, 1); assert.equal(summary!.unconfirmed, 1); assert.equal(summary!.unresolved, 1); assert.equal(summary!.aborted, 1);
});
test("historical schema missing execution does not become a completed action", t => {
  const { row, file, exported } = fixture(t);
  delete (exported.postAcceptObservation as any).execution;
  const bytes = JSON.stringify(exported); writeFileSync(file, bytes);
  row.source.sha256 = createHash("sha256").update(bytes).digest("hex"); row.source.bytes = Buffer.byteLength(bytes);
  assert.throws(() => verifyArchiveRows([row]), /facts disagree/);
});
test("cohort facts cannot promote registration or replace source-session attribution", t => {
  const { row } = fixture(t);
  assert.throws(() => verifyArchiveRows([{ ...row, registration: "confirmed" }]), /facts disagree/);
  assert.throws(() => verifyArchiveRows([{ ...row, cmp: "CookieYes" }]), /attribution/);
});
test("wrong scan or target cannot reuse another export", t => {
  const { row } = fixture(t);
  assert.throws(() => verifyArchiveRows([{ ...row, scanId: "another-session" }]), /scan identity/);
  assert.throws(() => verifyArchiveRows([{ ...row, site: "another.example" }]), /site identity/);
});
test("hash drift and duplicate action identities fail closed", t => {
  const { row, file } = fixture(t);
  assert.throws(() => verifyArchiveRows([row, row]), /Duplicate/);
  writeFileSync(file, "{}"); assert.throws(() => verifyArchiveRows([row]), /hash\/size/);
});
test("different checksums on a reused source path cannot bypass verification", t => {
  const { row } = fixture(t);
  assert.throws(() => verifyArchiveRows([row, { ...row, action: "reject", source: { ...row.source, sha256: "a".repeat(64) } }]), /Conflicting source hash/);
});
test("notification-only and unavailable status stay unresolved and never count as consent", () => {
  const [summary] = summarizeArchive(["notification_acknowledged", "not_checked", "unconfirmed"].map(registration => ({ provider: "CMP identity unverified", site: "example.com", registration })));
  assert.equal(summary!.completedClicks, 3); assert.equal(summary!.confirmed, 0); assert.equal(summary!.unresolved, 2); assert.equal(summary!.unconfirmed, 1);
});

import { comparePacketReplays, summarizePacketReplay, type PacketReplayRow } from "./cmp-full-cohort-audit";
const replayRow: PacketReplayRow = { scanId:"packet-with-no-completed-export",site:"example.com",action:"reject",
  source:{file:"original-packet.json",sha256:"a".repeat(64),bytes:123}, initialRegistrationStatus:"unconfirmed", terminalDecisionRetained:false,
  stages:{provider:"Cookiebot",measures:{decisionVerified:false,clickCompleted:true,observationCompleted:true}} };
test("full packet comparison detects a terminal-only gain outside completed export intersections", () => {
  const after = {...replayRow,terminalDecisionRetained:true,stages:{...replayRow.stages,measures:{...replayRow.stages.measures,decisionVerified:true}}};
  const comparison = comparePacketReplays([replayRow], [after]);
  assert.equal(comparison.comparedActions, 1); assert.equal(comparison.changes.length, 1);
  assert.equal(comparison.changes[0]!.initialChanged, false); assert.equal(comparison.changes[0]!.decisionChanged, true);
  assert.equal(comparison.distinctSitesWithNewConfirmation, 1);
  const overall = summarizePacketReplay([after])[0]!;
  assert.equal(overall.initialConfirmed, 0); assert.equal(overall.initialUnconfirmed, 1);
  assert.equal(overall.operationalConfirmed, 1); assert.equal(overall.verifiedTerminalEvidence, 1);
});
test("full packet comparison preserves unattempted rows and rejects missing, duplicate or wrong-source rows", () => {
  const unattempted = {...replayRow,scanId:"unattempted",initialRegistrationStatus:"not_attempted",stages:{provider:null,measures:{decisionVerified:false,clickCompleted:false,observationCompleted:false}}};
  const before = [replayRow,unattempted];
  assert.equal(comparePacketReplays(before,before).comparedActions,2);
  assert.throws(() => comparePacketReplays(before,[replayRow]), /denominator changed/);
  assert.throws(() => comparePacketReplays(before,[replayRow,replayRow]), /Duplicate packet/);
  assert.throws(() => comparePacketReplays([replayRow],[{...replayRow,source:{...replayRow.source,sha256:"b".repeat(64)}}]), /evidence drift/);
});
test("attribution-only changes never count as action verification improvements", () => {
  const result = comparePacketReplays([replayRow],[{...replayRow,stages:{...replayRow.stages,provider:"CookieYes"}}]);
  assert.equal(result.changes[0]!.attributionChanged,true); assert.equal(result.changes[0]!.decisionChanged,false);
  assert.equal(result.distinctSitesWithNewConfirmation,0);
});

import { verifyCoverageSupplement } from "./cmp-full-cohort-audit";
function supplementalFixture(t: test.TestContext) {
  const dir=mkdtempSync(join(tmpdir(),"cmp-supplement-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const write=(name:string,value:unknown)=>{const file=join(dir,name),bytes=JSON.stringify(value);writeFileSync(file,bytes);return{file,sha256:createHash("sha256").update(bytes).digest("hex"),bytes:Buffer.byteLength(bytes)}};
  const fixedCohort=write("cohort.json",{policyVersion:"fixture"});
  const packet=write("packet.json",{parentScanId:"scan-1"});
  const uri="s3://original-artifacts/scan-1/PostAcceptEvidencePacket.json";
  const expected={sha256:packet.sha256,sizeBytes:packet.bytes};
  const inventory=write("inventory.json",[{id:"scan-1",retained:[{pointers:{postAcceptPacketUri:uri},hashes:{postAcceptPacketUri:expected}}]}]);
  const receipts=write("receipts.json",[{scanId:"scan-1",kind:"postAcceptPacketUri",uri,eventIndex:0,expected,sha256:packet.sha256,bytes:packet.bytes,verified:true}]);
  const row={scanId:"scan-1",site:"example.com",action:"accept",registration:"unconfirmed",source:packet,origin:{inventory,retrievalReceipts:receipts,eventIndex:0,uri}};
  const manifest={policyVersion:"cmp_retained_coverage_supplement.v1",fixedCohort,rows:[row]};
  return{write,manifest,row,fixedCohort};
}
test("supplement requires original inventory pointer, expected checksum, receipt and parent scan agreement",t=>{
  const f=supplementalFixture(t);let ref=f.write("supplement.json",f.manifest);
  assert.equal(verifyCoverageSupplement(ref.file,f.fixedCohort.sha256).length,1);
  f.row.origin.uri="s3://unrelated/other-packet.json";ref=f.write("bad-uri.json",f.manifest);
  assert.throws(()=>verifyCoverageSupplement(ref.file,f.fixedCohort.sha256),/pointer\/hash binding/);
});
test("supplement cannot substitute a changed cohort, retrieval receipt or later event",t=>{
  const f=supplementalFixture(t);let ref=f.write("supplement.json",f.manifest);
  assert.throws(()=>verifyCoverageSupplement(ref.file,"b".repeat(64)),/cohort binding/);
  f.row.origin.eventIndex=1;ref=f.write("later-event.json",f.manifest);
  assert.throws(()=>verifyCoverageSupplement(ref.file,f.fixedCohort.sha256),/event\/action/);
  f.row.origin.eventIndex=0;f.row.origin.retrievalReceipts=f.write("wrong-receipts.json",[]);ref=f.write("wrong-proof.json",f.manifest);
  assert.throws(()=>verifyCoverageSupplement(ref.file,f.fixedCohort.sha256),/retrieval receipt/);
});

test("older singular retained-inventory schema keeps exact source binding",t=>{
  const f=supplementalFixture(t);
  const source=f.row.source,uri=f.row.origin.uri;
  f.row.origin.inventory=f.write("legacy-inventory.json",[{id:"scan-1",retained:{pointers:{postAcceptPacketUri:uri},hashes:{postAcceptPacketUri:{sha256:source.sha256,sizeBytes:source.bytes}}}}]);
  const ref=f.write("legacy-supplement.json",f.manifest);
  assert.equal(verifyCoverageSupplement(ref.file,f.fixedCohort.sha256).length,1);
});
