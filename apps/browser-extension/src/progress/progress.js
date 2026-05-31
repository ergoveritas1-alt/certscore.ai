import { config, getApiBaseUrl } from "../config.js";

const statusEl = document.querySelector("#status-label");
const statusMessageEl = document.querySelector("#status-message");
const statusMetaEl = document.querySelector("#status-meta");
const statusElapsedEl = document.querySelector("#status-elapsed");
const statusPhaseEl = document.querySelector("#status-phase");
const busyCalloutEl = document.querySelector("#busy-callout");
const errorEl = document.querySelector("#error");
const reportLink = document.querySelector("#report-link");
const signupLink = document.querySelector("#signup-link");
const resultsEl = document.querySelector("#results");
const resultRequestsEl = document.querySelector("#result-requests");
const resultCookiesEl = document.querySelector("#result-cookies");
const resultBannerEl = document.querySelector("#result-banner");

let currentApiBaseUrl = config.apiBaseUrl;
let currentStatus = null;
let elapsedTimer = null;
let autoCloseTimer = null;

function getElapsedSeconds(status) {
  if (!status?.startedAt) {
    return null;
  }
  const elapsedMs = Date.now() - Number(status.startedAt);
  return Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : null;
}

function updateElapsed() {
  const elapsed = getElapsedSeconds(currentStatus);
  if (elapsed === null) {
    statusMetaEl.hidden = true;
    return;
  }
  statusElapsedEl.textContent = `${elapsed}s elapsed`;
  statusPhaseEl.textContent = currentStatus?.phase ?? "working";
  statusMetaEl.hidden = false;
}

function renderStatus(status) {
  currentStatus = status ?? null;
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  const label = status?.label ?? "Waiting";
  const isBusy = status?.busy === true;
  statusEl.textContent = isBusy ? "Scanning is in progress..." : label;
  statusMessageEl.textContent = status?.message ?? "Start a browser pre-consent scan from the extension popup.";
  if (busyCalloutEl) {
    busyCalloutEl.hidden = !isBusy;
  }
  errorEl.textContent = status?.error ?? "";
  errorEl.hidden = !status?.error;

  const summary = status?.summary;
  if (summary) {
    resultRequestsEl.textContent = String(summary.networkRequestCount ?? 0);
    resultCookiesEl.textContent = String(summary.cookieEventCount ?? 0);
    resultBannerEl.textContent = summary.bannerObserved === true ? "Seen" : summary.bannerObserved === false ? "Not seen" : "Unknown";
    resultsEl.hidden = false;
  } else {
    resultsEl.hidden = true;
  }

  if (status?.reportUrl) {
    reportLink.href = new URL(status.reportUrl, currentApiBaseUrl).toString();
    reportLink.hidden = false;
  } else {
    reportLink.hidden = true;
  }

  signupLink.href = new URL("/login?mode=create_account", currentApiBaseUrl).toString();
  signupLink.hidden = !(status?.summary && status?.anonymous);

  updateElapsed();
  if (status?.busy && status?.startedAt) {
    elapsedTimer = setInterval(updateElapsed, 1000);
  }

  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
  if (status?.phase === "complete" && status?.reportUrl) {
    autoCloseTimer = setTimeout(() => {
      window.close();
    }, 2200);
  }
}

async function refresh() {
  currentApiBaseUrl = await getApiBaseUrl();
  const { certscoreBx01Status } = await chrome.storage.local.get("certscoreBx01Status");
  renderStatus(certscoreBx01Status);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.certscoreBx01Status) {
    renderStatus(changes.certscoreBx01Status.newValue);
  }
});

refresh().catch((error) => {
  renderStatus({ error: error instanceof Error ? error.message : String(error), label: "Error" });
});
