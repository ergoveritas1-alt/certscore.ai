import test from "node:test";
import { execFileSync } from "node:child_process";
import path from "node:path";
test("public GPC schema, OpenAPI and standalone SDK type match their canonical generated source", () => {
  execFileSync("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "scripts/sync-gpc-observation-contract.ts", "--check"], {
    cwd: path.resolve(__dirname, "../../.."), stdio: "pipe",
  });
});
