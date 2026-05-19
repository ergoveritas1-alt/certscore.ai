import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.PULSE_SMOKE_BASE_URL?.replace(/\/+$/, "");
const allowedPulseStatuses = new Set([200, 202, 400, 404, 429]);
const standardDisclaimerPattern = /automated public-web observations for review/i;

type SmokeTarget = {
  path: string;
  kind: "openapi" | "pulse" | "discovery" | "docs";
};

const smokeTargets: SmokeTarget[] = [
  { path: "/api/v1/openapi.json", kind: "openapi" },
  { path: "/api/v1/pulse?url=https://example.com&detail=tiny", kind: "pulse" },
  { path: "/api/v1/pulse?url=https://example.com&detail=full", kind: "pulse" },
  { path: "/api/v1/pulse?url=https://example.com&format=markdown", kind: "pulse" },
  { path: "/api/v1/pulse?url=not-a-url", kind: "pulse" },
  { path: "/.well-known/certscore-pulse", kind: "discovery" },
  { path: "/api-pulse", kind: "docs" }
];

function assertNoFrameworkOrAuthWall(body: string) {
  assert.doesNotMatch(body, /__NEXT_DATA__|Application error|This page could not be found|sign in|login/i);
}

function assertNoFrameworkErrorPage(body: string) {
  assert.doesNotMatch(body, /Application error|This page could not be found/i);
}

function assertJsonContentType(contentType: string | null) {
  assert.match(contentType ?? "", /^application\/json\b/);
}

function assertPulseJsonShape(status: number, body: unknown) {
  assert.equal(typeof body, "object");
  assert.ok(body);

  const record = body as Record<string, unknown>;
  assert.match(String(record.disclaimer ?? ""), standardDisclaimerPattern);

  if (status === 200) {
    assert.equal(record.type, "certscore_pulse");
    return;
  }

  if (status === 202) {
    assert.equal(record.type, "certscore_pulse_status");
    assert.equal(typeof record.jobId, "string");
    return;
  }

  if (status === 400 || status === 404 || status === 429) {
    assert.equal(record.type, "certscore_pulse_error");
    assert.equal(typeof (record.error as { code?: unknown } | undefined)?.code, "string");
    return;
  }

  assert.fail(`Unexpected Pulse status ${status}`);
}

test(
  "Pulse production-like smoke checks return documented public shapes",
  { skip: baseUrl ? false : "Set PULSE_SMOKE_BASE_URL=https://certscore.ai to run live Pulse smoke checks." },
  async (t) => {
    assert.ok(baseUrl);

    for (const target of smokeTargets) {
      await t.test(target.path, async () => {
        const response = await fetch(`${baseUrl}${target.path}`, {
          redirect: "manual",
          signal: AbortSignal.timeout(30_000)
        });
        const bodyText = await response.text();

        assert.notEqual(response.status, 301);
        assert.notEqual(response.status, 302);
        assert.notEqual(response.status, 307);
        assert.notEqual(response.status, 308);

        if (target.kind === "openapi") {
          assertNoFrameworkOrAuthWall(bodyText);
          assert.equal(response.status, 200);
          assertJsonContentType(response.headers.get("content-type"));
          const body = JSON.parse(bodyText) as { openapi?: unknown; paths?: Record<string, unknown>; info?: { description?: string } };
          assert.equal(body.openapi, "3.1.0");
          assert.ok(body.paths?.["/api/v1/pulse"]);
          assert.match(body.info?.description ?? "", standardDisclaimerPattern);
          return;
        }

        if (target.kind === "discovery") {
          assertNoFrameworkOrAuthWall(bodyText);
          assert.equal(response.status, 200);
          assertJsonContentType(response.headers.get("content-type"));
          const body = JSON.parse(bodyText) as { api?: unknown; openapi?: unknown; disclaimer?: unknown };
          assert.equal(body.api, "https://certscore.ai/api/v1/pulse");
          assert.equal(body.openapi, "https://certscore.ai/api/v1/openapi.json");
          assert.match(String(body.disclaimer ?? ""), /not legal advice/i);
          return;
        }

        if (target.kind === "docs") {
          assertNoFrameworkErrorPage(bodyText);
          assert.equal(response.status, 200);
          assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/);
          assert.match(bodyText, /CertScore Pulse API/);
          assert.match(bodyText, /OpenAPI JSON/);
          return;
        }

        assertNoFrameworkOrAuthWall(bodyText);
        assert.ok(allowedPulseStatuses.has(response.status), `Unexpected Pulse HTTP status ${response.status}`);

        const contentType = response.headers.get("content-type");
        if (response.status === 200 && target.path.includes("format=markdown")) {
          assert.match(contentType ?? "", /^text\/markdown\b/);
          assert.match(bodyText, standardDisclaimerPattern);
          return;
        }

        assertJsonContentType(contentType);
        assertPulseJsonShape(response.status, JSON.parse(bodyText));
      });
    }
  }
);
