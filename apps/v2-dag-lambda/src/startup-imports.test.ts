import assert from "node:assert/strict";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("bundled coordinator initialization does not load browser or image runtimes", async () => {
  const directory = await mkdtemp(path.resolve("tmp/lambda-startup-"));
  const outfile = path.join(directory, "handler.cjs");
  try {
    await build({ entryPoints: [path.resolve("apps/v2-dag-lambda/src/handler.ts")], outfile,
      bundle: true, platform: "node", target: "node22", format: "cjs", minify: true,
      external: ["playwright", "pdf-parse", "sharp"], tsconfig: path.resolve("tsconfig.base.json") });
    const output = execFileSync(process.execPath, ["-e", `
      const Module = require('node:module'); const original = Module._load;
      Module._load = function(name, ...rest) {
        if (['playwright','pdf-parse','sharp'].includes(name)) throw new Error('Eager runtime import: '+name);
        return original.call(this,name,...rest);
      };
      const handler = require(process.argv[1]);
      if (typeof handler.handler !== 'function') throw new Error('Missing Lambda handler');
      const tuning = handler.buildLocalV2DagLambdaScanTuning({});
      if (!tuning) throw new Error('Missing coordinator tuning');
      console.log('coordinator ready');
    `, outfile], { encoding: "utf8" });
    assert.match(output, /coordinator ready/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
