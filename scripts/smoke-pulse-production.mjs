import assert from "node:assert/strict";

const baseUrl = (process.env.BASE_URL ?? "https://certscore.ai").replace(/\/+$/, "");
const disclaimerPattern = /automated public-web observations for review/i;

function absolute(path) {
  return `${baseUrl}${path}`;
}

async function get(path) {
  const url = absolute(path);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000)
  });
  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  assert.notEqual(response.status, 500, `${url} returned HTTP 500`);
  assert.ok(![301, 302, 307, 308].includes(response.status), `${url} redirected with ${response.status}`);
  assert.doesNotMatch(bodyText, /Internal Error|Application error|stack trace|DATABASE_URL|AUTH_SECRET|PRIVATE_KEY/i);

  return { bodyText, contentType, response, url };
}

function json(result) {
  assert.match(result.contentType, /^application\/json\b/, `${result.url} returned ${result.contentType}`);
  return JSON.parse(result.bodyText);
}

function assertDisclaimer(body, url) {
  assert.match(String(body.disclaimer ?? ""), disclaimerPattern, `${url} omitted the standard disclaimer`);
}

function assertPulseShape(result, allowedStatuses) {
  assert.ok(allowedStatuses.includes(result.response.status), `${result.url} returned ${result.response.status}`);

  if (result.response.status === 200 && /^text\/markdown\b/.test(result.contentType)) {
    assert.match(result.bodyText, disclaimerPattern, `${result.url} omitted disclaimer text`);
    return;
  }

  const body = json(result);
  assertDisclaimer(body, result.url);

  if (result.response.status === 200) {
    assert.equal(body.type, "certscore_pulse", `${result.url} returned unexpected 200 shape`);
    return;
  }

  if (result.response.status === 202) {
    assert.equal(body.type, "certscore_pulse_status", `${result.url} returned unexpected 202 shape`);
    return;
  }

  if (result.response.status === 400 || result.response.status === 404 || result.response.status === 429) {
    assert.equal(body.type, "certscore_pulse_error", `${result.url} returned unexpected error shape`);
    assert.equal(typeof body.error?.code, "string", `${result.url} omitted error.code`);
    return;
  }

  assert.fail(`${result.url} returned undocumented status ${result.response.status}`);
}

async function main() {
  const results = [];

  const docs = await get("/api-pulse");
  assert.equal(docs.response.status, 200);
  assert.match(docs.contentType, /^text\/html\b/);
  assert.match(docs.bodyText, /CertScore Pulse API/);
  results.push(docs);

  const openapi = await get("/api/v1/openapi.json");
  assert.equal(openapi.response.status, 200);
  const openapiBody = json(openapi);
  assert.equal(openapiBody.openapi, "3.1.0");
  assert.ok(openapiBody.paths?.["/api/v1/pulse"]);
  results.push(openapi);

  const discovery = await get("/.well-known/certscore-pulse");
  assert.equal(discovery.response.status, 200);
  const discoveryBody = json(discovery);
  for (const field of ["api", "openapi", "docs", "feedbackEmail", "disclaimer"]) {
    assert.ok(discoveryBody[field], `${discovery.url} missing ${field}`);
  }
  results.push(discovery);

  for (const path of [
    "/api/v1/pulse?url=https%3A%2F%2Fexample.com&detail=tiny",
    "/api/v1/pulse?url=https%3A%2F%2Fexample.com&detail=full"
  ]) {
    const result = await get(path);
    assertPulseShape(result, [200, 202, 429]);
    results.push(result);
  }

  const markdown = await get("/api/v1/pulse?url=https%3A%2F%2Fexample.com&format=markdown");
  assertPulseShape(markdown, [200, 202, 429]);
  results.push(markdown);

  const invalid = await get("/api/v1/pulse?url=%3A%3A%3A%3A");
  assert.equal(invalid.response.status, 400);
  const invalidBody = json(invalid);
  assert.equal(invalidBody.type, "certscore_pulse_error");
  assert.equal(invalidBody.error?.code, "invalid_url");
  assertDisclaimer(invalidBody, invalid.url);
  results.push(invalid);

  const missingStatus = await get("/api/v1/pulse/status/pulse_job_nonexistent_test");
  assertPulseShape(missingStatus, [404]);
  results.push(missingStatus);

  for (const result of results) {
    console.log(`${result.response.status} ${result.contentType} ${result.url}`);
  }
  console.log(`Pulse production smoke passed for ${baseUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
