import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

test("actual scan dispatcher rejects exhausted and expired promotions before queue, DNS or paid work", async () => {
  const source = await readFile("apps/web/server/scans/create-full-scan.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  for (const promotion of [{ active: true, used: 1000, limit: 1000 }, { active: false, used: 0, limit: 1000 }]) {
    const calls: string[] = [];
    const module = { exports: {} as Record<string, (input: unknown) => Promise<{ error: string; scanId: null }>> };
    const requireMock = (specifier: string) => new Proxy({}, {
      get(_target, property) {
        if (property === "__esModule") return true;
        if (property === "then") return undefined;
        if (property === "randomUUID") return randomUUID;
        if (property === "isBrowserWorkspace") return async () => false;
        if (property === "normalizeScanFrom") return () => "us";
        if (specifier === "../promotions/entitlement" && property === "getPromotionalEntitlement") return async () => promotion;
        return (..._args: unknown[]) => { calls.push(`${specifier}:${String(property)}`); throw new Error(`Unexpected external dependency: ${specifier}:${String(property)}`); };
      }
    });
    vm.runInNewContext(compiled, { exports: module.exports, module, require: requireMock, process: { env: { NODE_ENV: "test" } }, console });
    const result = await module.exports.queueFullScanForDomain!({ organizationId: randomUUID(), domainId: randomUUID(), planCode: "free" });
    assert.equal(result.scanId, null);
    assert.match(result.error, promotion.active ? /1,000-page promotional allowance/ : /access has ended/);
    assert.deepEqual(calls, []);
  }
});
