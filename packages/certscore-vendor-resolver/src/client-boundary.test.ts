import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

test("the shared vendor registry bundles for browsers without the server script parser", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./index.ts", import.meta.url))],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  assert.ok(result.outputFiles[0]?.text.length);
  assert.equal(Object.keys(result.metafile!.inputs).some(path => path.includes("runtime-script-facts") || path.includes("property-sale-sharing.ts") || path.includes("/acorn/")), false);
});

test("the scanner server entry bundles from source without generated dist files", async () => {
  const result = await build({
    stdin: {
      contents: 'export { extractRuntimeScriptFacts } from "@certscore/vendor-resolver/runtime-script-facts"; export { extractPropertySaleSharingSource } from "@certscore/vendor-resolver/property-sale-sharing";',
      resolveDir: fileURLToPath(new URL("../../../", import.meta.url)),
    },
    tsconfig: fileURLToPath(new URL("../../../tsconfig.base.json", import.meta.url)),
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  assert.ok(Object.keys(result.metafile!.inputs).some(path => /(?:^|\/)src\/runtime-script-facts\.ts$/.test(path)));
  assert.ok(Object.keys(result.metafile!.inputs).some(path => /(?:^|\/)src\/property-sale-sharing\.ts$/.test(path)));
  assert.equal(Object.keys(result.metafile!.inputs).some(path => /(?:^|\/)packages\/[^/]+\/dist\//.test(path)), false);
});
