import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PUBLIC_CERTSCORE_MCP_VERSION,
  PUBLIC_CERTSCORE_SDK_VERSION
} from "./public-integration-versions";

async function readPackageVersion(path: string): Promise<string> {
  const packageJson = JSON.parse(await readFile(path, "utf8")) as { version: string };
  return packageJson.version;
}

test("public integration versions match the released package manifests", async () => {
  const [sdkVersion, mcpVersion, hostedMcpVersion] = await Promise.all([
    readPackageVersion("packages/certscore-sdk/package.json"),
    readPackageVersion("packages/certscore-mcp/package.json"),
    readPackageVersion("apps/mcp/package.json")
  ]);

  assert.equal(PUBLIC_CERTSCORE_SDK_VERSION, sdkVersion);
  assert.equal(PUBLIC_CERTSCORE_MCP_VERSION, mcpVersion);
  assert.equal(PUBLIC_CERTSCORE_MCP_VERSION, hostedMcpVersion);
});

test("the static agent guide names the current SDK result contract", async () => {
  const guide = await readFile("apps/web/public/llms-full.txt", "utf8");

  assert.match(guide, new RegExp(`@certscore/sdk@${PUBLIC_CERTSCORE_SDK_VERSION.replaceAll(".", "\\.")}`));
  assert.match(guide, /typed GPC, Accept Path, and Reject Path results/);
});
