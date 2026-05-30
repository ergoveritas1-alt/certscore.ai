import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

const required = [
  "assets/icons/icon-16.png",
  "assets/icons/icon-32.png",
  "assets/icons/icon-48.png",
  "assets/icons/icon-128.png",
  "assets/certscore-mark.svg",
  "assets/certscore-mark-cropped.png",
  "src/background.js",
  "src/content.js",
  "src/config.js",
  "src/options/options.css",
  "src/options/options.html",
  "src/options/options.js",
  "src/progress/progress.css",
  "src/progress/progress.html",
  "src/progress/progress.js",
  "src/popup.css",
  "src/popup.html",
  "src/popup.js"
];

for (const file of required) {
  readFileSync(join(root, file), "utf8");
}

if (manifest.manifest_version !== 3) {
  throw new Error("Chrome extension manifest_version must be 3.");
}

if (!manifest.permissions.includes("webRequest") || !manifest.permissions.includes("cookies")) {
  throw new Error("BX01 requires webRequest and cookies permissions.");
}

console.log("BX01 extension manifest is valid.");
