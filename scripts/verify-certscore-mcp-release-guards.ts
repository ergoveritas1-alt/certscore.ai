import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { certScoreMcpToolContracts } from "../packages/certscore-api-contracts/src/mcp.js";

type ManifestTool = {
  name: string;
  title: string;
  description: string;
};

type DocumentedTool = {
  name: string;
  description: string;
};

const repoRoot = process.cwd();
const manifest = JSON.parse(readFileSync(join(repoRoot, "packages/certscore-mcp/tools.manifest.json"), "utf8")) as ManifestTool[];
const packageJson = JSON.parse(readFileSync(join(repoRoot, "packages/certscore-mcp/package.json"), "utf8")) as { version: string };
const discoveryRoutePath = "apps/web/app/.well-known/certscore-ai.json/route.ts";
const caskPath = "Casks/certscore-mcp.rb";

function sortedTools(tools: ManifestTool[]) {
  return [...tools].sort((a, b) => a.name.localeCompare(b.name));
}

function sortedDocumentedTools(tools: DocumentedTool[]) {
  return [...tools].sort((a, b) => a.name.localeCompare(b.name));
}

function manifestDescriptions() {
  return manifest.map((tool) => ({ name: tool.name, description: tool.description }));
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

function extractQuotedStringAfterMarker(sourcePath: string, marker: string) {
  const source = readFileSync(join(repoRoot, sourcePath), "utf8");
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${sourcePath} should contain ${marker}`);
  const value = source.slice(markerIndex).match(/:\s*"([^"]+)"/)?.[1];
  assert.ok(value, `${sourcePath} should contain a quoted string for ${marker}`);
  return value;
}

function parseCertScoreMcpCask() {
  const source = readFileSync(join(repoRoot, caskPath), "utf8");
  const version = source.match(/^\s*version\s+"([^"]+)"/m)?.[1];
  const url = source.match(/^\s*url\s+"([^"]+)"/m)?.[1];
  const sha256 = source.match(/^\s*sha256\s+"([^"]+)"/m)?.[1];
  assert.ok(version, `${caskPath} should declare version`);
  assert.ok(url, `${caskPath} should declare url`);
  assert.ok(sha256, `${caskPath} should declare sha256`);
  return { sha256, url, version };
}

function tokenForReleaseLookup() {
  return process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
}

function ghReleaseAssetExists(version: string, assetName: string) {
  const token = tokenForReleaseLookup();
  if (!token) {
    return null;
  }
  const result = spawnSync("gh", [
    "release",
    "view",
    `certscore-mcp-v${version}`,
    "--repo",
    "ergoveritas1-alt/certscore.ai",
    "--json",
    "assets",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GH_TOKEN: token,
    },
  });
  if (result.status !== 0) {
    return false;
  }
  const payload = JSON.parse(result.stdout) as { assets?: Array<{ name?: string }> };
  return (payload.assets ?? []).some((asset) => asset.name === assetName);
}

async function httpReleaseAssetExists(url: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: { "Range": "bytes=0-0" },
    redirect: "follow"
  });
  await response.body?.cancel();
  return response.ok || response.status === 206;
}

async function assertReleaseAssetExists(cask: { url: string; version: string }) {
  const assetName = `certscore-mcp-v${cask.version}.tar.gz`;
  const ghResult = ghReleaseAssetExists(cask.version, assetName);
  if (ghResult === true) {
    return;
  }
  if (ghResult === false) {
    assert.fail(`mcp.releaseAsset drift: GitHub release certscore-mcp-v${cask.version} is missing asset ${assetName}`);
  }
  assert.ok(
    await httpReleaseAssetExists(cask.url),
    `mcp.releaseAsset drift: ${cask.url} must exist before Casks/certscore-mcp.rb or the AI discovery manifest advertises ${cask.version}`
  );
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
  assert.equal(manifest.length, 11, "CertScore MCP manifest should expose exactly 11 tools");
  const cask = parseCertScoreMcpCask();
  const discoveryVersion = extractQuotedStringAfterMarker(discoveryRoutePath, "currentVersion:");

  assert.deepEqual(
    sortedTools(certScoreMcpToolContracts.map((tool) => ({ name: tool.name, title: tool.title, description: tool.description }))),
    sortedTools(manifest),
    "Shared MCP tool contracts must match checked-in manifest"
  );

  const runtimeTools = await listRuntimeTools();
  assert.deepEqual(
    sortedTools(runtimeTools.map((tool) => ({ name: tool.name, title: tool.title ?? "", description: tool.description ?? "" }))),
    sortedTools(manifest),
    "Runtime MCP tools/list output must match checked-in manifest"
  );
  for (const tool of runtimeTools) {
    assert.ok(tool.title, `${tool.name} should expose MCP title`);
    assert.ok(tool.annotations, `${tool.name} should expose MCP annotations`);
  }
  const runtimeToolNames = runtimeTools.map((tool) => tool.name).sort();

  assert.equal(
    discoveryVersion,
    packageJson.version,
    `mcp.currentVersion drift: ${discoveryRoutePath} must match packages/certscore-mcp/package.json`
  );
  assert.match(
    cask.url,
    new RegExp(`/certscore-mcp-v${cask.version.replaceAll(".", "\\.")}/certscore-mcp-v${cask.version.replaceAll(".", "\\.")}\\.tar\\.gz$`),
    `mcp.caskUrl drift: ${caskPath} URL must point at the declared cask version`
  );
  await assertReleaseAssetExists(cask);

  for (const [path, marker] of [
    ["apps/web/app/developers/developer-pages.tsx", "export const mcpTools ="],
    ["apps/web/app/api-pulse/page.tsx", "const mcpTools ="]
  ] as const) {
    assert.deepEqual(
      sortedDocumentedTools(extractToolListFromSource(path, marker)),
      sortedDocumentedTools(manifestDescriptions()),
      `${path} MCP docs must match checked-in manifest`
    );
  }

  assert.deepEqual(
    extractStringArrayFromSource(discoveryRoutePath, "currentTools:").sort(),
    runtimeToolNames,
    "mcp.currentTools drift: AI discovery MCP currentTools must match built server tools/list names"
  );

  const readme = readFileSync(join(repoRoot, "packages/certscore-mcp/README.md"), "utf8");
  for (const tool of manifest) {
    assert.match(readme, new RegExp(`\\\`${tool.name}\\\``), `README should document ${tool.name}`);
    assert.ok(readme.includes(tool.description), `README should use manifest description for ${tool.name}`);
  }

  const packageNames = npxPackagesFromDocs([
    "packages/certscore-mcp/README.md",
    "apps/web/app/developers/mcp/page.tsx"
  ]);
  assert.deepEqual(packageNames, [], "Public MCP docs should use Homebrew, not npx/npm package examples");

  console.log("CertScore MCP release guards passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
