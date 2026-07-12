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
  "src/fingerprint-probe.js",
  "src/config.js",
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

for (const unusedPermission of ["activeTab"]) {
  if (manifest.permissions.includes(unusedPermission)) {
    throw new Error(`Store package must not request unused ${unusedPermission} permission.`);
  }
}

if (!manifest.permissions.includes("scripting")) {
  throw new Error("Store package requires scripting for target-site content registered after optional access is granted.");
}

if (manifest.host_permissions.some((permission) => permission === "http://*/*" || permission === "https://*/*")) {
  throw new Error("Store package must not require access to every website at installation time.");
}

if (!manifest.host_permissions.includes("https://certscore.ai/*")) {
  throw new Error("Store package requires the fixed CertScore.ai bridge origin.");
}

for (const optionalOrigin of ["http://*/*", "https://*/*"]) {
  if (!manifest.optional_host_permissions?.includes(optionalOrigin)) {
    throw new Error(`Store package must request ${optionalOrigin} only when a reviewer starts a scan.`);
  }
}

const requiredContentMatches = manifest.content_scripts.flatMap((entry) => entry.matches ?? []);
if (requiredContentMatches.some((permission) => permission === "http://*/*" || permission === "https://*/*")) {
  throw new Error("Store package must not declare an all-sites static content script.");
}

if (manifest.options_page) {
  throw new Error("Store package must not expose a custom API-host options page.");
}

const configSource = readFileSync(join(root, "src/config.js"), "utf8");
if (!configSource.includes('apiBaseUrl: "https://certscore.ai"') || /chrome\.storage\.sync\.get\(["']certscoreApiBaseUrl/.test(configSource)) {
  throw new Error("Store package must use the fixed https://certscore.ai API origin.");
}

const popupSource = readFileSync(join(root, "src/popup.html"), "utf8");
for (const disclosure of ["bounded request metadata", "Cookie values", "visible-tab screenshot", "Extension privacy details", "I understand what this reviewer-started scan collects"]) {
  if (!popupSource.includes(disclosure)) {
    throw new Error(`Popup is missing required data disclosure: ${disclosure}`);
  }
}

console.log("BX01 extension manifest is valid.");
