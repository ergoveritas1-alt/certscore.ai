import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const EXPECTED = {
  claudeVersion: "0.2.16",
  cursorVersion: "1.0.1",
  endpoint: "https://mcp.certscore.ai/mcp/light",
  openAiVersion: "2.0.0",
  owner: "CertScore.ai, LLC",
  registryName: "ai.certscore/mcp-light",
  serverVersion: "0.2.16",
} as const;

function read(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function json(path: string) {
  return JSON.parse(read(path)) as Record<string, any>;
}

function pngDimensions(path: string) {
  const bytes = readFileSync(join(repoRoot, path));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} is not a PNG.`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const server = json("packages/certscore-mcp/server-light.json");
const packageJson = json("packages/certscore-mcp/package.json");
const claudeCatalog = json(".claude-plugin/marketplace.json");
const claudePlugin = json("integrations/claude-code/certscore-mcp-light/.claude-plugin/plugin.json");
const cursorCatalog = json(".cursor-plugin/marketplace.json");
const cursorPlugin = json("integrations/cursor/certscore-website-privacy-preflight/plugin.json");
const openAiPlugin = json("integrations/openai/certscore-website-privacy-preflight/.codex-plugin/plugin.json");
const clineEntry = json("integrations/cline/certscore-mcp-light/entry.json");
const docs = [
  "docs/mcp-light-directory-submissions.md",
  "docs/mcp-light-marketplace-assets.md",
  "docs/mcp-light-submission-packets.md",
  "docs/mcp-light-install.md",
  "llms-install.md",
].map((path) => ({ path, source: read(path) }));

assert.equal(server.name, EXPECTED.registryName);
assert.equal(server.version, EXPECTED.serverVersion);
assert.equal(server.remotes?.[0]?.url, EXPECTED.endpoint);
assert.equal(packageJson.version, EXPECTED.serverVersion);

assert.equal(claudeCatalog.owner?.name, EXPECTED.owner);
assert.equal(claudePlugin.author?.name, EXPECTED.owner);
assert.equal(claudePlugin.version, EXPECTED.claudeVersion);
assert.equal(cursorCatalog.owner?.name, EXPECTED.owner);
assert.equal(cursorCatalog.plugins?.[0]?.author?.name, EXPECTED.owner);
assert.equal(cursorCatalog.plugins?.[0]?.version, EXPECTED.cursorVersion);
assert.equal(cursorPlugin.author?.name, EXPECTED.owner);
assert.equal(cursorPlugin.version, EXPECTED.cursorVersion);
assert.equal(openAiPlugin.author?.name, EXPECTED.owner);
assert.equal(openAiPlugin.interface?.developerName, EXPECTED.owner);
assert.equal(openAiPlugin.version, EXPECTED.openAiVersion);
assert.equal(clineEntry.author?.name, EXPECTED.owner);
assert.equal(clineEntry.id, "certscore-mcp-light");
assert.deepEqual(clineEntry.install?.args, ["certscore-light", "--transport", "streamable-http", EXPECTED.endpoint]);

for (const { path, source } of docs) {
  assert.doesNotMatch(source, /ErgoVeritas, LLC/, `${path} contains the retired publisher name.`);
  assert.match(source, new RegExp(EXPECTED.registryName.replace("/", "\\/")), `${path} omits the registry name.`);
  assert.match(source, new RegExp(EXPECTED.serverVersion.replaceAll(".", "\\.")), `${path} omits the hosted version.`);
}

const submissionPacket = read("docs/mcp-light-submission-packets.md");
assert.match(submissionPacket, /OpenAI package is `2\.0\.0`/);
assert.doesNotMatch(submissionPacket, /OpenAI package is `1\.0\.0`/);
assert.match(read("integrations/kilo-code/certscore-mcp-light/MCP.yaml"), /^author: CertScore\.ai, LLC$/m);
assert.match(read("apps/web/public/llms.txt"), /Official MCP Registry name: ai\.certscore\/mcp-light/);
assert.match(read("apps/web/public/llms-full.txt"), /current hosted MCP version is `0\.2\.16`/);

assert.deepEqual(pngDimensions("apps/web/public/certscore-mark-dark.png"), { width: 512, height: 512 });
assert.deepEqual(pngDimensions("apps/web/public/certscore-mark-light.png"), { width: 512, height: 512 });
assert.deepEqual(pngDimensions("apps/web/public/images/mcp-directory/certscore-mcp-light-cline-400.png"), { width: 400, height: 400 });
assert.deepEqual(pngDimensions("apps/web/public/images/releases/mcp-light-social-card.png"), { width: 1200, height: 630 });

console.log(JSON.stringify({
  event: "mcp_light_distribution_check.passed",
  packages: {
    claude: EXPECTED.claudeVersion,
    cursor: EXPECTED.cursorVersion,
    openai: EXPECTED.openAiVersion,
    server: EXPECTED.serverVersion,
  },
  publisher: EXPECTED.owner,
  registryName: EXPECTED.registryName,
}, null, 2));
