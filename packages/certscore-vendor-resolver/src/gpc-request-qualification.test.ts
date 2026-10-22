import assert from "node:assert/strict";
import test from "node:test";
import { inspectGpcRequestQualification as inspect } from "./gpc-request-qualification";

test("closed identity and audience workflows differ from generic advertising delivery", () => {
  for (const url of [
    "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&npa=0",
    "https://www.google.com/pagead/1p-user-list/123/?cid=visitor-fixture",
    "https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=visitor-fixture&url=https%3A%2F%2Fsite.test",
    "https://www.facebook.com/tr/?id=publisher&ev=PageView&fbp=visitor-fixture",
    "https://bat.bing.com/action/0?ti=publisher&vid=visitor-fixture",
    "https://fastlane.rubiconproject.com/a/api/fastlane.json?eid_pubcid.org=visitor-fixture",
    "https://bcp.crwdcntrl.net/6/map?xcid=publisher",
    "https://rtb.openx.net/esp?url=https%3A%2F%2Fsite.test&rid=esp",
  ]) { assert.notEqual(inspect(url).activity, "unresolved", url); assert.deepEqual(inspect(url).processingSignals, []); }
  for (const url of [
    "https://securepubads.g.doubleclick.net/gampad/ads?iu=publisher&correlator=123&cookie_enabled=1",
    "https://googleads.g.doubleclick.net/pagead/id",
    "https://googleads.g.doubleclick.net/pagead/html/r2026/zrt_lookup.html",
    "https://www.google.com/pagead/viewthroughconversion/123/?random=123&guid=ON",
    "https://px.ads.linkedin.com/collect?pid=publisher&pageLoadId=page-fixture",
    "https://px.ads.linkedin.com/wa/?fmt=g",
    "https://fastlane.rubiconproject.com/a/api/fastlane.json?site_id=publisher&x_imp.ext.tid=request-fixture",
    "https://htlb.casalemedia.com/openrtb/pbjs?s=publisher",
    "https://www.google-analytics.com/g/collect?cid=visitor-fixture",
    "https://evil.test/tr/?id=publisher&ev=PageView&fbp=visitor-fixture",
  ]) assert.equal(inspect(url).activity, "unresolved", url);
});

test("restricted declarations remain request-local and neutral without claiming compliance", () => {
  const google = "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456";
  for (const [suffix, signal] of [
    ["rdp=1", "google_rdp"], ["npa=1", "google_npa"], ["ltd=1", "google_limited_ads"],
    ["us_privacy=1NYN", "us_privacy_sale_opt_out"], ["gpp=encoded-fixture", "gpp_unresolved"],
    ["npa=0&npa=1", "privacy_signal_invalid"], ["rdp=maybe", "privacy_signal_invalid"],
    ["us_privacy=1NNN&us_privacy=1NYN", "privacy_signal_invalid"],
  ]) assert.ok(inspect(`${google}&${suffix}`).processingSignals.includes(signal as never), suffix);
  assert.deepEqual(inspect(`${google}&us_privacy=1YNN&rdp=0&npa=0`).processingSignals, []);
  const meta = "https://www.facebook.com/tr/?id=publisher&ev=PageView&fbp=visitor-fixture";
  assert.deepEqual(inspect(`${meta}&dpo=LDU`).processingSignals, ["meta_ldu"]);
  assert.deepEqual(inspect(`${meta}&data_processing_options=%5B%22LDU%22%5D`).processingSignals, ["meta_ldu"]);
  assert.deepEqual(inspect(`${meta}&dpo=[]`).processingSignals, []);
  assert.equal(inspect("https://other.test/tr/?dpo=LDU").processingSignals.includes("meta_ldu"), false);
  assert.deepEqual(inspect(google).processingSignals, [], "a restricted sibling request does not change this request");
});

test("ambiguous identifiers and oversized/foreign protocols cannot qualify", () => {
  for (const id of ["", "0", "00000000-0000-0000-0000-000000000000", "null", "undefined", "[redacted]", "${CLIENT_ID}"])
    assert.equal(inspect(`https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=${encodeURIComponent(id)}`).activity, "unresolved");
  for (const url of [
    "http://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456",
    "https://stats.g.doubleclick.net.evil.test/g/collect?v=2&tid=G-ABC123&cid=123.456",
    "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&cid=789.012",
    "https://stats.g.doubleclick.net/g/collect-config?v=2&tid=G-ABC123&cid=123.456",
    "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456#rdp=1",
    `https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&padding=${"x".repeat(16384)}`,
  ]) assert.equal(inspect(url).activity, "unresolved", url.slice(0, 180));
});

test("Meta hashed email and phone qualify only on the reviewed pixel event endpoint", () => {
  const hash = "a1".repeat(32);
  for (const field of ["ud[em]", "ud[ph]"]) {
    const q = new URLSearchParams({id: "123", ev: "PageView", [field]: hash});
    const url = `https://www.facebook.com/tr/?${q}`;
    assert.equal(inspect(url).basis, "meta_advanced_matching_identifier");
    assert.equal(inspect("https://www.facebook.com/tr/", {}, q).basis, "meta_advanced_matching_identifier");
    assert.deepEqual(inspect(`${url}&dpo=LDU`).processingSignals, ["meta_ldu"]);
    for (const value of ["person@example.test", "15555555555", "", "a".repeat(32), "0".repeat(64), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]) {
      q.set(field, value);
      assert.equal(inspect(`https://www.facebook.com/tr/?${q}`).activity, "unresolved");
    }
    q.set(field, hash);q.append(field, hash);
    assert.equal(inspect(`https://www.facebook.com/tr/?${q}`).activity, "unresolved", "duplicate identity keys are ambiguous");
    q.delete(field);q.set(field,hash);
    for (const base of ["https://evil.test/tr/", "https://www.facebook.com/config/", "https://www.facebook.com/tr/?ev=PageView&"])
      assert.notEqual(inspect(base.includes("?") ? `${base}${field}=${hash}` : `${base}?${q}`).basis, "meta_advanced_matching_identifier");
  }
});

test('revised qualification treats NPA as context, requires a supported role, and preserves historical NPA treatment',async()=>{
 const {isQualifyingSaleSharingRequest}=await import('@certscore/contracts');
 const url='https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=visitor123&npa=1';
 const q=inspect(url);assert.ok(q.processingSignals.includes('google_npa'));
 assert.equal(isQualifyingSaleSharingRequest(q),true,'supported advertising identifier without cookie-match input');
 assert.equal(isQualifyingSaleSharingRequest({...q,policyVersion:undefined}),false,'historical rows retain their previous policy');
 for(const suffix of ['&rdp=1','&ltd=1','&us_privacy=1NYN','&npa=0','&gpp=opaque'])assert.equal(isQualifyingSaleSharingRequest(inspect(url+suffix)),false,suffix);
 for(const candidate of ['https://www.google-analytics.com/g/collect?v=2&tid=G-ABC&cid=visitor123&sid=123&npa=1','https://securepubads.g.doubleclick.net/gampad/ads?iu=123&npa=1'])
  assert.equal(isQualifyingSaleSharingRequest(inspect(candidate)),false,'identifier or NPA removal alone does not establish a qualifying role');
});
