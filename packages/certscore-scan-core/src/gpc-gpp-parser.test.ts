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

test("array GPP sections accept canonical GpcSegmentType and reject conflicting or missing type fields", () => {
  const canonical: any = ping(8);
  canonical.parsedSections.usca[1] = { GpcSegmentType: 1, Gpc: true };
  assert.equal(parseGpcGppPing(canonical).status, "observed");

  const conflicting: any = ping(8);
  conflicting.parsedSections.usca[1] = { GpcSegmentType: 1, SubsectionType: 2, Gpc: true };
  assert.deepEqual(parseGpcGppPing(conflicting).diagnosticCodes, ["gpc_subsection_type_conflict"]);

  const missing: any = ping(8);
  missing.parsedSections.usca[1] = { Gpc: true };
  assert.deepEqual(parseGpcGppPing(missing).diagnosticCodes, ["gpc_subsection_type_missing"]);

  const disallowed: any = ping(8);
  disallowed.parsedSections.usca[1] = { GpcSegmentType: 2, Gpc: true };
  assert.deepEqual(parseGpcGppPing(disallowed).diagnosticCodes, ["gpc_subsection_type_invalid"]);

  const nonBoolean: any = ping(8);
  nonBoolean.parsedSections.usca[1] = { GpcSegmentType: 1, Gpc: 1 };
  assert.deepEqual(parseGpcGppPing(nonBoolean).diagnosticCodes, ["gpc_value_invalid"]);
});

test("diagnostics expose only bounded field codes for readiness and malformed sections", () => {
  const notReady: any = ping(7);
  notReady.cmpStatus = "loading";
  notReady.signalStatus = "not ready";
  const readiness = parseGpcGppPing(notReady);
  assert.equal(readiness.status, "not_ready");
  assert.deepEqual(readiness.diagnosticCodes, ["cmp_status_not_loaded", "signal_status_not_ready"]);

  const malformed: any = ping(8);
  delete malformed.parsedSections.usca[0].SharingOptOutNotice;
  malformed.parsedSections.usca[0].SaleOptOut = "opaque-private-value";
  const fields = parseGpcGppPing(malformed);
  assert.equal(fields.status, "invalid");
  assert.deepEqual(fields.diagnosticCodes, ["sharing_notice_invalid", "sale_opt_out_invalid"]);
  assert.doesNotMatch(JSON.stringify(fields), /opaque-private-value|gppString|cookie/i);

  const flat: any = ping(8);
  flat.parsedSections.usca = { ...flat.parsedSections.usca[0], Gpc: false, GpcSegmentType: 1 };
  assert.deepEqual(parseGpcGppPing(flat).diagnosticCodes, ["flat_usca_section"]);
});

test("oversized section inventories fail before duplicate-set iteration", () => {
  const oversized: any = ping(7);
  const hostile = new Proxy(new Array(33).fill(7), {
    get(target, property, receiver) {
      if (property === Symbol.iterator) throw new Error("must not iterate oversized inventory");
      return Reflect.get(target, property, receiver);
    },
  });
  oversized.sectionList = hostile;
  const result = parseGpcGppPing(oversized);
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.diagnosticCodes, ["section_inventory_too_large"]);
});
