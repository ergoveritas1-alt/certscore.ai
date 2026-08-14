import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Pulse status polling persists terminal lifecycle state", async () => {
  const route = await readFile("apps/web/app/api/v1/pulse/status/[jobId]/route.ts", "utf8");
  const repository = await readFile("apps/web/server/pulse/repository.ts", "utf8");

  assert.match(route, /updatePulseRequestLifecycle/);
  assert.match(route, /completed_limited/);
  assert.match(repository, /phase = \$3/);
  assert.match(repository, /completed_at = case/);
  assert.match(repository, /phase = 'completed'/);
  assert.match(repository, /scan_id = \$2 and status in \('queued', 'running'\)/);
  assert.match(repository, /when public_id = \$1 then coalesce\(\$6, resolution_mode\)/);
  assert.doesNotMatch(repository, /timezone\('utc', now\(\)\)/);
});

test("Pulse timestamptz columns use timezone-aware now without a second timezone conversion", async () => {
  const schemaSource = await readFile("apps/web/server/pulse/schema.ts", "utf8");
  const migration = await readFile("packages/db/migrations/0136_pulse_timestamptz_defaults.sql", "utf8");

  assert.doesNotMatch(schemaSource, /default timezone\('utc', now\(\)\)/);
  assert.match(migration, /alter column requested_at set default now\(\)/);
  assert.match(migration, /alter table public\.pulse_artifact_downloads/);
});

test("Pulse response links use the active app origin instead of the SEO canonical origin", async () => {
  const routeSource = await readFile("apps/web/app/api/v1/pulse/route.ts", "utf8");

  assert.match(routeSource, /process\.env\.NEXT_PUBLIC_APP_URL\?\.trim\(\) \|\| SITE_URL/);
  assert.match(routeSource, /pulseAbsoluteUrl\(`\/api\/v1\/pulse\?scanId=/);
  assert.doesNotMatch(routeSource, /import \{ absoluteUrl \} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/seo"/);
});

test("Pulse request persistence preserves direct API, SDK, and MCP channels", async () => {
  const routeSource = await readFile("apps/web/app/api/v1/pulse/route.ts", "utf8");
  const repositorySource = await readFile("apps/web/server/pulse/repository.ts", "utf8");

  assert.match(routeSource, /integrationClient === "sdk"/);
  assert.match(routeSource, /integrationClient === "mcp"/);
  assert.match(routeSource, /integrationClient === "pulse"/);
  assert.match(routeSource, /\? "pulse_api"/);
  assert.match(routeSource, /integrationClient\s+\? "other_api"\s+: null/);
  assert.match(routeSource, /integrationChannel \?\? "pulse_api"/);
  assert.doesNotMatch(routeSource, /requestChannel: gptAction \? "gpt_action" : "pulse_api"/);
  assert.match(repositorySource, /input\.requestChannel \?\? input\.context\.channel \?\? input\.context\.source/);
});

test("authenticated Pulse API keys bypass the anonymous scan quota", async () => {
  const routeSource = await readFile("apps/web/app/api/v1/pulse/route.ts", "utf8");

  assert.match(routeSource, /countAnonymousQuota: !apiKeyContext\.apiKeyId/);
});

test("Pulse validates DNS before creating a queued request or claiming the domain throttle", async () => {
  const routeSource = await readFile("apps/web/app/api/v1/pulse/route.ts", "utf8");
  const dnsIndex = routeSource.lastIndexOf("const dnsStatus = await checkDomainDns");
  const createIndex = routeSource.lastIndexOf("const reservedRequest = apiKeyUsageKey");
  const throttleIndex = routeSource.lastIndexOf("const throttle = await claimPulseDomainScanCreation");

  assert.ok(dnsIndex > 0);
  assert.ok(createIndex > dnsIndex);
  assert.ok(throttleIndex > createIndex);
  assert.match(routeSource, /dnsStatus\.retryable \? 503 : 400/);
});

test("Pulse domain cooldown is claimed atomically under concurrent requests", async () => {
  const repositorySource = await readFile("apps/web/server/pulse/repository.ts", "utf8");
  const functionAt = repositorySource.indexOf("export async function claimPulseDomainScanCreation");
  const nextFunctionAt = repositorySource.indexOf("export async function", functionAt + 1);
  const source = repositorySource.slice(functionAt, nextFunctionAt);
  assert.match(source, /insert into pulse_domain_throttles/);
  assert.match(source, /on conflict \(normalized_domain\)/);
  assert.match(source, /where pulse_domain_throttles\.expires_at <= now\(\)/);
  assert.match(source, /returning expires_at/);
  assert.ok(source.indexOf("insert into pulse_domain_throttles") < source.indexOf("select expires_at from pulse_domain_throttles"));
});

test("Pulse integration quota counts scan creation but not polling or recent-result reuse", async () => {
  const routeSource = await readFile("apps/web/app/api/v1/pulse/route.ts", "utf8");
  const repositorySource = await readFile("apps/web/server/pulse/repository.ts", "utf8");

  assert.match(routeSource, /mode: "url" as const, quotaClass: "scan_create" as const/);
  assert.match(repositorySource, /request_context->>'quotaClass' = 'scan_create'/);
  assert.match(repositorySource, /pg_advisory_xact_lock/);
  assert.match(repositorySource, /withWriteTransaction/);
  assert.ok(routeSource.indexOf("if (scanId)") < routeSource.indexOf("const reservedRequest = apiKeyUsageKey"));
  assert.ok(routeSource.indexOf("if (jobId)") < routeSource.indexOf("const reservedRequest = apiKeyUsageKey"));
});

test("Pulse terminalizes scan-creation exceptions and anonymous quota failures", async () => {
  const routeSource = await readFile("apps/web/app/api/v1/pulse/route.ts", "utf8");
  const repositorySource = await readFile("apps/web/server/pulse/repository.ts", "utf8");

  assert.match(routeSource, /updatePulseRequestFailed/);
  assert.match(routeSource, /anonymous_daily_scan_limit/);
  assert.match(repositorySource, /error_code = \$2/);
  assert.match(repositorySource, /status = 'failed'/);
});
