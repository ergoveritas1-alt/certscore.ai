import assert from "node:assert/strict";
import test from "node:test";
import { buildValidationWorkerDocumentHeaders } from "./web-bot-auth";

test("buildValidationWorkerDocumentHeaders emits browser navigation headers with same-origin referer", () => {
  const request = buildValidationWorkerDocumentHeaders({
    referer: "https://www.lookout.com/",
    url: "https://www.lookout.com/privacy"
  });

  assert.equal(request.headers["Sec-Fetch-Dest"], "document");
  assert.equal(request.headers["Sec-Fetch-Mode"], "navigate");
  assert.equal(request.headers["Sec-Fetch-Site"], "same-origin");
  assert.equal(request.headers["Sec-Fetch-User"], "?1");
  assert.equal(request.headers["Upgrade-Insecure-Requests"], "1");
  assert.equal(request.headers.Referer, "https://www.lookout.com/");
  assert.match(request.headers["User-Agent"] ?? "", /Chrome\/123/);
  assert.equal(request.metadata.requestProfile, "browser_document_navigation");
  assert.equal(request.metadata.referer, "https://www.lookout.com/");
});

test("buildValidationWorkerDocumentHeaders omits referer when none is provided", () => {
  const request = buildValidationWorkerDocumentHeaders({
    url: "https://www.example.com/legal/privacy-policy"
  });

  assert.equal(request.headers.Referer, undefined);
  assert.equal(request.headers["Sec-Fetch-Site"], "none");
  assert.equal(request.metadata.referer, null);
});
