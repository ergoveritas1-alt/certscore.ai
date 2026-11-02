import assert from "node:assert/strict";

export type McpReleaseAsset = { version: string; url: string; sha256: string };
const REPOSITORY = "https://github.com/ergoveritas1-alt/certscore.ai";

export function mcpReleaseMetadataUrl(cask: McpReleaseAsset): string {
  assert.match(cask.version, /^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/);
  assert.match(cask.sha256, /^[a-f0-9]{64}$/);
  const tag = `certscore-mcp-v${cask.version}`;
  assert.equal(cask.url, `${REPOSITORY}/releases/download/${tag}/${tag}.tar.gz`, "MCP asset URL must bind the declared repository, tag and filename");
  return `https://api.github.com/repos/ergoveritas1-alt/certscore.ai/releases/tags/${tag}`;
}

export function verifyMcpReleaseAssetMetadata(cask: McpReleaseAsset, raw: unknown): void {
  mcpReleaseMetadataUrl(cask);
  const metadata = raw as {tag_name?: unknown; draft?: unknown; prerelease?: unknown; published_at?: unknown; assets?: unknown} | null;
  assert.equal(metadata?.tag_name, `certscore-mcp-v${cask.version}`, "MCP release tag mismatch");
  assert.equal(metadata?.draft, false, "MCP release must be published");
  assert.equal(metadata?.prerelease, false, "MCP stable cask must not advertise a prerelease");
  assert.ok(typeof metadata?.published_at === "string" && Number.isFinite(Date.parse(metadata.published_at)), "MCP release publication time is required");
  assert.ok(Array.isArray(metadata?.assets), "MCP release asset metadata is required");
  const matches = metadata.assets.filter((a: unknown) => a && typeof a === "object" && (a as {name?:unknown}).name === `certscore-mcp-v${cask.version}.tar.gz`);
  assert.equal(matches.length, 1, "MCP release must contain exactly one advertised asset");
  const asset = matches[0] as {state?: unknown; size?: unknown; browser_download_url?: unknown; digest?: unknown};
  assert.equal(asset.state, "uploaded", "MCP release asset is not fully uploaded");
  assert.ok(typeof asset.size === "number" && Number.isSafeInteger(asset.size) && asset.size > 0, "MCP release asset size is invalid");
  assert.equal(asset.browser_download_url, cask.url, "MCP release asset URL mismatch");
  assert.equal(asset.digest, `sha256:${cask.sha256}`, "MCP GitHub-reported digest must match the checked-in cask");
}

/** Verify published metadata only. Never request the archive or follow redirects. */
export async function assertPublishedMcpReleaseAsset(cask: McpReleaseAsset, options: { fetchImpl?: typeof fetch; token?: string } = {}): Promise<void> {
  const response = await (options.fetchImpl ?? fetch)(mcpReleaseMetadataUrl(cask), {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
  });
  assert.ok(response.ok, `MCP release metadata lookup failed with HTTP ${response.status}`);
  verifyMcpReleaseAssetMetadata(cask, await response.json());
}
