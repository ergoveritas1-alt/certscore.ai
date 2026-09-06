import assert from "node:assert/strict";
import test from "node:test";
import { findRuntimeCookieOwner, findRuntimeEntityOwner, findRuntimeRequestOwner } from "./runtime-vendor-ownership";
import { inferDirectEndpointVendorFromUrl } from "./preconsent-public-evidence";

test("inventory and finding evidence use the same precise endpoint attribution", () => {
  assert.equal(findRuntimeRequestOwner("https://bat.bing.com/action/0")?.product, "Microsoft Advertising / Bing UET");
  assert.equal(inferDirectEndpointVendorFromUrl("https://bat.bing.com/action/0")?.vendorName, "Microsoft Advertising / Bing UET");
  assert.equal(findRuntimeRequestOwner("https://ad.doubleclick.net/activity;src=123")?.product, "DoubleClick Floodlight");
});

test("ambiguous or generic owner hosts cannot acquire a product through report fallbacks", () => {
  assert.equal(findRuntimeRequestOwner("https://mc.yandex.com/metrika"), null);
  assert.equal(inferDirectEndpointVendorFromUrl("https://mc.yandex.com/metrika"), null);
  assert.equal(findRuntimeEntityOwner("google.com"), null);
  assert.equal(inferDirectEndpointVendorFromUrl("https://googleadservices.com/unrecognized"), null);
});

test("cookie knowledge fallback cannot restore a context-rejected vendor", () => {
  for (const name of ["MR", "MUID", "ANONCHK", "SM"]) {
    assert.equal(findRuntimeCookieOwner(name, "example.test"), null);
    assert.equal(findRuntimeCookieOwner(name, "bing.com.example.test"), null);
    assert.equal(findRuntimeCookieOwner(name, "c.bing.com")?.product, "Microsoft Identity Synchronization");
  }
});
