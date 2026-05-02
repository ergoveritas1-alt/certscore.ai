import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "playwright";
import {
  createRequestBlockingStats,
  recordBlockedHeavyAssetRequest,
  shouldBlockHeavyAssetRequest
} from "./request-blocking";

function request(resourceType: string, url: string): Request {
  return {
    resourceType: () => resourceType,
    url: () => url
  } as Request;
}

test("shouldBlockHeavyAssetRequest blocks video and media", () => {
  assert.equal(shouldBlockHeavyAssetRequest(request("media", "https://example.com/video")).block, true);
});

test("shouldBlockHeavyAssetRequest keeps compliance-critical request types enabled", () => {
  for (const resourceType of ["document", "script", "xhr", "fetch", "stylesheet", "image", "font"]) {
    assert.equal(
      shouldBlockHeavyAssetRequest(request(resourceType, `https://example.com/${resourceType}`)).block,
      false,
      resourceType
    );
  }
});

test("shouldBlockHeavyAssetRequest blocks common video file extensions in full mode", () => {
  assert.deepEqual(shouldBlockHeavyAssetRequest(request("other", "https://cdn.example.com/video.m3u8")), {
    block: true,
    reason: "extension"
  });
  assert.equal(shouldBlockHeavyAssetRequest(request("other", "https://cdn.example.com/logo.svg?cache=1")).block, false);
  assert.equal(shouldBlockHeavyAssetRequest(request("other", "https://cdn.example.com/video.mp4"), "light").block, false);
});

test("recordBlockedHeavyAssetRequest counts blocked resources", () => {
  const stats = createRequestBlockingStats();
  recordBlockedHeavyAssetRequest(stats, request("media", "https://example.com/a.mp4"), "resource_type");
  recordBlockedHeavyAssetRequest(stats, request("other", "https://example.com/a.m3u8"), "extension");

  assert.equal(stats.blockedCount, 2);
  assert.equal(stats.blockedByResourceTypeCount, 1);
  assert.equal(stats.blockedByExtensionCount, 1);
  assert.equal(stats.blockedByType.media, 1);
  assert.equal(stats.blockedByType.other, 1);
});
