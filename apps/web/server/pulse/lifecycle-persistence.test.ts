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
