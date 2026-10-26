import assert from "node:assert/strict";
import test from "node:test";
import { anonymousVisitorScanFrom, applyVisitorScanFromDefault } from "./visitor-scan-default";

test("only an anonymous US country hint defaults to California", () => {
  assert.equal(anonymousVisitorScanFrom(new Headers({"cf-ipcountry":"US"}),false),"california");
  assert.equal(anonymousVisitorScanFrom(new Headers({"cloudfront-viewer-country":"US"}),false),"california");
  for (const country of ["GB","IE","DE","CA","XX","T1","","US, GB","USA"]) {
    assert.equal(anonymousVisitorScanFrom(new Headers({"cf-ipcountry":country}),false),"eu_ie",country);
  }
  assert.equal(anonymousVisitorScanFrom(new Headers(),false),"eu_ie");
  assert.equal(anonymousVisitorScanFrom(new Headers({"cf-ipcountry":"GB","cloudfront-viewer-country":"US"}),false),"eu_ie");
  assert.equal(anonymousVisitorScanFrom(new Headers({"cf-ipcountry":"US"}),true),null);
});

test("late country hints preserve manual selection including a manual choice of the original default", () => {
  const base={current:"eu_ie",initialDefault:"eu_ie",suggested:"california",manuallySelected:false,submitting:false};
  assert.equal(applyVisitorScanFromDefault(base),"california");
  assert.equal(applyVisitorScanFromDefault({...base,manuallySelected:true}),"eu_ie");
  assert.equal(applyVisitorScanFromDefault({...base,submitting:true}),"eu_ie");
  assert.equal(applyVisitorScanFromDefault({...base,current:"eu_de"}),"eu_de");
  assert.equal(applyVisitorScanFromDefault({...base,current:"california",suggested:"eu_ie"}),"california");
  for (const suggested of [null,undefined,"US","local_extension",{},["california"]])
    assert.equal(applyVisitorScanFromDefault({...base,suggested}),"eu_ie");
});
