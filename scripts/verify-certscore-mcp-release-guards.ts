import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { certScoreMcpToolContracts } from "../packages/certscore-api-contracts/src/mcp.js";

type ManifestTool = {
  name: string;
  description: string;
};

const repoRoot = process.cwd();
const manifest = JSON.parse(readFileSync(join(repoRoot, "packages/certscore-mcp/tools.manifest.json"), "utf8")) as ManifestTool[];

function sortedTools(tools: ManifestTool[]) {
  return [...tools].sort((a, b) => a.name.localeCompare(b.name));
}

function extractToolListFromSource(sourcePath: string, marker: string) {
  const source = readFileSync(join(repoRoot, sourcePath), "utf8");
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${sourcePath} should contain ${marker}`);
  const start = source.indexOf("[", markerIndex);
  const end = source.indexOf("] as const", start);
  assert.ok(start > markerIndex && end > start, `${sourcePath} should contain a const MCP tool array`);
  const block = source.slice(start, end);
  const tools = [...block.matchAll(/\["([^"]+)", "([^"]+)"\]/g)].map((match) => ({
    name: match[1] ?? "",
    description: match[2] ?? ""
  }));
  assert.equal(tools.length, manifest.length, `${sourcePath} should list ${manifest.length} MCP tools`);
  return tools;
}

function extractStringArrayFromSource(sourcePath: string, marker: string) {
  const source = readFileSync(join(repoRoot, sourcePath), "utf8");
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${sourcePath} should contain ${marker}`);
  const start = source.indexOf("[", markerIndex);
  const end = source.indexOf("]", start);
  assert.ok(start > markerIndex && end > start, `${sourcePath} should contain a string array for ${marker}`);
  return [...source.slice(start, end).matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

async function listRuntimeTools() {
  const binaryPath = join(repoRoot, "packages/certscore-mcp/dist/certscore-mcp.mjs");
  assert.ok(existsSync(binaryPath), "Build certscore-mcp before running release guards");
  const runtime = await import(pathToFileURL(binaryPath).href) as {
    createCertScoreMcpServer: (options?: { baseUrl?: string; timeout?: number }) => any;
  };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = runtime.createCertScoreMcpServer({
    baseUrl: "http://127.0.0.1:9",
    timeout: 1_000
  });
  const client = new Client({
    name: "certscore-mcp-release-guards",
    version: "0.0.0"
  });

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return (await client.listTools()).tools;
  } finally {
    await client.close();
    await server.close();
  }
}

async function assertNpmPackageExists(packageName: string) {
  const encoded = encodeURIComponent(packageName);
  const response = await fetch(`https://registry.npmjs.org/${encoded}`);
  assert.equal(response.status, 200, `npm package referenced by public docs must exist: ${packageName}`);
}

function packageNameFromNpxToken(token: string) {
  if (token.startsWith("@")) {
    const secondAt = token.indexOf("@", 1);
    return secondAt === -1 ? token : token.slice(0, secondAt);
  }
  const versionAt = token.indexOf("@");
  return versionAt === -1 ? token : token.slice(0, versionAt);
}

function npxPackagesFromDocs(paths: string[]) {
  const packages = new Set<string>();
  for (const path of paths) {
    const source = readFileSync(join(repoRoot, path), "utf8");
    for (const match of source.matchAll(/\bnpx\s+-y\s+((?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?)/g)) {
      const token = match[1];
      if (token) {
        packages.add(packageNameFromNpxToken(token));
      }
    }
  }
  return [...packages].sort();
}

async function main() {
  assert.equal(manifest.length, 12, "CertScore MCP manifest should expose exactly 12 tools");

  assert.deepEqual(
    sortedTools(certScoreMcpToolContracts.map((tool) => ({ name: tool.name, description: tool.description }))),
    sortedTools(manifest),
    "Shared MCP tool contracts must match checked-in manifest"
  );

  const runtimeTools = await listRuntimeTools();
  assert.deepEqual(
    sortedTools(runtimeTools.map((tool) => ({ name: tool.name, description: tool.description ?? "" }))),
    sortedTools(manifest),
    "Runtime MCP tools/list output must match checked-in manifest"
  );
  for (const tool of runtimeTools) {
    assert.ok(tool.annotations, `${tool.name} should expose MCP annotations`);
  }

  for (const [path, marker] of [
    ["apps/web/app/developers/developer-pages.tsx", "export const mcpTools ="],
    ["apps/web/app/api-pulse/page.tsx", "const mcpTools ="]
  ] as const) {
    assert.deepEqual(
      sortedTools(extractToolListFromSource(path, marker)),
      sortedTools(manifest),
      `${path} MCP docs must match checked-in manifest`
    );
  }

  assert.deepEqual(
    extractStringArrayFromSource("apps/web/app/.well-known/certscore-ai.json/route.ts", "currentTools:").sort(),
    manifest.map((tool) => tool.name).sort(),
    "AI discovery MCP currentTools must match checked-in manifest"
  );

  const readme = readFileSync(join(repoRoot, "packages/certscore-mcp/README.md"), "utf8");
  for (const tool of manifest) {
    assert.match(readme, new RegExp(`\\\`${tool.name}\\\``), `README should document ${tool.name}`);
    assert.ok(readme.includes(tool.description), `README should use manifest description for ${tool.name}`);
  }

  const packageNames = npxPackagesFromDocs([
    "packages/certscore-mcp/README.md",
    "apps/web/app/developers/mcp/page.tsx",
    "apps/web/lib/pulse/support-routes.test.ts"
  ]);
  assert.deepEqual(packageNames, ["certscore-mcp"], "Public npx examples should reference only certscore-mcp");
  if (process.env.CERTSCORE_MCP_SKIP_NPM_REGISTRY_CHECK !== "1") {
    await Promise.all(packageNames.map(assertNpmPackageExists));
  }

  console.log("CertScore MCP release guards passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
