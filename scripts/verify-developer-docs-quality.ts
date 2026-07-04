import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildCertScoreApiV2OpenApiDocument } from "../packages/certscore-api-contracts/src/openapi-v2.js";

const repoRoot = process.cwd();

function run(command: string, args: string[], options: { cwd?: string; input?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    input: options.input
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function rgFiles(pattern: string) {
  const suffix = pattern.replace(/^\*/, "");
  const root = join(repoRoot, "apps/web/app/developers");
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(suffix)) {
        files.push(fullPath.slice(repoRoot.length + 1));
      }
    }
  };
  visit(root);
  return files.sort();
}

function decodeTemplate(raw: string) {
  return raw
    .replace(/\\`/g, "`")
    .replace(/\\\$/g, "$")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function codeBlocks(source: string) {
  return [...source.matchAll(/<CodeBlock>\{`([\s\S]*?)`\}<\/CodeBlock>/g)].map((match) => decodeTemplate(match[1] ?? ""));
}

function isShellBlock(block: string) {
  return /(^|\n)\s*(curl|export|[A-Z_]+=\$?\(?|npm|npx|pnpm|brew|CERTSCORE_[A-Z_]+=)/.test(block);
}

function lintShellBlocks() {
  const failures: string[] = [];
  for (const file of rgFiles("*.tsx")) {
    const source = readFileSync(join(repoRoot, file), "utf8");
    for (const [index, block] of codeBlocks(source).entries()) {
      if (!isShellBlock(block)) {
        continue;
      }
      const tempDir = mkdtempSync(join(tmpdir(), "certscore-shell-doc-"));
      const tempFile = join(tempDir, "snippet.sh");
      try {
        writeFileSync(tempFile, block);
        const syntax = spawnSync("bash", ["-n", tempFile], { encoding: "utf8" });
        if (syntax.status !== 0) {
          failures.push(`${file} CodeBlock #${index + 1}: bash -n failed\n${syntax.stderr}`);
        }
      } finally {
        rmSync(tempDir, { force: true, recursive: true });
      }
      for (const [lineNumber, line] of block.split("\n").entries()) {
        if (/(?:^|\s)(?:-d|--data(?:-raw|-binary)?)\s+"\{/.test(line)) {
          failures.push(`${file} CodeBlock #${index + 1} line ${lineNumber + 1}: JSON body starts inside a double-quoted shell argument; use a heredoc, single quotes, or escaped quotes.`);
        }
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n\n"));
}

function packageNameFromToken(token: string) {
  if (token.startsWith("@")) {
    const versionAt = token.indexOf("@", 1);
    return versionAt === -1 ? token : token.slice(0, versionAt);
  }
  const versionAt = token.indexOf("@");
  return versionAt === -1 ? token : token.slice(0, versionAt);
}

function packagesFromDeveloperDocs() {
  const packages = new Set<string>();
  for (const file of rgFiles("*.tsx")) {
    const source = readFileSync(join(repoRoot, file), "utf8");
    for (const match of source.matchAll(/\bnpm\s+install\s+((?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?)/g)) {
      if (match[1]) {
        packages.add(packageNameFromToken(match[1]));
      }
    }
    for (const match of source.matchAll(/\bnpx\s+-y\s+((?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?)/g)) {
      if (match[1]) {
        packages.add(packageNameFromToken(match[1]));
      }
    }
  }
  return [...packages].sort();
}

function assertNoPublicNpmPackageClaims() {
  const packageNames = packagesFromDeveloperDocs();
  assert.deepEqual(packageNames, [], "Developer docs should not reference npm/npx packages until a public package channel is enabled");
}

function referenceRoutes() {
  const source = readFileSync(join(repoRoot, "apps/web/app/developers/developer-pages.tsx"), "utf8");
  const marker = "export const apiV2Routes =";
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, "developer-pages.tsx should export apiV2Routes");
  const start = source.indexOf("[", markerIndex);
  const end = source.indexOf("] as const", start);
  assert.ok(start > markerIndex && end > start, "apiV2Routes should be a const tuple array");
  return [...source.slice(start, end).matchAll(/\["(?:GET|POST|PUT|PATCH|DELETE)", "([^"]+)"/g)].map((match) => match[1] ?? "").sort();
}

function assertOpenApiReferenceSync() {
  const openApiPaths = Object.keys(buildCertScoreApiV2OpenApiDocument().paths).sort();
  assert.deepEqual(referenceRoutes(), openApiPaths, "API v2 reference route table must match OpenAPI paths exactly");
}

function assertSdkExampleMirrored() {
  const example = readFileSync(join(repoRoot, "packages/certscore-sdk/examples/canonical-resource-workflow.ts"), "utf8").trim();
  const sdkPage = readFileSync(join(repoRoot, "apps/web/app/developers/sdk/page.tsx"), "utf8");
  assert.ok(sdkPage.includes(example), "Developer SDK page should embed the canonical SDK resource workflow example");
}

async function main() {
  lintShellBlocks();
  assertNoPublicNpmPackageClaims();
  assertOpenApiReferenceSync();
  assertSdkExampleMirrored();
  console.log("Developer docs quality guards passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
