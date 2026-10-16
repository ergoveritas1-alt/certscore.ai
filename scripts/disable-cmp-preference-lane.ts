import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { awsScannerImageControl, SCANNER_PROVENANCE_REGIONS } from "./lib/scanner-image-provenance.js";
import { disableCmpPreferenceLane } from "./lib/disable-cmp-preference-lane.js";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
  if (!out || args.some((arg, index) => arg !== "--apply" && arg !== "--out" && index !== outIndex + 1)) {
    throw new Error("Usage: disable-cmp-preference-lane.ts [--apply] --out <audit.json>");
  }
  const results = [];
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  for (const region of SCANNER_PROVENANCE_REGIONS) {
    for (const inventory of [false, true]) {
      const result = { region, inventory, ...await disableCmpPreferenceLane(awsScannerImageControl(region, inventory), apply) };
      results.push(result);
      await writeFile(out, JSON.stringify({ generatedAt: new Date().toISOString(), configurationOnly: true, results }, null, 2));
      console.log(JSON.stringify(result));
    }
  }
}

main().catch(() => { console.error("Preference-lane configuration operation failed. Sensitive AWS configuration omitted; inspect the retained successful-region audit."); process.exitCode = 1; });
