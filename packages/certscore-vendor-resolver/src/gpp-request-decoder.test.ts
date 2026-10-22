import assert from "node:assert/strict";
import test from "node:test";
import { FibonacciIntegerEncoder, GppModel } from "@iabgpp/cmpapi";
import { decodeGppRequest } from "./gpp-request-decoder";
import { inspectGpcRequestQualification } from "./gpc-request-qualification";

const decode = (gpp: string, sid = "8", extra: Record<string,string> = {}, context: Parameters<typeof decodeGppRequest>[1] = {}) =>
  decodeGppRequest(new URLSearchParams({gpp,gpp_sid:sid,...extra}), context);
function encoded(section: "usca" | "usnat", values: Record<string,unknown>) {
  const model = new GppModel();
  for (const [key,value] of Object.entries(values)) model.setFieldValue(section,key,value);
  return model.encode();
}
const off = "DBABBg~BUoAAABA.YA";

test("IAB golden California body and US National v1/v2 decode without browser/API work", () => {
  // Body from IABTechLab/iabgpp-es modules/cmpapi/test/encoder/section/UsCa.test.ts.
  const california = decode("DBABBg~BVWSSSVY.YA");
  assert.equal(california.status,"decoded");assert.deepEqual(california.sectionIds,[8]);
  assert.deepEqual(california.sections,[{sectionId:8,version:1,saleNotice:1,sharingNotice:1,saleOptOut:1,sharingOptOut:1,
    serviceProviderMode:2,targetedAdvertisingOptOut:null,gpc:true}]);
  for(const version of [1,2]) {
    const raw = encoded("usnat",{Version:version,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:2,SharingOptOut:2,Gpc:true});
    const national = decode(raw,"7");assert.equal(national.status,"decoded");assert.equal(national.sections[0]!.version,version);
    assert.equal(national.sections[0]!.saleOptOut,2);assert.equal(national.sections[0]!.gpc,true);
  }
  assert.equal(decode("DBABBg~BAAAAABA").sections[0]!.gpc,null,"missing GPC segment is unknown, not false");
});

test("missing and mismatched section inventory cannot turn header-only data into an assessed opt-out", () => {
  for(const [raw,sid,reason]of [
    ["DBAA","8","applicable_section_missing"], ["DBABBg","8","section_inventory_mismatch"],
    ["DBABBg~","8","section_inventory_mismatch"], [off,"7","applicable_section_missing"],
    [off,"8,8","invalid_applicable_sections"], [off,"8,","invalid_applicable_sections"],
    [off,"","missing_applicable_sections"], [off,"-1","unsupported_applicable_section"],
  ]) { const r=decode(raw!,sid!);assert.notEqual(r.status,"decoded");assert.ok(r.reasons.includes(reason as never),JSON.stringify(r)); }
  const q=new URLSearchParams({gpp:off,gpp_sid:"8"});q.append("gpp",off);
  assert.equal(decodeGppRequest(q).status,"invalid");
  assert.equal(decodeGppRequest(new URLSearchParams()).status,"not_present");
  assert.equal(decodeGppRequest(new URLSearchParams({gpp_sid:"8"})).status,"invalid");
});

test("bounded preflight rejects malformed, extended, invalid-field and oversized encodings", () => {
  for(const raw of ["z", "DBABBg~B", `${off}.YA`, `${off}A`, "DBABBg~BbYbGwXY.YA", "DBABBg~BAAAAABA.YB", "DBABBg~BAAAAABA.QA~ignored", "DBABBg~BAAAAABA.QA=", "D"+"_".repeat(127)]) {
    assert.notEqual(decode(raw).status,"decoded",raw.slice(0,80));
  }
  assert.equal(decode("x".repeat(4097)).status,"limited");
  // A huge Fibonacci range is rejected before the dependency can expand it.
  const bits="0000110000010000000000011"+FibonacciIntegerEncoder.encode(1)+FibonacciIntegerEncoder.encode(100000);
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const padded=bits.padEnd(Math.ceil(bits.length/6)*6,"0");
  const header=padded.match(/.{6}/g)!.map(x=>alphabet[parseInt(x,2)]).join("");
  assert.equal(decode(header+"~BAAAAABA").status,"limited");
  assert.ok(decode(header+"~BAAAAABA").reasons.includes("input_limit"));
});

test("empty GPP retains independent applicability diagnostics without borrowing CMP or sibling request values", () => {
  const empty = decodeGppRequest(new URLSearchParams("gpp=&gpp_sid=&us_privacy=1NYN"));
  assert.equal(empty.status,"invalid");
  assert.deepEqual(empty.reasons,["missing_gpp","missing_applicable_sections"]);
  assert.deepEqual(empty.sections,[]);
  assert.equal(empty.cmpComparison,"not_compared");
  const declared = decodeGppRequest(new URLSearchParams("gpp=&gpp_sid=8"));
  assert.deepEqual(declared.applicableSections,[8]);
  assert.deepEqual(declared.reasons,["missing_gpp"]);
  const invalid = decode("","8,8");
  assert.deepEqual(invalid.reasons,["missing_gpp","invalid_applicable_sections"]);
  assert.equal(decode("","8".repeat(129)).status,"limited");
  const url="https://image6.pubmatic.com/AdServer/UCookieSetPug?gpp=&gpp_sid=&us_privacy=1NYN";
  const qualification=inspectGpcRequestQualification(url,{gpcDelivered:true,requestAtMs:4937,
    cmp:{capturedAtMs:4487,sectionId:8,saleNotice:2,sharingNotice:2,saleOptOut:1,sharingOptOut:1,gpc:true}});
  assert.deepEqual(qualification.gpp,empty);
  assert.ok(qualification.processingSignals.includes("gpp_unresolved"));
  assert.ok(qualification.processingSignals.includes("us_privacy_sale_opt_out"));
  assert.equal(decode("DBABBg~BoUAAAGY.YA").status,"decoded");
  assert.deepEqual(decode("DBAA").reasons,["applicable_section_missing"]);
  assert.deepEqual(decodeGppRequest(new URLSearchParams("gpp=&gpp_sid=&us_privacy=1NYN")),empty,
    "decoding a valid sibling request must not supply missing values");
});

test("same-request conflicts are explicit, while a later CMP state is never compared as simultaneous", () => {
  assert.equal(decode(off,"8",{us_privacy:"1NYN"}).requestSignals,"conflicting");
  assert.ok(decode(off,"8",{us_privacy:"1NYN"}).reasons.includes("us_privacy_conflict"));
  const context={gpcDelivered:true,requestAtMs:100,cmp:{capturedAtMs:100,sectionId:8 as const,saleNotice:1,sharingNotice:1,saleOptOut:1,sharingOptOut:1,gpc:true}};
  assert.equal(decode(off,"8",{},context).cmpComparison,"same_time_conflicting");
  assert.equal(decode(off,"8",{},{...context,cmp:{...context.cmp,capturedAtMs:101}}).cmpComparison,"later_readback");
  assert.equal(decode(off,"8",{},{...context,cmp:{...context.cmp,capturedAtMs:99}}).cmpComparison,"earlier_readback");
  const falseGpc=encoded("usca",{SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:2,SharingOptOut:2,Gpc:false});
  const result=decode(falseGpc,"8",{},{gpcDelivered:true});
  assert.equal(result.requestSignals,"consistent");assert.ok(result.reasons.includes("gpc_delivery_disagrees"));
  const request=inspectGpcRequestQualification("https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&"+new URLSearchParams({gpp:falseGpc,gpp_sid:"8"}),{gpcDelivered:true});
  assert.deepEqual(request.processingSignals,[],"failing to propagate GPC cannot erase supported identified collection");
});

test("applicable US National/California sections require consistent known states", () => {
  const model=new GppModel();
  for(const section of ["usnat","usca"])for(const [key,value]of Object.entries({SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:2,SharingOptOut:2,Gpc:true}))model.setFieldValue(section,key,value);
  const consistent=decode(model.encode(),"7,8");
  assert.equal(consistent.status,"decoded");assert.deepEqual(consistent.sectionIds,[7,8]);assert.equal(consistent.sections.length,2);
  assert.equal(consistent.requestSignals,"consistent");
  model.setFieldValue("usca","SaleOptOut",1);
  const conflicting=decode(model.encode(),"7,8");
  assert.equal(conflicting.status,"decoded");assert.equal(conflicting.requestSignals,"conflicting");
  assert.deepEqual(conflicting.reasons,["section_state_conflict"]);
});

test("restriction and service-provider declarations stay neutral; valid unrestricted GPP can support existing collection eligibility", () => {
  const url="https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&";
  for (const [raw,signal]of [
    ["DBABBg~BVWSSSVY.YA","gpp_opt_out"],
    [encoded("usca",{SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:2,SharingOptOut:2,MspaServiceProviderMode:1}),"gpp_service_provider"],
    ["DBAA","gpp_unresolved"],
  ]) assert.ok(inspectGpcRequestQualification(url+new URLSearchParams({gpp:raw!,gpp_sid:"8"})).processingSignals.includes(signal as never));
  assert.deepEqual(inspectGpcRequestQualification(url+new URLSearchParams({gpp:off,gpp_sid:"8"})).processingSignals,[]);
});
