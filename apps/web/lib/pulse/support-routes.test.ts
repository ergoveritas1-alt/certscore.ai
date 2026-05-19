import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasDatabaseEnv } from "@website-signal-risk-scanner/db";
import { GET as discoveryGET } from "../../app/.well-known/certscore-pulse/route";
import { GET as openApiGET } from "../../app/api/v1/openapi.json/route";
import { POST as feedbackPOST } from "../../app/api/v1/pulse/feedback/route";
import { buildPulseError } from "./error";
import { normalizePulseUrl } from "./request";

test("OpenAPI route returns valid Pulse API JSON", async () => {
  const response = openApiGET();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);

  const body = await response.json();
  assert.equal(body.openapi, "3.1.0");
  assert.ok(body.paths["/api/v1/pulse"]);
  assert.ok(body.paths["/api/v1/pulse/status/{jobId}"]);
  assert.ok(body.paths["/api/v1/pulse/feedback"]);

  const pulseParameters = body.paths["/api/v1/pulse"].get.parameters.map((parameter: { name: string }) => parameter.name);
  assert.deepEqual(
    ["url", "scanId", "jobId", "format", "detail", "freshness", "wait"].every((name) => pulseParameters.includes(name)),
    true
  );
  assert.match(JSON.stringify(body), /api-pulse/);
  assert.match(JSON.stringify(body), /findings/);
  assert.doesNotMatch(JSON.stringify(body), /stack trace|internal-only|raw DOM/i);
});

test("Pulse OpenAPI smoke: /api/v1/openapi.json is JSON OpenAPI 3.1, not an app error page", async () => {
  const response = openApiGET();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/);

  const rawBody = await response.text();
  assert.doesNotMatch(rawBody, /<!doctype html|<html|__NEXT_DATA__|sign in|login/i);
  assert.doesNotMatch(rawBody, /Internal Error|internal error|stack trace|DATABASE_URL|AUTH_SECRET|PRIVATE_KEY/);

  const body = JSON.parse(rawBody);
  assert.equal(body.openapi, "3.1.0");
  assert.equal(body.info.title, "CertScore Pulse API");
  assert.ok(body.paths["/api/v1/pulse"]);
  assert.match(rawBody, /CertScore provides automated public-web observations for review/);
});

test("Pulse discovery route returns compact machine-readable metadata", async () => {
  const response = discoveryGET();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);

  const body = await response.json();
  assert.equal(body.name, "CertScore Pulse");
  assert.equal(body.api, "https://certscore.ai/api/v1/pulse");
  assert.equal(body.openapi, "https://certscore.ai/api/v1/openapi.json");
  assert.equal(body.docs, "https://certscore.ai/api-pulse");
  assert.deepEqual(body.formats, ["json", "markdown"]);
  assert.ok(body.detailLevels.includes("tiny"));
  assert.ok(body.detailLevels.includes("standard"));
  assert.ok(body.detailLevels.includes("full"));
  assert.deepEqual(body.detailLevels, ["tiny", "standard", "full"]);
  assert.deepEqual(body.detailAliases, { quick: "tiny" });
  assert.equal(body.feedbackEmail, "support@certscore.ai");
  assert.equal(body.disclaimer, "Automated public-web observations for review. Not legal advice, certification, or a compliance determination.");
});

test("Pulse docs page source includes integration-critical guidance", () => {
  const source = readFileSync("apps/web/app/api-pulse/page.tsx", "utf8");

  assert.match(source, /CertScore Pulse API/);
  assert.match(source, /OpenAPI JSON/);
  assert.match(source, /PULSE_FEEDBACK_EMAIL/);
  assert.match(source, /PULSE_STANDARD_DISCLAIMER/);
  assert.match(source, /Copy\/paste examples/);
  assert.match(source, /Open quick-start endpoint/);
  assert.match(source, /Open test URL/);
  assert.match(source, /href: "https:\/\/certscore\.ai\/api\/v1\/pulse\?url=https:\/\/example\.com&detail=tiny"/);
  assert.match(source, /href: "https:\/\/certscore\.ai\/api\/v1\/pulse\?url=https:\/\/example\.com&format=markdown"/);
  assert.match(source, /detail=quick/);
  assert.match(source, /Status lifecycle|queued to running to finalizing to completed/);
  assert.match(source, /`scanId` is the canonical field name/);
  assert.match(source, /200 completed tiny JSON/);
  assert.match(source, /200 completed full JSON/);
  assert.match(source, /202 pending\/running response/);
  assert.match(source, /429 throttled response/);
});

test("Pulse OpenAPI includes documented live response examples", async () => {
  const response = openApiGET();
  const body = await response.json();
  const responses = body.paths["/api/v1/pulse"].get.responses;

  assert.ok(responses["200"].content["application/json"].examples.tiny);
  assert.ok(responses["200"].content["application/json"].examples.standard);
  assert.ok(responses["200"].content["application/json"].examples.full);
  assert.ok(responses["200"].content["text/markdown"].examples.markdown);
  assert.ok(responses["202"].content["application/json"].examples.pending);
  assert.ok(responses["400"].content["application/json"].examples.invalidUrl);
  assert.ok(responses["429"].content["application/json"].examples.throttled);
  assert.equal(responses["202"].content["application/json"].examples.pending.value.type, "certscore_pulse_status");
  assert.equal(responses["429"].content["application/json"].examples.throttled.value.error.code, "pulse_throttled");
  assert.match(JSON.stringify(responses), /CertScore provides automated public-web observations for review/);
});

test("Pulse OpenAPI and discovery routes stay static and dependency-light", () => {
  const supportRoutes = [
    "apps/web/app/api/v1/openapi.json/route.ts",
    "apps/web/app/.well-known/certscore-pulse/route.ts"
  ];

  for (const routePath of supportRoutes) {
    const source = readFileSync(routePath, "utf8");
    assert.doesNotMatch(source, /^import\s/m, `${routePath} should not import runtime dependencies`);
    assert.doesNotMatch(source, /from\s+["'][^"']*(db|server|auth|queue|redis|pulse\/repository|internal)["']/i);
    assert.doesNotMatch(source, /fetch\(/i, `${routePath} should not call internal or external fetch`);
    assert.doesNotMatch(source, /process\.env/i, `${routePath} should not depend on runtime environment variables`);
  }
});

test("Pulse invalid-input errors use the documented public-safe shape", () => {
  const body = buildPulseError({ code: "invalid_url", message: "Enter a valid public website URL or domain.", detail: "tiny", format: "json" });

  assert.equal(body.type, "certscore_pulse_error");
  assert.equal(body.request.detail, "tiny");
  assert.equal(body.error.code, "invalid_url");
  assert.equal(body.feedback.email, "support@certscore.ai");
  assert.match(body.disclaimer, /automated public-web observations for review/i);
  assert.doesNotMatch(JSON.stringify(body), /stack|DATABASE_URL|token|secret/i);
});

test("Pulse malformed URL contract is public-safe before DB or queue work", () => {
  const normalized = normalizePulseUrl("::::");

  assert.equal(normalized.ok, false);
  assert.equal(normalized.message, "Enter a valid public URL or domain.");

  const body = buildPulseError({
    code: "invalid_url",
    message: normalized.message,
    url: "::::",
    detail: "standard",
    format: "json"
  });

  assert.equal(body.type, "certscore_pulse_error");
  assert.equal(body.request.url, "::::");
  assert.equal(body.request.detail, "standard");
  assert.equal(body.request.format, "json");
  assert.equal(body.error.code, "invalid_url");
  assert.equal(body.error.message, "Enter a valid public URL or domain.");
  assert.doesNotMatch(JSON.stringify(body), /Internal Error|stack|DATABASE_URL|token|secret/i);
});

test("Pulse status lookup for unknown job returns public-safe 404", { skip: !hasDatabaseEnv() }, async () => {
  const { GET } = await import("../../app/api/v1/pulse/status/[jobId]/route");
  const response = await GET(new Request("https://certscore.ai/api/v1/pulse/status/pulse_job_missing"), {
    params: Promise.resolve({ jobId: "pulse_job_missing" })
  });

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.type, "certscore_pulse_error");
  assert.equal(body.error.code, "not_found");
  assert.doesNotMatch(JSON.stringify(body), /stack|DATABASE_URL|token|secret/i);
});

test("Pulse feedback endpoint validates supported ratings before persistence", async () => {
  const response = await feedbackPOST(
    new Request("https://certscore.ai/api/v1/pulse/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pulseRequestId: "pulse_req_123",
        rating: "five_stars"
      })
    })
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.type, "certscore_pulse_error");
  assert.equal(body.feedback.email, "support@certscore.ai");
});
