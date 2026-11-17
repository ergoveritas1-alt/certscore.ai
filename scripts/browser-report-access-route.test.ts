import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Execute the actual route and actual access guard. All report/storage/export
// dependencies throw if reached; the auth adapter represents a missing session.
test("actual browser report handlers reject anonymous callers before data or export work", async t => {
  const directory = await mkdtemp(join(tmpdir(), "certscore-browser-report-access-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const routes = ["report-export", "report-details/gdpr-eprivacy", "runtime-evidence-graph", "form-snapshot", "visual-evidence/[artifactId]", "full-site", "full-site/coverage.csv"];
  for (const [index, route] of routes.entries()) {
    const entry = resolve(`apps/web/app/api/scans/[scanId]/${route}/route.ts`);
    const source = await readFile(entry, "utf8");
    const stubs = new Map<string, string>();
    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
      const specifier = match[2]!;
      if (specifier.startsWith("node:") || specifier.endsWith("/report-access")) continue;
      const exports = match[1]!.split(",").map(name => name.trim()).filter(name => name && !name.startsWith("type ")).map(name => name.split(/\s+as\s+/)[0]!);
      stubs.set(specifier, (stubs.get(specifier) ?? "") + "\n" + exports.map(name => `export function ${name}(){throw Error('Unexpected report dependency: ${name}');}`).join("\n"));
    }
    const output = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", tsconfig: "apps/web/tsconfig.test.json", plugins: [{ name: "anonymous-report-boundary", setup(api) {
      api.onResolve({ filter: /.*/ }, args => {
        if (args.importer.endsWith("/report-access.ts") && args.path === "../auth") return { path: "session", namespace: "isolated" };
        if (args.path === "next/navigation") return { path: "navigation", namespace: "isolated" };
        if (args.importer === entry && stubs.has(args.path)) return { path: args.path, namespace: "isolated" };
      });
      api.onLoad({ filter: /.*/, namespace: "isolated" }, args => ({ loader: "js", contents: args.path === "session"
        ? "export async function getFreshCurrentUser(){return null;}"
        : args.path === "navigation" ? "export function redirect(url){throw Error('REDIRECT:'+url);}"
        : stubs.get(args.path)! }));
    } }] });
    const file = join(directory, `route-${index}.mjs`);
    await writeFile(file, output.outputFiles[0]!.text);
    const { GET } = await import(pathToFileURL(file).href);
    for (const format of route === "report-export" ? ["pdf", "docx", "csv", "json"] : [""]) {
      const response = await GET(new Request(`https://certscore.ai/api/scans/scan/${route}?format=${format}`, {headers:{cookie:"certscore.session_token=forged",authorization:"Bearer invalid"}}), {params:Promise.resolve({scanId:"9b0b7a54-a12e-4522-9887-c47757e9f38f",artifactId:"capture"})});
      assert.equal(response.status, 401, `${route} ${format}`);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(await response.json(), { error: "Sign in or create an account to access this report." });
    }
  }
});
