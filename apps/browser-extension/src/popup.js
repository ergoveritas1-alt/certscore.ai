import { config, getApiBaseUrl } from "./config.js";

const urlEl = document.querySelector("#current-url");
const statusEl = document.querySelector("#status-label");
const statusMessageEl = document.querySelector("#status-message");
const statusMetaEl = document.querySelector("#status-meta");
const statusElapsedEl = document.querySelector("#status-elapsed");
const statusPhaseEl = document.querySelector("#status-phase");
const openOptionsButton = document.querySelector("#open-options");
const freshVisitInput = document.querySelector("#fresh-visit");
const runButton = document.querySelector("#run-scan");
const errorEl = document.querySelector("#error");
const reportLink = document.querySelector("#report-link");
const signupLink = document.querySelector("#signup-link");
const resultsEl = document.querySelector("#results");
const resultRequestsEl = document.querySelector("#result-requests");
const resultCookiesEl = document.querySelector("#result-cookies");
const resultBannerEl = document.querySelector("#result-banner");
const extensionApiAvailable = typeof chrome !== "undefined" && Boolean(chrome.tabs?.query && chrome.runtime?.sendMessage);
let currentApiBaseUrl = config.apiBaseUrl;
let currentStatus = null;
let elapsedTimer = null;

async function getActiveTab() {
  if (!extensionApiAvailable) {
    return {
      id: 1,
      url: "https://example.com/"
    };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getLaunchTargetFromCertScoreUrl(tabUrl) {
  if (!tabUrl || !/^https?:\/\//i.test(tabUrl)) {
    return null;
  }

  try {
    const url = new URL(tabUrl);
    const targetUrl = url.searchParams.get("bx01TargetUrl") ?? url.searchParams.get("certscoreBx01TargetUrl");
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return null;
    }

    const apiBase = new URL(currentApiBaseUrl);
    return url.hostname === apiBase.hostname ? targetUrl : null;
  } catch {
    return null;
  }
}

async function openProgressWindow() {
  if (!extensionApiAvailable || !chrome.windows?.create) {
    return;
  }

  await chrome.windows.create({
    focused: true,
    height: 520,
    type: "popup",
    url: chrome.runtime.getURL("src/progress/progress.html"),
    width: 430
  });
}

function setError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

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

function syncElapsedTimer(status) {
  currentStatus = status ?? null;
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  updateElapsed();
  if (status?.busy && status?.startedAt) {
    elapsedTimer = setInterval(updateElapsed, 1000);
  }
}

function renderStatus(status) {
  const label = status?.label ?? "Ready";
  statusEl.textContent = status?.busy ? `hourglass ${label}` : label;
  statusMessageEl.textContent = status?.message ?? "Waiting for a reviewer-started browser scan.";
  runButton.disabled = Boolean(status?.busy);
  syncElapsedTimer(status);
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

  setError(status?.error ?? "");
}

async function refresh() {
  const tab = await getActiveTab();
  currentApiBaseUrl = await getApiBaseUrl();
  const launchTargetUrl = getLaunchTargetFromCertScoreUrl(tab?.url);
  urlEl.textContent = launchTargetUrl ?? tab?.url ?? "No active tab";

  if (!extensionApiAvailable) {
    renderStatus({
      busy: false,
      label: "Preview mode"
    });
    return;
  }

  const { certscoreBx01Status } = await chrome.storage.local.get("certscoreBx01Status");
  if (certscoreBx01Status?.label === "Complete" && !certscoreBx01Status.targetUrl) {
    await chrome.storage.local.remove("certscoreBx01Status");
    renderStatus({ label: "Ready" });
    return;
  }

  if (certscoreBx01Status?.targetUrl && tab?.url && certscoreBx01Status.targetUrl !== tab.url) {
    await chrome.storage.local.remove("certscoreBx01Status");
    renderStatus({ label: "Ready" });
    return;
  }

  renderStatus(certscoreBx01Status);
}

runButton.addEventListener("click", async () => {
  const tab = await getActiveTab();
  const launchTargetUrl = getLaunchTargetFromCertScoreUrl(tab?.url);
  const targetUrl = launchTargetUrl ?? tab?.url;
  if (!tab?.id || !targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    setError("Open an http or https website before starting a scan.");
    return;
  }

  if (!extensionApiAvailable) {
    renderStatus({
      error: "Load this folder as a Chrome extension to run a real BX01 scan.",
      label: "Preview mode"
    });
    return;
  }

  await openProgressWindow();
  renderStatus({ busy: true, label: "Starting...", message: "Opening persistent progress window." });
  const response = await chrome.runtime.sendMessage({
    type: "BX01_START_SCAN",
    freshVisit: Boolean(freshVisitInput.checked),
    launchFromCertScore: Boolean(launchTargetUrl),
    scanWindowMs: config.defaultScanWindowMs,
    tabId: tab.id,
    targetUrl
  });

  if (!response?.ok) {
    renderStatus({ error: response?.error ?? "Browser scan could not start.", label: "Error" });
  }
});

openOptionsButton.addEventListener("click", () => {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
    return;
  }

  setError("Load this folder as a Chrome extension to open extension options.");
});

if (extensionApiAvailable) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "BX01_STATUS") {
      renderStatus(message.status);
    }
  });
}

refresh().catch((error) => {
  setError(error instanceof Error ? error.message : String(error));
});
