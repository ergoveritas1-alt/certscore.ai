import assert from "node:assert/strict";
import test from "node:test";
import { parseGpcGppPing } from "./gpc-gpp-parser";
const ping = (sectionId: 7 | 8, version = 1) => ({ gppVersion: "1.1", cmpStatus: "loaded", signalStatus: "ready", applicableSections: [sectionId], sectionList: [sectionId],
  parsedSections: { [sectionId === 7 ? "usnat" : "usca"]: [{ Version: version, SaleOptOutNotice: 1, SharingOptOutNotice: 1, SaleOptOut: 1, SharingOptOut: 2 }, { SubsectionType: 1, Gpc: true }] } });
test("US National v1/v2 and California preserve explicit sale/sharing states independently of targeted advertising", () => {
  for (const p of [ping(7), ping(7, 2), ping(8)]) {
    const r = parseGpcGppPing(p); assert.equal(r.status, "observed"); assert.equal(r.state?.saleOptOut, 1); assert.equal(r.state?.sharingOptOut, 2);
  }
});
test("wrong versions, conflicting applicability, duplicate IDs and missing sharing notice fail closed", () => {
  for (const defect of ["version", "conflict", "duplicate", "missing_notice", "targeting_only", "not_ready"]) {
    const p: any = ping(7, 2);
    if (defect === "version") p.parsedSections.usnat[0].Version = 3;
    if (defect === "conflict") p.applicableSections = [7, 8];
    if (defect === "duplicate") p.sectionList = [7, 7];
    if (defect === "missing_notice") delete p.parsedSections.usnat[0].SharingOptOutNotice;
    if (defect === "targeting_only") { delete p.parsedSections.usnat[0].SharingOptOut; p.parsedSections.usnat[0].TargetedAdvertisingOptOut = 1; }
    if (defect === "not_ready") p.signalStatus = "not ready";
    assert.notEqual(parseGpcGppPing(p).status, "observed", defect);
  }
});

test("documented flat US National state preserves explicit fields and rejects malformed GPC", () => {
  const p: any = ping(7);
  p.parsedSections.usnat = { ...p.parsedSections.usnat[0], Gpc: true, GpcSegmentType: 1 };
  assert.equal(parseGpcGppPing(p).status, "observed");
  assert.equal(parseGpcGppPing(p).reason, "ready_usnat_flat_object");
  assert.equal(parseGpcGppPing(p).state?.gpc, true);
  delete p.parsedSections.usnat.SharingOptOutNotice;
  assert.equal(parseGpcGppPing(p).status, "invalid");
  p.parsedSections.usnat.SharingOptOutNotice = 1;
  p.parsedSections.usnat.Gpc = "true";
  assert.equal(parseGpcGppPing(p).status, "invalid");
});

test("documented flat California section uses its own version and explicit sharing opt-out fields", () => {
  const p: any = ping(8);
  p.parsedSections.usca = { ...p.parsedSections.usca[0], Gpc: false, GpcSegmentType: 1 };
  assert.equal(parseGpcGppPing(p).reason, "ready_usca_flat_object");
  assert.equal(parseGpcGppPing(p).state?.sharingOptOut, 2);
  assert.equal(parseGpcGppPing(p).state?.gpc, false);
  p.parsedSections.usca.Version = 2;
  assert.equal(parseGpcGppPing(p).status, "invalid");
});
