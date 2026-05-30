import { config } from "../config.js";

const input = document.querySelector("#api-base-url");
const saveButton = document.querySelector("#save");
const localButton = document.querySelector("#use-local");
const productionButton = document.querySelector("#use-production");
const statusEl = document.querySelector("#status");

function normalizeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Use an http or https URL.");
  }
  return url.origin;
}

async function save(value) {
  const normalized = normalizeUrl(value);
  await chrome.storage.sync.set({ certscoreApiBaseUrl: normalized });
  input.value = normalized;
  statusEl.textContent = "Saved.";
}

saveButton.addEventListener("click", () => {
  save(input.value).catch((error) => {
    statusEl.textContent = error instanceof Error ? error.message : String(error);
  });
});

localButton.addEventListener("click", () => {
  save("http://localhost:3000").catch((error) => {
    statusEl.textContent = error instanceof Error ? error.message : String(error);
  });
});

productionButton.addEventListener("click", () => {
  save(config.apiBaseUrl).catch((error) => {
    statusEl.textContent = error instanceof Error ? error.message : String(error);
  });
});

chrome.storage.sync.get("certscoreApiBaseUrl").then((stored) => {
  input.value = typeof stored.certscoreApiBaseUrl === "string" ? stored.certscoreApiBaseUrl : config.apiBaseUrl;
});
