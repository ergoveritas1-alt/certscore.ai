import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const allowedPublicNpmPackages = new Set(["@certscore/sdk"]);

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

function packageNameFromToken(token: string) {
  if (token.startsWith("@")) {
    const versionAt = token.indexOf("@", 1);
    return versionAt === -1 ? token : token.slice(0, versionAt);
  }
  const versionAt = token.indexOf("@");
  return versionAt === -1 ? token : token.slice(0, versionAt);
}

function npmPackagesFromSource(source: string) {
  const packages = new Set<string>();
  for (const match of source.matchAll(/\bnpm\s+install\s+((?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?)/g)) {
    if (match[1]) {
      packages.add(packageNameFromToken(match[1]));
    }
  }
  for (const match of source.matchAll(/\bnpx\s+(?:-y\s+)?((?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?)/g)) {
    if (match[1]) {
      packages.add(packageNameFromToken(match[1]));
    }
  }
  return [...packages].sort();
}

function assertNpmInstallClaimsAreAllowed(paths: string[]) {
  for (const path of paths) {
    const source = readPublicFile(path);
    const packageNames = npmPackagesFromSource(source);
    const disallowed = packageNames.filter((packageName) => !allowedPublicNpmPackages.has(packageName));
    assert.deepEqual(
      disallowed,
      [],
      `${path} should only advertise approved public npm packages. Found: ${packageNames.join(", ")}`
    );
  }
}

assertNoDuplicateNonCommentLines("apps/web/public/llms.txt");
assertNpmInstallClaimsAreAllowed([
  "apps/web/public/llms.txt",
  "apps/web/public/llms-full.txt"
]);

console.log("CertScore LLM discovery docs guard passed.");
