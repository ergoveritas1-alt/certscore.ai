import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasDatabaseEnv } from "@website-signal-risk-scanner/db";
import { GET as aiDiscoveryGET } from "../../app/.well-known/certscore-ai.json/route";
import { GET as discoveryGET } from "../../app/.well-known/certscore-pulse/route";
import sitemap from "../../app/sitemap";
import { GET as chatGptOpenApiGET } from "../../app/api/v1/openapi.chatgpt.json/route";
import { GET as openApiGET } from "../../app/api/v1/openapi.json/route";
import { GET as pulseHealthGET } from "../../app/api/v1/pulse-health/route";
import { GET as pulseSelfTestGET } from "../../app/api/v1/pulse-self-test/route";
import { POST as feedbackPOST } from "../../app/api/v1/pulse/feedback/route";
import { buildPulseError } from "./error";
import { renderPulseMarkdown } from "./markdown";
import { normalizePulseUrl } from "./request";

test("OpenAPI route returns valid Pulse API JSON", async () => {
  const response = openApiGET(new Request("https://certscore.ai/api/v1/openapi.json"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("x-certscore-pulse"), "v1");
  assert.equal(response.headers.get("x-certscore-route"), "openapi");
  assert.match(response.headers.get("x-certscore-request-id") ?? "", /.+/);

  const body = await response.json();
  assert.equal(body.openapi, "3.1.0");
  assert.ok(body.paths["/api/v1/pulse"]);
  assert.ok(body.paths["/api/v1/pulse/status/{jobId}"]);
  assert.ok(body.paths["/api/v1/pulse/feedback"]);

  const pulseParameters = body.paths["/api/v1/pulse"].get.parameters.map((parameter: { name: string }) => parameter.name);
  assert.deepEqual(
    ["url", "scanId", "jobId", "format", "detail", "freshness", "scanFrom", "geo", "forceNewScan", "wait"].every((name) => pulseParameters.includes(name)),
    true
  );
  const scanFromParameter = body.paths["/api/v1/pulse"].get.parameters.find((parameter: { name: string }) => parameter.name === "scanFrom");
  const geoParameter = body.paths["/api/v1/pulse"].get.parameters.find((parameter: { name: string }) => parameter.name === "geo");
  assert.deepEqual(scanFromParameter.schema.enum, ["eu_ie", "california"]);
  assert.deepEqual(geoParameter.schema.enum, ["eu_ie", "california"]);
  assert.ok(body.paths["/api/v1/pulse"].get.responses["200"]);
  assert.ok(body.paths["/api/v1/pulse"].get.responses["202"]);
  assert.ok(body.paths["/api/v1/pulse"].get.responses["400"]);
  assert.ok(body.paths["/api/v1/pulse"].get.responses["429"]);
  assert.equal(body.paths["/api/v1/pulse"].get.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/PulseResponse");
  assert.equal(body.paths["/api/v1/pulse"].get.responses["202"].content["application/json"].schema.$ref, "#/components/schemas/PulseStatus");
  assert.equal(body.paths["/api/v1/pulse"].get.responses["400"].content["application/json"].schema.$ref, "#/components/schemas/PulseError");
  assert.ok(body.components.schemas.PulseResponse);
  assert.ok(body.components.schemas.PulseStatus);
  assert.ok(body.components.schemas.PulseError);
  assert.ok(body.components.schemas.PulseCapabilities);
  assert.ok(body.components.schemas.PulseAgentInterpretation);
  assert.equal(body.components.schemas.PulseCoverageInterruption.required[0], "label");
  assert.match(JSON.stringify(body.components.schemas.PulseResponse), /coverageNote|capabilities|agentInterpretation|interruptions/);
  assert.ok(body.paths["/api/v1/pulse-health"]);
  assert.ok(body.paths["/api/v1/pulse-self-test"]);
  assert.ok(body.paths["/api/v1/pulse"].get.responses["200"].headers["x-certscore-pulse"]);
  assert.ok(body.paths["/api/v1/pulse"].get.responses["202"].headers["Retry-After"]);
  assert.ok(body.paths["/api/v1/pulse"].get.responses["429"].headers["Retry-After"]);
  assert.doesNotMatch(JSON.stringify(body), /stack trace|internal-only|raw DOM/i);
});

test("ChatGPT Action OpenAPI route returns compact action-safe JSON", async () => {
  const response = chatGptOpenApiGET(new Request("https://certscore.ai/api/v1/openapi.chatgpt.json"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("x-certscore-pulse"), "v1");
  assert.equal(response.headers.get("x-certscore-route"), "openapi-chatgpt");
  assert.match(response.headers.get("x-certscore-request-id") ?? "", /.+/);

  const body = await response.json();
  assert.equal(body.openapi, "3.1.0");
  assert.equal(body.info.title, "CertScore Pulse GPT Action API beta");
  assert.equal(body.info.version, "0.5.1");
  assert.equal(body.paths["/api/v1/pulse/gpt"].get.operationId, "getPulseForUrl");
  assert.equal(body.paths["/api/v1/pulse/status/{jobId}"].get.operationId, "getPulseJobStatus");
  assert.equal(body.paths["/api/v1/pulse/gpt/scan/{scanId}"].get.operationId, "getPulseByScanId");
  assert.equal(body.paths["/api/v1/pulse-self-test"].get.operationId, "checkPulseConnectivity");
  assert.deepEqual(
    Object.keys(body.paths).sort(),
    ["/api/v1/pulse/gpt", "/api/v1/pulse/gpt/scan/{scanId}", "/api/v1/pulse/status/{jobId}", "/api/v1/pulse-self-test"].sort()
  );
  assert.equal(body.paths["/api/v1/pulse/gpt"].get.description.length < 300, true);
  assert.equal(body.paths["/api/v1/pulse/gpt/scan/{scanId}"].get.description.length < 300, true);
  assert.equal(body.paths["/api/v1/pulse/status/{jobId}"].get.description.length < 300, true);
  assert.equal(body.paths["/api/v1/pulse-self-test"].get.description.length < 300, true);
  assert.ok(body.paths["/api/v1/pulse/gpt"].get.parameters.some((parameter: { name: string; required?: boolean }) => parameter.name === "url" && parameter.required === true));
  assert.ok(body.paths["/api/v1/pulse/gpt"].get.parameters.some((parameter: { name: string; schema: { maximum?: number } }) => parameter.name === "wait" && parameter.schema.maximum === 35));
  assert.ok(body.paths["/api/v1/pulse/gpt"].get.parameters.some((parameter: { name: string; schema: { enum?: string[] } }) => parameter.name === "scanFrom" && parameter.schema.enum?.includes("eu_ie")));
  assert.ok(body.paths["/api/v1/pulse/gpt"].get.parameters.some((parameter: { name: string; schema: { enum?: string[] } }) => parameter.name === "geo" && parameter.schema.enum?.includes("california")));
  assert.ok(body.paths["/api/v1/pulse/gpt"].get.responses["200"].content["text/markdown"]);
  assert.ok(body.paths["/api/v1/pulse/gpt"].get.responses["500"].content["application/json"]);
  assert.equal(body.paths["/api/v1/pulse/status/{jobId}"].get.responses["429"].content["application/json"].schema.$ref, "#/components/schemas/PulseError");
  assert.ok(body.components.schemas.PulseCapabilities);
  assert.ok(body.components.schemas.PulseAgentInterpretation);
  assert.ok(body.components.schemas.PulseCoverageInterruption);
  assert.ok(body.components.schemas.PulseSelfTest);
  assert.ok(body.paths["/api/v1/pulse/gpt"].get.responses["200"].headers["x-certscore-request-id"]);
  assert.ok(body.paths["/api/v1/pulse/gpt"].get.responses["202"].headers["Retry-After"]);
  assert.equal(body.paths["/api/v1/pulse-self-test"].get.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/PulseSelfTest");
  assert.match(JSON.stringify(body), /checkPulseConnectivity|transient client\/action transport error/);
  assert.match(JSON.stringify(body), /format=markdown|getPulseForUrl|automated public-web observations for review|automated_runtime_analysis/);
  assert.doesNotMatch(JSON.stringify(body.paths["/api/v1/pulse/gpt"].get.parameters), /refresh|full/);
  assert.doesNotMatch(JSON.stringify(body.paths), /pulse-health/);
  assert.doesNotMatch(JSON.stringify(body), /pre_consent_tracking_detected|raw DOM|DATABASE_URL|AUTH_SECRET/i);
});

test("GPT Pulse route source preserves public-mode gates", () => {
  const source = readFileSync("apps/web/app/api/v1/pulse/route.ts", "utf8");
  const gptRoute = readFileSync("apps/web/app/api/v1/pulse/gpt/route.ts", "utf8");

  assert.match(source, /gptAction && detail === "full"/);
  assert.match(source, /Full evidence detail is not available through the public GPT Action/);
  assert.match(source, /gptAction && requestedFreshness === "refresh"/);
  assert.match(source, /public GPT Action uses latest available Pulse results only/);
  assert.match(source, /GPT_ACTION_HOURLY_LIMIT = 5/);
  assert.match(source, /GPT_ACTION_DAILY_LIMIT = 20/);
  assert.match(gptRoute, /channel", "gpt_action"/);
});

test("Pulse and full-scan routes preserve 24-hour reuse and forceNewScan bypass", () => {
  const pulseRoute = readFileSync("apps/web/app/api/v1/pulse/route.ts", "utf8");
  const fullScanRoute = readFileSync("apps/web/app/api/full-scan/route.ts", "utf8");
  const anonymousScanSource = readFileSync("apps/web/server/scans/create-anonymous-full-scan.ts", "utf8");
  const authenticatedScanSource = readFileSync("apps/web/server/scans/create-full-scan.ts", "utf8");
  const domainSource = readFileSync("apps/web/server/domains/create-domain.ts", "utf8");
  const reuseSource = readFileSync("apps/web/server/scans/recent-scan-reuse.ts", "utf8");

  assert.match(reuseSource, /RECENT_SCAN_REUSE_WINDOW_HOURS = 24/);
  assert.match(reuseSource, /getTime\(\)/);
  assert.match(pulseRoute, /forceNewScan = gptAction \? false/);
  assert.match(pulseRoute, /maxAgeHours: RECENT_SCAN_REUSE_WINDOW_HOURS/);
  assert.match(pulseRoute, /resolutionMode: "reused_existing_scan"/);
  assert.match(fullScanRoute, /parseForceNewScan/);
  assert.match(pulseRoute, /url\.searchParams\.get\("scanFrom"\) \?\? url\.searchParams\.get\("geo"\)/);
  assert.match(fullScanRoute, /payload\?\.scanFrom \?\? payload\?\.geo/);
  assert.match(fullScanRoute, /bypassRecentScanReuse: forceNewScan/);
  assert.match(anonymousScanSource, /findRecentCompletedScanForDomain/);
  assert.match(authenticatedScanSource, /findRecentCompletedScanForDomain/);
  assert.match(domainSource, /reusedExistingScan: queueResult\.reusedExistingScan/);
});

test("Pulse OpenAPI smoke: /api/v1/openapi.json is JSON OpenAPI 3.1, not an app error page", async () => {
  const response = openApiGET(new Request("https://certscore.ai/api/v1/openapi.json"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/);

  const rawBody = await response.text();
  assert.doesNotMatch(rawBody, /<!doctype html|<html|__NEXT_DATA__|sign in|login/i);
  assert.doesNotMatch(rawBody, /Internal Error|internal error|stack trace|DATABASE_URL|AUTH_SECRET|PRIVATE_KEY/);

  const body = JSON.parse(rawBody);
  assert.equal(body.openapi, "3.1.0");
  assert.equal(body.info.title, "CertScore Pulse API beta");
  assert.equal(body.info.version, "0.5.1");
  assert.ok(body.paths["/api/v1/pulse"]);
  assert.match(rawBody, /forceNewScan/);
  assert.equal(body.paths["/api/v1/pulse/status/{jobId}"].get.responses["429"].content["application/json"].schema.$ref, "#/components/schemas/PulseError");
  assert.match(rawBody, /automated runtime analysis of public websites/);
});

test("Pulse discovery route returns compact machine-readable metadata", async () => {
  const response = discoveryGET(new Request("https://certscore.ai/.well-known/certscore-pulse"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("x-certscore-pulse"), "v1");
  assert.equal(response.headers.get("x-certscore-route"), "discovery");
  assert.match(response.headers.get("x-certscore-request-id") ?? "", /.+/);

  const body = await response.json();
  assert.equal(body.name, "CertScore Pulse beta");
  assert.equal(body.version, "0.5.1");
  assert.equal(body.api, "https://certscore.ai/api/v1/pulse");
  assert.equal(body.openapi, "https://certscore.ai/api/v1/openapi.json");
  assert.equal(body.chatgptOpenapi, "https://certscore.ai/api/v1/openapi.chatgpt.json");
  assert.equal(body.docs, "https://certscore.ai/api-pulse");
  assert.equal(body.selfTest, "https://certscore.ai/api/v1/pulse-self-test");
  assert.equal(body.health, "https://certscore.ai/api/v1/pulse-health");
  assert.deepEqual(body.formats, ["json", "markdown"]);
  assert.ok(body.detailLevels.includes("tiny"));
  assert.ok(body.detailLevels.includes("standard"));
  assert.ok(body.detailLevels.includes("full"));
  assert.deepEqual(body.detailLevels, ["tiny", "standard", "full"]);
  assert.deepEqual(body.detailAliases, { quick: "tiny" });
  assert.equal(body.feedbackEmail, "support@certscore.ai");
  assert.equal(body.capabilities.method, "automated_runtime_analysis");
  assert.ok(body.capabilities.observes.includes("pre_consent_tracking"));
  assert.match(body.agentFetchLimitations, /pulse-self-test/);
  assert.equal(body.recommendedCalls.connectivityCheck, "GET /api/v1/pulse-self-test");
  assert.match(body.freshness, /24-hour reuse window/);
  assert.match(body.freshness, /forceNewScan=true/);
  assert.equal(body.disclaimer, "Automated public-web observations for review. Not legal advice, certification, or a compliance determination.");
});

test("Pulse health canary route is dependency-free JSON", async () => {
  const response = pulseHealthGET(new Request("https://certscore.ai/api/v1/pulse-health"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/);
  assert.equal(response.headers.get("x-certscore-pulse"), "v1");
  assert.equal(response.headers.get("x-certscore-route"), "pulse-health");
  assert.match(response.headers.get("x-certscore-request-id") ?? "", /.+/);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "certscore-pulse");
  assert.equal(body.version, "v1");
  assert.equal(body.betaVersion, "0.5.1");
  assert.match(body.generatedAt, /^\d{4}-\d{2}-\d{2}T/);

  const source = readFileSync("apps/web/app/api/v1/pulse-health/route.ts", "utf8");
  assert.doesNotMatch(source, /^import\s/m);
  assert.doesNotMatch(source, /from\s+["'][^"']*(db|server|auth|queue|redis|pulse\/repository|internal)["']/i);
  assert.doesNotMatch(source, /fetch\(/i);
});

test("Pulse self-test route is dependency-free JSON with capabilities", async () => {
  const response = pulseSelfTestGET(new Request("https://certscore.ai/api/v1/pulse-self-test"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/);
  assert.equal(response.headers.get("x-certscore-pulse"), "v1");
  assert.equal(response.headers.get("x-certscore-route"), "pulse-self-test");
  assert.match(response.headers.get("x-certscore-request-id") ?? "", /.+/);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.type, "certscore_pulse_self_test");
  assert.equal(body.service, "certscore_pulse");
  assert.equal(body.version, "v1");
  assert.equal(body.betaVersion, "0.5.1");
  assert.equal(body.routes.health, "/api/v1/pulse-health");
  assert.equal(body.routes.openapi, "/api/v1/openapi.json");
  assert.equal(body.routes.chatgptOpenapi, "/api/v1/openapi.chatgpt.json");
  assert.equal(body.capabilities.method, "automated_runtime_analysis");
  assert.ok(body.capabilities.observes.includes("pre_consent_tracking"));
  assert.match(body.disclaimer, /automated public-web observations for review/i);

  const source = readFileSync("apps/web/app/api/v1/pulse-self-test/route.ts", "utf8");
  assert.doesNotMatch(source, /^import\s/m);
  assert.doesNotMatch(source, /from\s+["'][^"']*(db|server|auth|queue|redis|pulse\/repository|internal)["']/i);
  assert.doesNotMatch(source, /fetch\(/i);
});

test("Pulse docs page source includes integration-critical guidance", () => {
  const source = readFileSync("apps/web/app/api-pulse/page.tsx", "utf8");

  assert.match(source, /CertScore Pulse API beta/);
  assert.match(source, /0\.5\.1/);
  assert.match(source, /forceNewScan/);
  assert.match(source, /24-hour reuse/);
  assert.match(source, /scanFrom/);
  assert.match(source, /geo/);
  assert.match(source, /`eu_ie` or `california`/);
  assert.match(source, /1-minute normalized-domain/);
  assert.match(source, /OpenAPI JSON/);
  assert.match(source, /PULSE_FEEDBACK_EMAIL/);
  assert.match(source, /PULSE_STANDARD_DISCLAIMER/);
  assert.match(source, /PULSE_PURPOSE_STATEMENT/);
  assert.match(source, /Copy\/paste examples/);
  assert.match(source, /For AI agents/);
  assert.match(source, /Basic HTTP agent quick start/);
  assert.match(source, /OpenAPI \/ GPT Action beta quick start/);
  assert.match(source, /Call getPulseForUrl with/);
  assert.match(source, /format: markdown/);
  assert.match(source, /GET https:\/\/certscore\.ai\/api\/v1\/pulse\?url=<public URL>&format=markdown&detail=standard/);
  assert.match(source, /Agent fallback page/);
  assert.match(source, /Agent text guide/);
  assert.match(source, /ChatGPT Action beta schema/);
  assert.match(source, /Open quick-start endpoint/);
  assert.match(source, /Open test URL/);
  assert.match(source, /MCP preview/);
  assert.match(source, /Developer hub/);
  assert.match(source, /href="\/developers"/);
  assert.match(source, /href="\/developers\/reference"/);
  assert.match(source, /href="\/developers\/mcp"/);
  assert.match(source, /developer-preview stdio server/);
  assert.match(source, /pnpm mcp:certscore/);
  assert.match(source, /pnpm mcp:certscore:smoke/);
  assert.match(source, /pnpm mcp:certscore:generate-key/);
  assert.match(source, /Example MCP client config/);
  assert.match(source, /Recommended workflow/);
  assert.match(source, /without changing evidence, concern, finding, or projection logic/);
  assert.match(source, /authenticated MCP smoke/);
  assert.match(source, /create_scan/);
  assert.match(source, /get_scan_status/);
  assert.match(source, /get_report/);
  assert.match(source, /export_findings/);
  assert.match(source, /explain_finding/);
  assert.match(source, /Account browsing and drift comparison tools are not part of the initial MCP scope/);
  assert.match(source, /href: "https:\/\/certscore\.ai\/api\/v1\/pulse\?url=https:\/\/kbdlab\.io&detail=tiny"/);
  assert.match(source, /href: "https:\/\/certscore\.ai\/api\/v1\/pulse\?url=https:\/\/kbdlab\.io&format=markdown"/);
  assert.match(source, /detail=quick/);
  assert.match(source, /Status lifecycle|queued to running to finalizing to completed/);
  assert.match(source, /`scanId` is the canonical field name/);
  assert.match(source, /200 completed tiny JSON/);
  assert.match(source, /200 completed full JSON/);
  assert.match(source, /202 pending\/running response/);
  assert.match(source, /429 rate-limit response/);
});

test("Pulse agent fallback page documents the fetch failure diagnostic contract", () => {
  const source = readFileSync("apps/web/app/api-pulse/agent/page.tsx", "utf8");

  assert.match(source, /Agent-readable beta fallback/);
  assert.match(source, /0\.5\.1/);
  assert.match(source, /forceNewScan=true/);
  assert.match(source, /24 hours/);
  assert.match(source, /scanFrom/);
  assert.match(source, /geo/);
  assert.match(source, /eu_ie<\/code>.*california<\/code>/s);
  assert.match(source, /Agent quick start/);
  assert.match(source, /Basic HTTP agents/);
  assert.match(source, /getPulseForUrl/);
  assert.match(source, /detail=standard/);
  assert.match(source, /format=markdown/);
  assert.match(source, /x-certscore-pulse: v1/);
  assert.match(source, /x-certscore-route: pulse-self-test \| pulse-health \| openapi \| openapi-chatgpt \| discovery \| pulse \| pulse-status/);
  assert.match(source, /Agent fetch limitations/);
  assert.match(source, /client\/network fetch limitation/);
  assert.match(source, /GET \/api\/v1\/pulse-self-test/);
  assert.match(source, /Markdown is best for conversational summaries/);
  assert.match(source, /https:\/\/certscore\.ai\/api-pulse-agent-guide\.txt/);
  assert.match(source, /https:\/\/certscore\.ai\/api\/v1\/openapi\.chatgpt\.json/);
  assert.match(source, /https:\/\/certscore\.ai\/api\/v1\/pulse-health/);
  assert.match(source, /https:\/\/certscore\.ai\/api\/v1\/pulse-self-test/);
  assert.match(source, /https:\/\/certscore\.ai\/api\/v1\/pulse\?url=https:\/\/kbdlab\.io&format=markdown/);
  assert.match(source, /PULSE_STANDARD_DISCLAIMER/);
  assert.match(source, /PULSE_PURPOSE_STATEMENT/);
});

test("Pulse plain text agent guide is retrievable and covers fetch failures", () => {
  const source = readFileSync("apps/web/public/api-pulse-agent-guide.txt", "utf8");

  assert.match(source, /CertScore Pulse beta agent guide/);
  assert.match(source, /0\.5\.1/);
  assert.match(source, /forceNewScan=true/);
  assert.match(source, /24-hour reuse/);
  assert.match(source, /scanFrom or geo/);
  assert.match(source, /eu_ie and california/);
  assert.match(source, /1-minute normalized-domain/);
  assert.match(source, /Basic HTTP agent quick start/);
  assert.match(source, /OpenAPI \/ GPT Action beta quick start/);
  assert.match(source, /format: markdown/);
  assert.match(source, /detail: standard/);
  assert.match(source, /GET https:\/\/certscore\.ai\/api\/v1\/pulse\?url=<public URL>&format=markdown&detail=standard/);
  assert.match(source, /https:\/\/certscore\.ai\/api-pulse/);
  assert.match(source, /https:\/\/certscore\.ai\/api-pulse#mcp/);
  assert.match(source, /CERTSCORE_API_KEY=<token> pnpm mcp:certscore/);
  assert.match(source, /CERTSCORE_API_KEY=<token> pnpm mcp:certscore:smoke/);
  assert.match(source, /pnpm mcp:certscore:generate-key -- --name "CertScore MCP preview"/);
  assert.match(source, /explain_finding for evidence summaries, caveats, and next steps/);
  assert.match(source, /https:\/\/certscore\.ai\/api-pulse\/agent/);
  assert.match(source, /https:\/\/certscore\.ai\/api\/v1\/openapi\.chatgpt\.json/);
  assert.match(source, /https:\/\/certscore\.ai\/api\/v1\/pulse-health/);
  assert.match(source, /https:\/\/certscore\.ai\/api\/v1\/pulse-self-test/);
  assert.match(source, /x-certscore-pulse: v1/);
  assert.match(source, /x-certscore-route: pulse-self-test \| pulse-health/);
  assert.match(source, /getPulseForUrl/);
  assert.match(source, /Agent fetch limitations/);
  assert.match(source, /client\/network fetch limitation/);
  assert.match(source, /Recommended calls/);
  assert.match(source, /Markdown is best for conversational summaries/);
  assert.match(source, /automated public-web observations for review/);
  assert.match(source, /automated runtime analysis of public websites/);
});

test("Pulse route validates supplied integration bearer tokens outside the finding pipeline", () => {
  const source = readFileSync("apps/web/app/api/v1/pulse/route.ts", "utf8");

  assert.match(source, /parseBearerToken/);
  assert.match(source, /validateIntegrationApiKey/);
  assert.match(source, /requiredScopesForPulseRequest/);
  assert.match(source, /channel: "mcp"/);
  assert.match(source, /source: "mcp"/);
  assert.doesNotMatch(source, /normalized-concerns|concern-policy|unified-findings|executive-findings-projection/);
});

test("Pulse public text surfaces keep cautious language outside explicit avoid guidance", async () => {
  const markdown = renderPulseMarkdown({
    type: "certscore_pulse",
    meta: { generatedAt: "2026-05-19T00:00:00.000Z", detail: "standard" },
    domain: "kbdlab.io",
    scanId: "scan_test",
    scanStatus: "completed",
    summary: {
      score: 82,
      riskLevel: "monitor",
      headline: "No top automated findings were surfaced in this scan."
    },
    topFindings: [],
    coverage: {
      summary: "Automated public-web scan completed for the observed public surfaces.",
      limitations: ["Automated public-web scan only."]
    },
    links: {
      fullReportUrl: "https://certscore.ai/scan/scan_test",
      docsUrl: "https://certscore.ai/api-pulse",
      findingsReferenceUrl: "https://certscore.ai/findings"
    },
    feedback: { feedbackUrl: "https://certscore.ai/pulse/feedback?pulseRequestId=pulse_req_test" }
  });
  const guide = readFileSync("apps/web/public/api-pulse-agent-guide.txt", "utf8");
  const llms = readFileSync("apps/web/public/llms.txt", "utf8");
  const discovery = await (discoveryGET(new Request("https://certscore.ai/.well-known/certscore-pulse"))).text();
  const openApi = await (openApiGET(new Request("https://certscore.ai/api/v1/openapi.json"))).text();

  const text = [markdown, guide, llms, discovery, openApi]
    .join("\n")
    .split("\n")
    .filter((line) => !/Do not say|Avoid claims|avoidClaims/i.test(line))
    .join("\n");

  assert.doesNotMatch(text, /\billegal\b/i);
  assert.doesNotMatch(text, /\bviolation\b/i);
  assert.doesNotMatch(text, /\bnon-compliant\b/i);
  assert.doesNotMatch(text, /\bunlawful\b/i);
  assert.doesNotMatch(text, /\bbreach of law\b/i);
  assert.doesNotMatch(text, /\bcertifies compliance\b/i);
  assert.doesNotMatch(text, /\bdetermines compliance\b/i);
  assert.match(text, /automated public-web observations for review|automated runtime analysis/i);
  assert.match(text, /review signals?|evidence for review|coverage limitation/i);
  assert.match(text, /not legal advice/i);
});

test("Robots allows public developer docs and API v2 discovery while keeping generic API private", async () => {
  const { default: robots } = await import("../../app/robots");
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

  for (const rule of rules) {
    const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow].filter(Boolean);
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow].filter(Boolean);

    assert.ok(allow.includes("/developers"));
    assert.ok(allow.includes("/developers/"));
    assert.ok(allow.includes("/llms.txt"));
    assert.ok(allow.includes("/llms-full.txt"));
    assert.ok(allow.includes("/.well-known/certscore-ai.json"));
    assert.ok(allow.includes("/api/v2/health"));
    assert.ok(allow.includes("/api/v2/openapi.json"));
    assert.ok(!allow.includes("/api-pulse"));
    assert.ok(!allow.includes("/api/v1/openapi.json"));
    assert.ok(!allow.includes("/api/v1/pulse"));
    assert.ok(!allow.includes("/.well-known/certscore-pulse"));
    assert.ok(disallow.includes("/api/"));
    assert.ok(disallow.includes("/app/"));
    assert.ok(disallow.includes("/admin/"));
    assert.ok(disallow.includes("/account/"));
    assert.ok(disallow.includes("/dashboard/"));
    assert.ok(disallow.includes("/private/"));
    assert.ok(disallow.includes("/cdn-cgi/"));
  }
});

test("Developer API docs are discoverable by crawlers and agent manifests", async () => {
  const developerPaths = [
    "/developers",
    "/developers/quickstart",
    "/developers/reference",
    "/developers/sdk",
    "/developers/mcp",
    "/developers/examples"
  ];
  const sitemapUrls = sitemap().map((entry) => entry.url);
  const llms = readFileSync("apps/web/public/llms.txt", "utf8");
  const llmsFull = readFileSync("apps/web/public/llms-full.txt", "utf8");
  const header = readFileSync("apps/web/components/layout/site-header.tsx", "utf8");
  const footer = readFileSync("apps/web/components/layout/site-footer.tsx", "utf8");
  const pageSources = [
    "apps/web/app/developers/page.tsx",
    "apps/web/app/developers/quickstart/page.tsx",
    "apps/web/app/developers/reference/page.tsx",
    "apps/web/app/developers/sdk/page.tsx",
    "apps/web/app/developers/mcp/page.tsx",
    "apps/web/app/developers/examples/page.tsx",
    "apps/web/app/developers/developer-pages.tsx"
  ].map((path) => readFileSync(path, "utf8"));
  const aiDiscovery = await (aiDiscoveryGET(new Request("https://certscore.ai/.well-known/certscore-ai.json"))).json();
  const pulseDiscovery = await (discoveryGET(new Request("https://certscore.ai/.well-known/certscore-pulse"))).json();

  for (const path of developerPaths) {
    assert.ok(sitemapUrls.includes(`https://certscore.ai${path}`), `${path} should be in sitemap`);
    assert.match(llms, new RegExp(`https://certscore\\.ai${path.replaceAll("/", "\\/")}`));
    assert.match(llmsFull, new RegExp(`https://certscore\\.ai${path.replaceAll("/", "\\/")}`));
  }

  assert.equal(aiDiscovery.aiDiscovery.developerHub, "https://certscore.ai/developers");
  assert.equal(aiDiscovery.organization.supportUrl, "https://certscore.ai/contact");
  assert.equal(aiDiscovery.organization.termsUrl, "https://certscore.ai/terms");
  assert.equal(aiDiscovery.organization.privacyUrl, "https://certscore.ai/privacy");
  assert.equal(aiDiscovery.developerDocs.quickstart, "https://certscore.ai/developers/quickstart");
  assert.equal(aiDiscovery.developerDocs.reference, "https://certscore.ai/developers/reference");
  assert.equal(aiDiscovery.developerDocs.sdk, "https://certscore.ai/developers/sdk");
  assert.equal(aiDiscovery.developerDocs.mcp, "https://certscore.ai/developers/mcp");
  assert.equal(aiDiscovery.developerDocs.examples, "https://certscore.ai/developers/examples");
  assert.equal(aiDiscovery.api.docs, "https://certscore.ai/developers/reference");
  assert.equal(aiDiscovery.sdk.docs, "https://certscore.ai/developers/sdk");
  assert.equal(aiDiscovery.mcp.docs, "https://certscore.ai/developers/mcp");
  assert.equal(aiDiscovery.authentication.docs, "https://certscore.ai/developers/quickstart");
  assert.deepEqual(aiDiscovery.authentication.currentScopes, ["scan:read", "scan:create", "mcp"]);
  assert.equal(aiDiscovery.rateLimits.docs, "https://certscore.ai/developers/reference");
  assert.equal(aiDiscovery.support.terms, "https://certscore.ai/terms");
  assert.equal(pulseDiscovery.developerHub, "https://certscore.ai/developers");
  assert.equal(pulseDiscovery.developerReference, "https://certscore.ai/developers/reference");
  assert.equal(pulseDiscovery.developerMcpDocs, "https://certscore.ai/developers/mcp");
  assert.equal(pulseDiscovery.terms, "https://certscore.ai/terms");

  assert.match(header, /href: "\/developers", label: "Developers"/);
  assert.match(footer, /href: "\/developers", label: "Developers"/);
  assert.match(footer, /href: "\/developers\/reference", label: "API reference"/);
  assert.match(footer, /href: "\/developers\/sdk", label: "SDK docs"/);
  assert.match(footer, /href: "\/developers\/mcp", label: "MCP docs"/);
  assert.match(llms, /Authorization: Bearer <token>/);
  assert.match(llms, /scan:read.*scan:create.*mcp/s);
  assert.match(llms, /https:\/\/certscore\.ai\/terms/);
  assert.match(llmsFull, /Authentication, scopes, and rate limits/);
  assert.match(llmsFull, /https:\/\/certscore\.ai\/terms/);

  const combinedSources = [...pageSources, header, footer, llms, llmsFull].join("\n");
  assert.match(combinedSources, /CertScore API/);
  assert.match(combinedSources, /website risk API/);
  assert.match(combinedSources, /privacy scan API/);
  assert.match(combinedSources, /cookie compliance scan API/);
  assert.match(combinedSources, /MCP server for website compliance review/);
  assert.match(combinedSources, /automated public-web risk signals/);
  assert.match(combinedSources, /evidence-backed website scan API/);
  assert.match(combinedSources, /already-projected public-safe artifacts/);
  assert.match(combinedSources, /not legal advice, certification, or a\s+compliance determination/);
  assert.doesNotMatch(combinedSources, /legal violation|non-compliant/i);
});

test("API v2 routes stay beside the public projection layer", () => {
  const routePaths = [
    "apps/web/app/api/v2/domains/[domain]/latest/route.ts",
    "apps/web/app/api/v2/health/route.ts",
    "apps/web/app/api/v2/openapi.json/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/findings/[findingId]/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/findings/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/pulse/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/route.ts",
    "apps/web/app/api/v2/scans/[scanId]/status/route.ts",
    "apps/web/app/api/v2/scans/route.ts"
  ];

  for (const routePath of routePaths) {
    const source = readFileSync(routePath, "utf8");
    assert.doesNotMatch(source, /normalized-concerns|concern-policy|unified-findings|finding-evidence-gates/i);
    assert.doesNotMatch(source, /certscore-scan-core|scan-core|scanner-runtime|raw-artifact|repair|backfill/i);
    assert.doesNotMatch(source, /rawRequestBody|rawResponseBody|rawDom|raw DOM/i);
  }
});

test("Pulse OpenAPI documents the public status contracts without runtime examples", async () => {
  const response = openApiGET(new Request("https://certscore.ai/api/v1/openapi.json"));
  const body = await response.json();
  const responses = body.paths["/api/v1/pulse"].get.responses;

  assert.equal(responses["200"].description, "Completed Pulse response");
  assert.equal(responses["202"].description, "Pulse job queued or running");
  assert.equal(responses["400"].description, "Invalid input");
  assert.equal(responses["429"].description, "Throttled");
  assert.equal(body.paths["/api/v1/pulse/status/{jobId}"].get.responses["404"].description, "Pulse job not found");
  assert.doesNotMatch(JSON.stringify(body), /scan_abc123|pre_consent_tracking_detected|raw DOM/i);
});

test("Pulse OpenAPI and discovery routes stay static and dependency-light", () => {
  const supportRoutes = [
    "apps/web/app/api/v1/openapi.json/route.ts",
    "apps/web/app/api/v1/openapi.chatgpt.json/route.ts",
    "apps/web/app/.well-known/certscore-pulse/route.ts",
    "apps/web/app/api/v1/pulse-health/route.ts",
    "apps/web/app/api/v1/pulse-self-test/route.ts"
  ];

  for (const routePath of supportRoutes) {
    const source = readFileSync(routePath, "utf8");
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
  assert.equal(body.agentInterpretation.responseClass, "api_error");
  assert.equal(body.agentInterpretation.requiresHumanReview, true);
  assert.match(body.disclaimer, /automated public-web observations for review/i);
  assert.doesNotMatch(JSON.stringify(body), /stack|DATABASE_URL|token|secret/i);
});

test("Pulse rate-limit errors can include a public plan-management resolution", () => {
  const body = buildPulseError({
    code: "rate_limited",
    message: "This CertScore API key has reached its Pulse request limit. Try again after the retry window or manage your plan.",
    retryAfterSeconds: 3600,
    resolution: {
      label: "Manage plan",
      url: "https://certscore.ai/app/modify-plan"
    },
    detail: "tiny",
    format: "json"
  });

  assert.equal(body.type, "certscore_pulse_error");
  assert.equal(body.error.code, "rate_limited");
  assert.match(body.error.message, /request limit/i);
  assert.equal(body.error.retryAfterSeconds, 3600);
  assert.deepEqual(body.resolution, {
    label: "Manage plan",
    url: "https://certscore.ai/app/modify-plan"
  });
  assert.equal(body.agentInterpretation.responseClass, "rate_limited");
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
  assert.equal(body.agentInterpretation.responseClass, "api_error");
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
