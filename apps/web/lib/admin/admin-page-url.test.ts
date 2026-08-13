import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdminPageUrl } from "./admin-page-url";

test("admin page URL prefers the exact requested URL", () => {
  assert.deepEqual(resolveAdminPageUrl({
    requestedUrl: " https://example.com/requested ",
    normalizedUrl: "https://example.com/normalized",
    scanConfig: { normalizedUrl: "https://example.com/configured" },
    scanDomain: "example.com"
  }), {
    source: "requested_url",
    url: "https://example.com/requested"
  });
});

test("admin page URL falls back through normalized and configured URLs", () => {
  assert.deepEqual(resolveAdminPageUrl({ normalizedUrl: "https://example.com/normalized" }), {
    source: "normalized_url",
    url: "https://example.com/normalized"
  });
  assert.deepEqual(resolveAdminPageUrl({ scanConfig: { normalizedUrl: "https://example.com/configured" } }), {
    source: "scan_config",
    url: "https://example.com/configured"
  });
});

test("admin page URL recovers a safe URL from the linked scan domain", () => {
  assert.deepEqual(resolveAdminPageUrl({ scanDomain: "southfreak.fyi" }), {
    source: "scan_domain",
    url: "https://southfreak.fyi/"
  });
  assert.equal(resolveAdminPageUrl({ scanDomain: "not a domain" }), null);
});
