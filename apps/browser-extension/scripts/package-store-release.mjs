import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const outputDir = resolve(root, "../../artifacts/chrome-web-store");
const releaseName = `certscore-chrome-extension-${manifest.version}`;
const zipPath = join(outputDir, `${releaseName}.zip`);
const checksumPath = `${zipPath}.sha256`;
const tempRoot = mkdtempSync(join(tmpdir(), "certscore-extension-store-"));
const packageRoot = join(tempRoot, releaseName);

const validated = spawnSync(process.execPath, [join(root, "scripts/validate-extension.mjs")], { stdio: "inherit" });
if (validated.status !== 0) {
  throw new Error("Chrome Web Store validation failed.");
}
mkdirSync(packageRoot, { recursive: true });
for (const entry of ["manifest.json", "assets", "src"]) {
  cpSync(join(root, entry), join(packageRoot, entry), { recursive: true });
}
rmSync(join(packageRoot, "src/options"), { force: true, recursive: true });

mkdirSync(outputDir, { recursive: true });
rmSync(zipPath, { force: true });
const zipped = spawnSync("zip", ["-qr", zipPath, "."], { cwd: packageRoot, encoding: "utf8" });
if (zipped.status !== 0) {
  throw new Error(zipped.stderr || "Unable to create Chrome Web Store ZIP.");
}

const checksum = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
writeFileSync(checksumPath, `${checksum}  ${releaseName}.zip\n`);
rmSync(tempRoot, { force: true, recursive: true });
console.log(`Chrome Web Store package: ${zipPath}`);
console.log(`SHA-256: ${checksum}`);
