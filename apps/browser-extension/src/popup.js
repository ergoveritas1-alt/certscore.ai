import { config, getApiBaseUrl } from "./config.js";

const urlEl = document.querySelector("#current-url");
const statusEl = document.querySelector("#status-label");
const statusMessageEl = document.querySelector("#status-message");
const statusMetaEl = document.querySelector("#status-meta");
const statusElapsedEl = document.querySelector("#status-elapsed");
const statusPhaseEl = document.querySelector("#status-phase");
const scanConsentEl = document.querySelector("#scan-consent");
const acceptDataUseInput = document.querySelector("#accept-data-use");
const runButton = document.querySelector("#run-scan");
const errorEl = document.querySelector("#error");
const reportButton = document.querySelector("#report-button");
const newScanButton = document.querySelector("#new-scan-button");
const resultsEl = document.querySelector("#results");
const resultRequestsEl = document.querySelector("#result-requests");
const resultCookiesEl = document.querySelector("#result-cookies");
const resultBannerEl = document.querySelector("#result-banner");
const extensionApiAvailable = typeof chrome !== "undefined" && Boolean(chrome.tabs?.query && chrome.runtime?.sendMessage);
let currentApiBaseUrl = config.apiBaseUrl;
let currentStatus = null;
let elapsedTimer = null;
let dataUseAccepted = false;
let currentReportUrl = null;

reportButton.addEventListener("click", async () => {
  if (currentReportUrl) {
    const reportUrl = currentReportUrl;
    await chrome.storage.local.remove("certscoreBx01Status");
    renderStatus({ label: "Ready" });
    await chrome.tabs.create({ active: true, url: reportUrl });
  }
});

newScanButton.addEventListener("click", async () => {
  await chrome.storage.local.remove("certscoreBx01Status");
  renderStatus({ label: "Ready" });
});

function updateRunButton() {
  runButton.disabled = Boolean(currentStatus?.busy) || !dataUseAccepted;
}

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
  statusEl.textContent = status?.busy ? "Scanning is in progress..." : label;
  statusMessageEl.textContent = status?.message ?? "Waiting for a reviewer-started browser scan.";
  syncElapsedTimer(status);
  updateRunButton();
  const summary = status?.summary;
  runButton.hidden = status?.label === "Complete";
  newScanButton.hidden = status?.label !== "Complete";

  if (summary) {
    resultRequestsEl.textContent = String(summary.networkRequestCount ?? 0);
    resultCookiesEl.textContent = String(summary.cookieEventCount ?? 0);
    resultBannerEl.textContent = summary.bannerObserved === true ? "Seen" : summary.bannerObserved === false ? "Not seen" : "Unknown";
    resultsEl.hidden = false;
  } else {
    resultsEl.hidden = true;
  }

  if (status?.reportUrl) {
    currentReportUrl = new URL(status.reportUrl, currentApiBaseUrl).toString();
    reportButton.hidden = false;
  } else {
    currentReportUrl = null;
    reportButton.hidden = true;
  }

  setError(status?.error ?? "");
}

async function refresh() {
  const tab = await getActiveTab();
  currentApiBaseUrl = await getApiBaseUrl();
  if (extensionApiAvailable) {
    const stored = await chrome.storage.local.get("certscoreBrowserAssistedDisclosureAcceptedAt");
    dataUseAccepted = typeof stored.certscoreBrowserAssistedDisclosureAcceptedAt === "string";
    acceptDataUseInput.checked = dataUseAccepted;
    scanConsentEl.hidden = dataUseAccepted;
    updateRunButton();
  }
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

  if (
    certscoreBx01Status?.targetUrl &&
    tab?.url &&
    certscoreBx01Status.targetUrl !== tab.url &&
    !certscoreBx01Status.reportUrl &&
    certscoreBx01Status.busy !== true
  ) {
    await chrome.storage.local.remove("certscoreBx01Status");
    renderStatus({ label: "Ready" });
    return;
  }

  renderStatus(certscoreBx01Status);
}

function permissionPatternForUrl(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}/*`;
}

async function ensureTargetPermission(targetUrl) {
  const origins = ["http://*/*", "https://*/*"];
  if (await chrome.permissions.contains({ origins })) {
    return true;
  }
  return chrome.permissions.request({ origins });
}

acceptDataUseInput.addEventListener("change", async () => {
  dataUseAccepted = acceptDataUseInput.checked;
  if (dataUseAccepted) {
    await chrome.storage.local.set({ certscoreBrowserAssistedDisclosureAcceptedAt: new Date().toISOString() });
    scanConsentEl.hidden = true;
  }
  updateRunButton();
});

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
      error: "Install the CertScore.ai Chrome extension to run a browser scan.",
      label: "Preview mode"
    });
    return;
  }

  if (!dataUseAccepted) {
    setError("Review and accept the scan data disclosure before starting.");
    return;
  }

  const permissionGranted = await ensureTargetPermission(targetUrl).catch(() => false);
  if (!permissionGranted) {
    setError("Allow CertScore.ai to access this site so the reviewer-started scan can run.");
    return;
  }

  renderStatus({
    busy: true,
    label: "Starting...",
    message: "Keep the CertScore.ai and target-site tabs open while browser evidence is captured."
  });
  const response = await chrome.runtime.sendMessage({
    type: "BX01_START_SCAN",
    freshVisit: true,
    launchFromCertScore: Boolean(launchTargetUrl),
    scanWindowMs: config.defaultScanWindowMs,
    tabId: tab.id,
    targetUrl
  });

  if (!response?.ok) {
    renderStatus({ error: response?.error ?? "Browser scan could not start.", label: "Error" });
  }
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
