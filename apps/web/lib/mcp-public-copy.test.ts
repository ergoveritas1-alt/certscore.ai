import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MCP_OAUTH_ELIGIBILITY, MCP_OAUTH_AUTHORIZATION } from "./mcp-public-copy";


test("public policy describes registered-client active membership without host-prompt promises", () => {
  assert.match(MCP_OAUTH_ELIGIBILITY, /Members of active/);
  assert.match(MCP_OAUTH_ELIGIBILITY, /registered OAuth clients/);
  assert.match(MCP_OAUTH_AUTHORIZATION, /client may show its own/);
  assert.match(MCP_OAUTH_AUTHORIZATION, /review its exact connection destination/);
  for (const path of ["developers/mcp", "developers/quickstart"]) {
    const source = readFileSync(`apps/web/app/${path}/page.tsx`, "utf8");
    assert.match(source, /MCP_OAUTH_ELIGIBILITY/);
    assert.doesNotMatch(source, /Active Trial workspaces|12 scan\/report|approve.*once|No separate Connect screen|exposes exactly|No CertScore staff approval/);
  }
});
test("verified catalogs and public Light copy preserve evidence paging beyond the core workflow", () => {
  const evidence = JSON.parse(readFileSync("outputs/hosted-oauth-launch-2026-09-14/light-production.json", "utf8"));
  const smoke = readFileSync("scripts/smoke-hosted-mcp-production.ts", "utf8");
  const lightSection = smoke.split("export const LIGHT_TOOL_NAMES = [")[1];
  assert.ok(lightSection);
  const lightCatalog = lightSection.split("] as const")[0];
  assert.ok(lightCatalog);
  assert.deepEqual(evidence.tools, [...lightCatalog.matchAll(/"(certscore_[a-z_]+)"/g)].map(match => match[1]).sort());
  assert.match(smoke, /certscore_get_connection_status/);
  const page = readFileSync("apps/web/app/mcp/light/page.tsx", "utf8");
  assert.match(page, /certscore_get_report_evidence_page/);
  assert.doesNotMatch(page, /three-tool Light surface|three Light tools|scan creation may require support/);
});
