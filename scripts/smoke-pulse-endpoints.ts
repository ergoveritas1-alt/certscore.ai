import assert from "node:assert/strict";

const baseUrl = (process.env.BASE_URL ?? process.env.PULSE_SMOKE_BASE_URL ?? "https://certscore.ai").replace(/\/+$/, "");
const standardDisclaimerPattern = /automated public-web observations for review/i;
const shortDisclaimerPattern = /not legal advice, certification, or a compliance determination/i;

type FetchResult = {
  bodyText: string;
  contentType: string;
  response: Response;
  url: string;
};

function absolute(path: string) {
  return `${baseUrl}${path}`;
}

function assertNoInternalError(result: FetchResult) {
  assert.notEqual(result.response.status, 500, `${result.url} returned HTTP 500`);
  assert.doesNotMatch(
    result.bodyText,
    /Internal Error|Application error|This page could not be found|stack trace|DATABASE_URL|AUTH_SECRET|API_SECRET|PRIVATE_KEY/i
  );
}

function assertNoRedirect(result: FetchResult) {
  assert.ok(![301, 302, 307, 308].includes(result.response.status), `${result.url} returned redirect ${result.response.status}`);
}

function assertJsonContentType(result: FetchResult) {
  assert.match(result.contentType, /^application\/json\b/, `${result.url} returned ${result.contentType}`);
}

function parseJson(result: FetchResult) {
  assertJsonContentType(result);
  return JSON.parse(result.bodyText) as Record<string, unknown>;
}

async function fetchTarget(path: string): Promise<FetchResult> {
  const url = absolute(path);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000)
  });
  const bodyText = await response.text();
  const result = {
    bodyText,
    contentType: response.headers.get("content-type") ?? "",
    response,
    url
  };
  assertNoRedirect(result);
  assertNoInternalError(result);
  return result;
}

function assertPulseBody(status: number, body: Record<string, unknown>, url: string) {
  assert.match(String(body.disclaimer ?? ""), standardDisclaimerPattern, `${url} omitted the standard disclaimer`);

  if (status === 200) {
    assert.ok(
      body.type === "certscore_pulse" || body.type === "certscore_pulse_summary",
      `${url} returned unexpected 200 body type`
    );
    return;
  }

  if (status === 202) {
    assert.equal(body.type, "certscore_pulse_status", `${url} returned unexpected 202 body type`);
    return;
  }

  if (status === 400 || status === 404 || status === 429 || status === 503) {
    assert.equal(body.type, "certscore_pulse_error", `${url} returned unexpected error body type`);
    assert.equal(typeof (body.error as { code?: unknown } | undefined)?.code, "string", `${url} omitted error.code`);
    return;
  }

  assert.fail(`${url} returned undocumented Pulse status ${status}`);
}

async function checkDocsPage() {
  const result = await fetchTarget("/api-pulse");
  assert.equal(result.response.status, 200);
  assert.match(result.contentType, /^text\/html\b/);
  assert.match(result.bodyText, /CertScore(?:\.ai)? Pulse API/);
  assert.match(result.bodyText, /OpenAPI JSON/);
  assert.match(result.bodyText, /Discovery JSON/);
  assert.match(result.bodyText, /Open quick-start endpoint/);
  assert.match(result.bodyText, /Open test URL/);
  return result;
}

async function checkOpenApi() {
  const result = await fetchTarget("/api/v1/openapi.json");
  assert.equal(result.response.status, 200);
  const body = parseJson(result);
  assert.equal(body.openapi, "3.1.0");

  const paths = body.paths as Record<string, unknown> | undefined;
  assert.ok(paths?.["/api/v1/pulse"]);
  assert.ok(paths?.["/api/v1/pulse/status/{jobId}"]);
  assert.ok(paths?.["/api/v1/pulse/feedback"]);

  const serialized = JSON.stringify(body);
  assert.match(serialized, /detail/);
  assert.match(serialized, /freshness/);
  assert.match(serialized, /wait/);
  assert.match(serialized, /certscore_pulse_status/);
  assert.match(serialized, /pulse_throttled/);
  assert.match(serialized, standardDisclaimerPattern);
  return result;
}

async function checkDiscovery() {
  const result = await fetchTarget("/.well-known/certscore-pulse");
  assert.equal(result.response.status, 200);
  const body = parseJson(result);
  assert.equal(body.name, "CertScore Pulse beta");
  assert.equal(body.api, "https://certscore.ai/api/v1/pulse");
  assert.equal(body.openapi, "https://certscore.ai/api/v1/openapi.json");
  assert.equal(body.docs, "https://certscore.ai/api-pulse");
  assert.deepEqual(body.formats, ["json", "markdown"]);
  assert.deepEqual(body.detailLevels, ["tiny", "standard", "full"]);
  assert.deepEqual(body.detailAliases, { quick: "tiny" });
  assert.equal(body.feedbackEmail, "support@certscore.ai");
  assert.match(String(body.disclaimer ?? ""), shortDisclaimerPattern);
  return result;
}

async function checkPulse(path: string, allowedStatuses: number[]) {
  const result = await fetchTarget(path);
  assert.ok(allowedStatuses.includes(result.response.status), `${result.url} returned ${result.response.status}`);

  if (result.response.status === 200 && path.includes("format=markdown")) {
    assert.match(result.contentType, /^text\/markdown\b/);
    assert.match(result.bodyText, standardDisclaimerPattern);
    return result;
  }

  const body = parseJson(result);
  assertPulseBody(result.response.status, body, result.url);
  return result;
}

async function checkDocsLinks() {
  const checks = [
    ["/api/v1/pulse?url=https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html", [200, 202, 429, 503]],
    ["/api/v1/pulse?url=https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html&detail=tiny", [200, 202, 429, 503]],
    ["/api/v1/pulse?url=https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html&detail=full", [200, 202, 429, 503]],
    ["/api/v1/pulse?url=https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html&format=markdown", [200, 202, 429, 503]],
    ["/api/v1/openapi.json", [200]],
    ["/.well-known/certscore-pulse", [200]],
    ["/llms.txt", [200]]
  ] as const;

  for (const [path, allowedStatuses] of checks) {
    if (path.endsWith("openapi.json")) {
      await checkOpenApi();
    } else if (path.includes(".well-known")) {
      await checkDiscovery();
    } else if (path === "/llms.txt") {
      const result = await fetchTarget(path);
      assert.equal(result.response.status, 200);
      assert.match(result.contentType, /^text\/plain\b/);
    } else {
      await checkPulse(path, [...allowedStatuses]);
    }
  }
}

async function main() {
  const results: FetchResult[] = [];

  results.push(await checkDocsPage());
  results.push(await checkOpenApi());
  results.push(await checkDiscovery());
  results.push(await checkPulse("/api/v1/pulse?url=https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html&detail=tiny", [200, 202, 429, 503]));
  results.push(await checkPulse("/api/v1/pulse?url=https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html&detail=full", [200, 202, 429, 503]));
  results.push(await checkPulse("/api/v1/pulse?url=https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html&format=markdown", [200, 202, 429, 503]));
  results.push(await checkPulse("/api/v1/pulse?url=::::", [400]));
  results.push(await checkPulse("/api/v1/pulse/status/pulse_job_nonexistent_test", [404, 503]));
  await checkDocsLinks();

  for (const result of results) {
    console.log(`${result.response.status} ${result.contentType} ${result.url}`);
  }
  console.log(`Pulse endpoint smoke passed for ${baseUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
