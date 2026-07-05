import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

function readPublicFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function assertNoDuplicateNonCommentLines(path: string) {
  const source = readPublicFile(path);
  const seen = new Map<string, number>();
  source.split(/\r?\n/).forEach((line, index) => {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith("#")) {
      return;
    }
    const previousLine = seen.get(normalized);
    assert.equal(
      previousLine,
      undefined,
      `${path} duplicate non-comment line: line ${index + 1} repeats line ${previousLine ?? "unknown"}: ${normalized}`
    );
    seen.set(normalized, index + 1);
  });
}

function assertOnlyApprovedNpmClaims(paths: string[]) {
  for (const path of paths) {
    const source = readPublicFile(path);
    const unexpected = [...source.matchAll(/\b(?:npm|npx)\b[^\n]*/gi)]
      .map((match) => match[0] ?? "")
      .filter((line) => !line.includes("@certscore/sdk") && !line.includes("@certscore/mcp"));
    assert.deepEqual(unexpected, [], `${path} should only advertise approved CertScore npm packages`);
  }
}

assertNoDuplicateNonCommentLines("apps/web/public/llms.txt");
assertOnlyApprovedNpmClaims([
  "apps/web/public/llms.txt",
  "apps/web/public/llms-full.txt"
]);

console.log("CertScore LLM discovery docs guard passed.");
