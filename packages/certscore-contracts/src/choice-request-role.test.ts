import assert from "node:assert/strict";
import test from "node:test";
import { choiceRequestRole } from "./choice-request-role";

test("distinguishes library downloads from advertising and analytics measurement", () => {
  for (const path of ["/gtm.js", "/gtag/js", "/gtag/destination"]) {
    const url = "https://www.googletagmanager.com" + path + "?id=G-EXAMPLE";
    assert.equal(choiceRequestRole(url, "GET", "Script"), "tag_library");
    assert.equal(choiceRequestRole(url + "&cid=visitor", "GET", "Script"), undefined);
  }
  const url = "https://pagead2.googlesyndication.com/ccm/collect";
  assert.equal(choiceRequestRole(url, "POST", "Fetch"), "advertising");
  assert.equal(choiceRequestRole(url, "OPTIONS", "Fetch"), undefined);
  assert.equal(choiceRequestRole(url.replace(".com/", ".com.example/"), "POST", "Fetch"), undefined);
  const hit = "https://measure.publisher.test/g/collect?v=2&tid=G-EXAMPLE&en=page_view&cid=test";
  assert.equal(choiceRequestRole(hit, "GET", "fetch"), "analytics");
  for (const key of ["v", "tid", "en", "cid"]) {
    const incomplete = new URL(hit);
    incomplete.searchParams.delete(key);
    assert.equal(choiceRequestRole(incomplete.href, "GET", "fetch"), undefined);
  }
  assert.equal(choiceRequestRole(hit, "GET", "image"), undefined);
  assert.equal(choiceRequestRole(hit + "&en=purchase", "GET", "fetch"), undefined);
});

test("Sanity batch review is limited to POST data requests to the exact endpoint", () => {
  const url = "https://www.sanity.io/intake/dp/beacon/v1/batch";
  assert.equal(choiceRequestRole(url, "POST", "Ping"), "sanity_batch_beacon");
  assert.equal(choiceRequestRole(url + "?writeKey=example", "POST", "fetch"), "sanity_batch_beacon");
  for (const other of [url + "/another", url.replace("www.sanity.io", "other.test"), url.replace("https:", "http:")]) {
    assert.equal(choiceRequestRole(other, "POST", "ping"), undefined);
  }
  assert.equal(choiceRequestRole(url, "GET", "ping"), undefined);
  assert.equal(choiceRequestRole(url, "POST", "document"), undefined);
});
