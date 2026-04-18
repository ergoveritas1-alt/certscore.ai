import assert from "node:assert/strict";
import test from "node:test";
import {
  buildValidationWorkerBrowserNavigationHeaders,
  buildValidationWorkerDocumentHeaders,
  shouldSignValidationWorkerBrowserNavigation
} from "./web-bot-auth";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/certscore";
process.env.VALIDATION_CRAWLER_PUBLIC_URL ??= "https://crawler.example.com";
process.env.WEB_BOT_AUTH_ENABLED ??= "0";

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

test("shouldSignValidationWorkerBrowserNavigation only accepts main-frame document navigations", () => {
  assert.equal(
    shouldSignValidationWorkerBrowserNavigation({
      isMainFrame: true,
      isNavigationRequest: true,
      resourceType: "document"
    }),
    true
  );

  assert.equal(
    shouldSignValidationWorkerBrowserNavigation({
      isMainFrame: false,
      isNavigationRequest: true,
      resourceType: "document"
    }),
    false
  );

  assert.equal(
    shouldSignValidationWorkerBrowserNavigation({
      isMainFrame: true,
      isNavigationRequest: false,
      resourceType: "document"
    }),
    false
  );

  assert.equal(
    shouldSignValidationWorkerBrowserNavigation({
      isMainFrame: true,
      isNavigationRequest: true,
      resourceType: "script"
    }),
    false
  );
});

test("buildValidationWorkerBrowserNavigationHeaders skips non-document or subresource traffic", () => {
  const result = buildValidationWorkerBrowserNavigationHeaders({
    currentPageUrl: "https://www.example.com/",
    requestHeaders: {},
    requestTarget: {
      isMainFrame: true,
      isNavigationRequest: false,
      resourceType: "document"
    },
    url: "https://www.example.com/privacy"
  });

  assert.equal(result, null);
});

test("buildValidationWorkerBrowserNavigationHeaders falls back to the current page as referer", () => {
  const result = buildValidationWorkerBrowserNavigationHeaders({
    currentPageUrl: "https://www.example.com/",
    requestHeaders: {},
    requestTarget: {
      isMainFrame: true,
      isNavigationRequest: true,
      resourceType: "document"
    },
    url: "https://www.example.com/privacy"
  });

  assert.ok(result);
  assert.equal(result.headers.Referer, "https://www.example.com/");
  assert.equal(result.headers["Sec-Fetch-Site"], "same-origin");
});
