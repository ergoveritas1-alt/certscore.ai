import assert from "node:assert/strict";
import test from "node:test";
import {
  MCP_LIGHT_CURSOR_DIRECTORY_URL,
  MCP_LIGHT_CURSOR_INSTALL_URL,
  MCP_LIGHT_ROLE_PROMPTS
} from "./mcp-light-public-links";

test("MCP Light public links expose the Cursor install and directory paths", () => {
  const install = new URL(MCP_LIGHT_CURSOR_INSTALL_URL);
  assert.equal(install.origin, "https://cursor.com");
  assert.equal(install.pathname, "/link/mcp/install");
  assert.equal(install.searchParams.get("name"), "CertScore.ai");

  const encodedConfig = install.searchParams.get("config");
  assert.ok(encodedConfig);
  assert.deepEqual(JSON.parse(Buffer.from(encodedConfig, "base64").toString("utf8")), {
    url: "https://mcp.certscore.ai/mcp/light"
  });
  assert.equal(MCP_LIGHT_CURSOR_DIRECTORY_URL, "https://cursor.directory/plugins/certscoreai-mcp-light");
});

test("MCP Light role prompts cover the three acquisition workflows and evidence boundaries", () => {
  assert.deepEqual(MCP_LIGHT_ROLE_PROMPTS.map(({ label }) => label), ["Launch review", "Vendor review", "Audit diagnostics"]);
  for (const { prompt } of MCP_LIGHT_ROLE_PROMPTS) {
    assert.match(prompt, /CertScore\.ai/);
    assert.match(prompt, /evidence/i);
    assert.match(prompt, /Reject Path/);
  }
});
