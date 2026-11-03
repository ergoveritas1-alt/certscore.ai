import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SDK and MCP publishers pin the same OIDC-capable npm 11 CLI on the supported Node 22 runtime", async () => {
  const versions: string[] = [];
  for (const file of [".github/workflows/certscore-sdk-release.yml", ".github/workflows/certscore-mcp-npm-release.yml"]) {
    const source = await readFile(file, "utf8");
    const version = source.match(/npm install --global npm@(\d+\.\d+\.\d+)/)?.[1];
    assert.ok(version); versions.push(version);
    const [major, minor, patch] = version.split(".").map(Number);
    assert.equal(major, 11);
    assert.ok(minor! > 5 || minor === 5 && patch! >= 1);
    assert.match(source, /node-version: 22/);
    assert.match(source, /major !== 22 \|\| minor < 14/);
    assert.ok(source.includes(`test "$(npm --version)" = "${version}"`));
    assert.ok(source.indexOf("Verify runtime versions") < source.indexOf("Publish to npm"));
    assert.match(source, /id-token: write/);
    assert.match(source, /npm publish --provenance --access public/);
    assert.match(source, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
    assert.match(source, /ref: \$\{\{ steps\.release\.outputs\.tag \}\}/);
    assert.match(source, /pkg.version !== process.env.RELEASE_VERSION/);
  }
  assert.equal(versions[0], versions[1]);
});
