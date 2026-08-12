import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  API_READ_RATE_POLICY,
  API_READ_RATE_POLICY_OPENAPI_EXTENSION,
  apiReadRateWindow
} from "@website-signal-risk-scanner/shared";
import { GET as getAiDiscovery } from "../../app/.well-known/certscore-ai.json/route";
import { GET as getPulseDiscovery } from "../../app/.well-known/certscore-pulse/route";
import { GET as getPulseOpenApi } from "../../app/api/v1/openapi.json/route";
import { GET as getPulseChatGptOpenApi } from "../../app/api/v1/openapi.chatgpt.json/route";
import { GET as getApiV2OpenApi } from "../../app/api/v2/openapi.json/route";
import { ApiReadRatePolicyDetails } from "../../app/developers/developer-pages";
import { ApiReadRatePolicyNotice } from "../../components/api-read-rate-policy-notice";

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

async function pageFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.isFile() && entry.name === "page.tsx" ? [path] : [];
  }));
  return nested.flat();
}

test("public OpenAPI documents expose the canonical read-rate policy", async () => {
  const request = new Request("https://certscore.ai/openapi.json");
  for (const document of await Promise.all([
    json(getPulseOpenApi(request)),
    json(getPulseChatGptOpenApi(request)),
    json(getApiV2OpenApi(request))
  ])) {
    assert.deepEqual(document["x-certscore-read-rate-policy"], API_READ_RATE_POLICY_OPENAPI_EXTENSION);
  }
});

test("protected OpenAPI operations document 429 and Retry-After", async () => {
  const request = new Request("https://certscore.ai/openapi.json");
  const v2 = await json(getApiV2OpenApi(request)) as any;
  const protectedPaths = [
    "/api/v2/scans/{scanId}",
    "/api/v2/scans/{scanId}/status",
    "/api/v2/scans/{scanId}/diagnostics",
    "/api/v2/scans/{scanId}/findings",
    "/api/v2/scans/{scanId}/findings/{findingId}",
    "/api/v2/scans/{scanId}/pulse",
    "/api/v2/scans/{scanId}/pre-consent-cookies-trackers",
    "/api/v2/domains/{domain}/latest",
    "/api/v2/domains/{domain}/latest/pre-consent-cookies-trackers"
  ];
  for (const path of protectedPaths) {
    const throttled = v2.paths[path].get.responses["429"];
    assert.match(throttled.description, /weighted scan-resource read limit/i, path);
    assert.ok(throttled.headers["Retry-After"], path);
  }
  const v2RateLimit = v2.components.schemas.ApiError.properties.error.properties.rateLimit;
  assert.match(v2RateLimit.description, /exact canonical policy decision/i);
  for (const field of ["policyVersion", "profile", "scope", "windowId", "windowSeconds", "limitUnits", "usedUnits", "requestedUnits"]) {
    assert.ok(v2RateLimit.properties[field], field);
  }

  const chatGpt = await json(getPulseChatGptOpenApi(request)) as any;
  assert.ok(chatGpt.paths["/api/v1/pulse/gpt/scan/{scanId}"].get.responses["429"].headers["Retry-After"]);
  assert.match(chatGpt.components.schemas.PulseError.properties.error.properties.rateLimit.description, /canonical policy version/i);

  const pulse = await json(getPulseOpenApi(request)) as any;
  assert.match(pulse.components.schemas.PulseError.properties.error.properties.rateLimit.description, /canonical policy version/i);
});

test("agent discovery documents expose the canonical read-rate policy", async () => {
  const request = new Request("https://certscore.ai/.well-known/discovery");
  const ai = await json(getAiDiscovery(request));
  const pulse = await json(getPulseDiscovery(request));
  assert.deepEqual((ai.rateLimits as Record<string, unknown>).readPolicy, API_READ_RATE_POLICY_OPENAPI_EXTENSION);
  assert.deepEqual(pulse.readRatePolicy, API_READ_RATE_POLICY_OPENAPI_EXTENSION);
});

test("the rendered developer policy remains derived from the canonical policy", () => {
  const terminalBurst = apiReadRateWindow("terminal", "burst");
  const terminalDaily = apiReadRateWindow("terminal", "daily");
  const statusBurst = apiReadRateWindow("status", "burst");
  const markup = renderToStaticMarkup(ApiReadRatePolicyDetails());

  assert.match(markup, new RegExp(`data-api-read-rate-policy-version="${API_READ_RATE_POLICY.version}"`));
  assert.match(markup, new RegExp(`data-terminal-burst-window-seconds="${terminalBurst.windowSeconds}"`));
  assert.match(markup, new RegExp(`data-terminal-daily-window-seconds="${terminalDaily.windowSeconds}"`));
  for (const limit of [
    terminalBurst.limits.callerTarget,
    terminalBurst.limits.target,
    terminalBurst.limits.caller,
    terminalDaily.limits.callerTarget,
    statusBurst.limits.callerTarget,
    statusBurst.limits.target,
    statusBurst.limits.caller
  ]) {
    assert.match(markup, new RegExp(`\\b${limit} units\\b`));
  }
  const heavyWeight = API_READ_RATE_POLICY.weights.bundle;
  assert.match(markup, new RegExp(
    `permits ${Math.floor(terminalBurst.limits.callerTarget / heavyWeight)} direct heavy reads.*${Math.floor(terminalDaily.limits.callerTarget / heavyWeight)} in a rolling 24 hours`
  ));
});

test("the compact public notice remains derived from the canonical policy", () => {
  const terminalBurst = apiReadRateWindow("terminal", "burst");
  const terminalDaily = apiReadRateWindow("terminal", "daily");
  const markup = renderToStaticMarkup(ApiReadRatePolicyNotice({}));
  assert.match(markup, new RegExp(`data-api-read-rate-policy-version="${API_READ_RATE_POLICY.version}"`));
  assert.match(markup, new RegExp(`${terminalBurst.limits.callerTarget} units per rolling 10 minutes`));
  assert.match(markup, new RegExp(`${terminalDaily.limits.callerTarget} units per rolling 24 hours`));
  assert.match(markup, /429 means retrieval was throttled/);
  assert.match(markup, /Retry-After/);
});

test("only approved pages render the full policy or compact notice", async () => {
  const approvedFullPolicyPages = [
    "apps/web/app/api-pulse/page.tsx",
    "apps/web/app/developers/mcp/page.tsx",
    "apps/web/app/developers/reference/page.tsx"
  ];
  const approvedNoticePages = [
    "apps/web/app/(marketing)/page.tsx",
    "apps/web/app/(marketing)/scan/[scanId]/page.tsx",
    "apps/web/app/app/scans/[scanId]/page.tsx",
    "apps/web/app/sample-report/page.tsx"
  ];
  const fullPolicyReferences: string[] = [];
  const noticeReferences: string[] = [];
  for (const path of await pageFiles("apps/web/app")) {
    const source = await readFile(path, "utf8");
    if (/ApiReadRatePolicyDetails|API_READ_RATE_POLICY|apiReadRateWindow/.test(source)) fullPolicyReferences.push(path);
    if (/ApiReadRatePolicyNotice/.test(source)) noticeReferences.push(path);
  }
  assert.deepEqual(fullPolicyReferences.sort(), approvedFullPolicyPages);
  assert.deepEqual(noticeReferences.sort(), approvedNoticePages);
});

test("developer pages reuse the shared policy component and static guidance links instead of copying limits", async () => {
  const [reference, mcp, pulse, llms, llmsFull, agentGuide, mcpReadme, agentInstructions] = await Promise.all([
    readFile("apps/web/app/developers/reference/page.tsx", "utf8"),
    readFile("apps/web/app/developers/mcp/page.tsx", "utf8"),
    readFile("apps/web/app/api-pulse/page.tsx", "utf8"),
    readFile("apps/web/public/llms.txt", "utf8"),
    readFile("apps/web/public/llms-full.txt", "utf8"),
    readFile("apps/web/public/api-pulse-agent-guide.txt", "utf8"),
    readFile("packages/certscore-mcp/README.md", "utf8"),
    readFile("AGENTS.md", "utf8")
  ]);
  for (const page of [reference, mcp, pulse]) {
    assert.match(page, /ApiReadRatePolicyDetails/);
    assert.match(page, /read-rate-limits/);
  }
  for (const guide of [llms, llmsFull, agentGuide, mcpReadme]) {
    assert.match(guide, /developers\/reference#read-rate-limits/);
    assert.match(guide, /do not repeatedly retrieve (completed|terminal) scan resources/i);
  }
  const policyInstructions = agentInstructions.split("### Canonical API read-rate policy")[1]?.split("\n### ")[0] ?? "";
  assert.match(policyInstructions, /sole source of truth/);
  assert.match(policyInstructions, /Approved customer, marketing, dashboard, and scan-report pages may render the compact automated-access notice/);
  assert.match(policyInstructions, /structured denial log/);
  assert.doesNotMatch(policyInstructions, /\b(?:8|20|30|40|100|120) units\b/);
});
