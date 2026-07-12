import { config, getApiBaseUrl } from "./config.js";

const activeScans = new Map();
let progressWindowId = null;

function nowMs(scan) {
  return Math.max(0, Math.round(performance.now() - scan.startedAt));
}

function setStatus(status) {
  chrome.storage.local.set({ certscoreBx01Status: status });
  chrome.runtime.sendMessage({ status, type: "BX01_STATUS" }).catch(() => {});
}

function sendStatusToLauncher(scanOrLauncherTabId, status) {
  const launcherTabId =
    typeof scanOrLauncherTabId === "number"
      ? scanOrLauncherTabId
      : typeof scanOrLauncherTabId?.launcherTabId === "number"
        ? scanOrLauncherTabId.launcherTabId
        : null;

  if (typeof launcherTabId !== "number") {
    return;
  }

  chrome.tabs.sendMessage(launcherTabId, { status, type: "BX01_STATUS" }).catch(() => {});
}

function setScanStatus(scan, updates) {
  const status = {
    browserScanId: scan.browserScanId,
    busy: true,
    label: updates.label,
    message: updates.message,
    phase: updates.phase,
    startedAt: scan.startedAtEpochMs,
    targetUrl: scan.targetUrl
  };
  setStatus(status);
  sendStatusToLauncher(scan, status);
}

function setBadge(status) {
  if (!chrome.action?.setBadgeText) {
    return;
  }

  const text = status === "observing" ? "..." : status === "complete" ? "OK" : status === "error" ? "!" : "";
  const color = status === "complete" ? "#126c5b" : status === "error" ? "#be123c" : "#0b2e4f";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

async function openProgressWindow() {
  if (!chrome.windows?.create || !chrome.runtime?.getURL) {
    return;
  }

  if (typeof progressWindowId === "number") {
    try {
      await chrome.windows.update(progressWindowId, { focused: true });
      return;
    } catch {
      progressWindowId = null;
    }
  }

  const window = await chrome.windows.create({
    focused: true,
    height: 520,
    type: "popup",
    url: chrome.runtime.getURL("src/progress/progress.html"),
    width: 430
  });
  progressWindowId = typeof window?.id === "number" ? window.id : null;
}

if (chrome.windows?.onRemoved) {
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === progressWindowId) {
      progressWindowId = null;
    }
  });
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function originFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function permissionPatternForUrl(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}/*`;
}

async function registerTargetContentScripts(targetUrl) {
  const matches = ["http://*/*", "https://*/*"];
  const hasAccess = await chrome.permissions.contains({ origins: matches });
  if (!hasAccess) {
    throw new Error("Open the CertScore.ai extension and allow access to this site before starting the scan.");
  }

  const ids = ["certscore-target-observer", "certscore-target-fingerprint-probe"];
  await chrome.scripting.unregisterContentScripts({ ids }).catch(() => {});
  await chrome.scripting.registerContentScripts([
    {
      id: ids[0],
      js: ["src/content.js"],
      matches,
      persistAcrossSessions: false,
      runAt: "document_start"
    },
    {
      id: ids[1],
      js: ["src/fingerprint-probe.js"],
      matches,
      persistAcrossSessions: false,
      runAt: "document_start",
      world: "MAIN"
    }
  ]);
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(value);
    };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish(true);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish(true);
    }).catch(() => finish(false));
  });
}

function selectPolicyLinks(links) {
  const selected = new Map();
  const ranked = [...(Array.isArray(links) ? links : [])].sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  for (const link of ranked) {
    if (!link?.type || !link?.url || selected.has(link.type)) continue;
    selected.set(link.type, link);
    if (selected.size >= 4) break;
  }
  return [...selected.values()];
}

async function collectPolicyPageEvidence(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const mainText = (document.querySelector("main")?.innerText || "").replace(/\s+/g, " ").trim();
      const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
      const formActions = Array.from(document.querySelectorAll("form"))
        .map((form) => form.action || window.location.href)
        .filter(Boolean)
        .slice(0, 50);
      return {
        bodyText: (bodyText.length > mainText.length ? bodyText : mainText).slice(0, 12000),
        finalUrl: window.location.href.slice(0, 4096),
        formActions,
        iframeUrls: Array.from(document.querySelectorAll("iframe[src]"))
          .map((frame) => frame.src)
          .filter((url) => /^https?:/i.test(url))
          .slice(0, 50),
        insecureFormActionCount: formActions.filter((url) => /^http:/i.test(url)).length,
        language: (document.documentElement.lang || "").slice(0, 40),
        mixedContentCount: window.location.protocol === "https:"
          ? document.querySelectorAll('[src^="http:"], [href^="http:"]').length
          : 0,
        policyLinks: Array.from(document.querySelectorAll("a[href]"))
          .map((anchor) => ({
            label: (anchor.innerText || anchor.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 160),
            url: anchor.href
          }))
          .filter((link) => /^https?:/i.test(link.url) && /privacy policy|privacy notice|cookie policy|terms of use|accessibility/i.test(`${link.label} ${link.url}`))
          .slice(0, 20),
        title: document.title.slice(0, 300),
        transportSecure: window.location.protocol === "https:"
      };
    }
  }).catch(() => []);
  return results[0]?.result ?? null;
}

async function waitForPolicyPageEvidence(tabId, minimumTextLength = 2500) {
  let evidence = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    evidence = await collectPolicyPageEvidence(tabId) ?? evidence;
    if ((evidence?.bodyText?.length ?? 0) >= minimumTextLength) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return evidence;
}

async function collectTransportProbeEvidence(targetUrl) {
  const target = new URL(targetUrl);
  const httpsUrl = new URL(target.href);
  httpsUrl.protocol = "https:";
  const httpUrl = new URL(target.href);
  httpUrl.protocol = "http:";

  let validTlsCertificate = null;
  try {
    await fetch(httpsUrl.href, { cache: "no-store", credentials: "omit", method: "HEAD", redirect: "follow" });
    validTlsCertificate = true;
  } catch {
    try {
      await fetch(httpsUrl.href, { cache: "no-store", credentials: "omit", method: "GET", redirect: "follow" });
      validTlsCertificate = true;
    } catch {
      validTlsCertificate = false;
    }
  }

  let httpProbeFinalUrl = null;
  let httpRedirectsToHttps = null;
  try {
    const response = await fetch(httpUrl.href, { cache: "no-store", credentials: "omit", method: "HEAD", redirect: "follow" });
    httpProbeFinalUrl = response.url || null;
    httpRedirectsToHttps = /^https:/i.test(response.url);
  } catch {
    httpRedirectsToHttps = false;
  }

  return {
    httpProbeAttempted: true,
    httpProbeFinalUrl,
    httpRedirectsToHttps,
    tlsProbeAttempted: true,
    validTlsCertificate
  };
}

async function captureBrowserPageEvidence(scan) {
  setScanStatus(scan, {
    label: "Reviewing surfaces",
    message: "Reviewing rendered privacy, cookie, terms, accessibility, transport, form, and embedded-service surfaces without interacting with consent controls.",
    phase: "surface_review"
  });

  const homepage = await chrome.tabs.sendMessage(scan.tabId, {
    includeText: false,
    type: "BX01_COLLECT_PAGE_EVIDENCE"
  }).catch(() => null);
  if (!homepage) return { policySurfaceCount: 0 };

  const transportProbeEvidence = await collectTransportProbeEvidence(scan.targetUrl);
  await uploadArtifact(scan, {
    artifactJson: { ...homepage, ...transportProbeEvidence, capturedAtMs: nowMs(scan), pageType: "homepage", sourceId: "BX01", sourceType: "browser_extension" },
    artifactType: "page_evidence",
    contentType: "application/json"
  });

  let policySurfaceCount = 0;
  for (const link of selectPolicyLinks(homepage.policyLinks)) {
    const tab = await chrome.tabs.create({ active: false, url: link.url }).catch(() => null);
    if (!tab?.id) continue;
    try {
      const loaded = await waitForTabComplete(tab.id);
      if (!loaded) continue;
      const evidence = await waitForPolicyPageEvidence(tab.id);
      let resolvedEvidence = evidence;
      if (link.type === "privacy_policy" && (resolvedEvidence?.bodyText?.length ?? 0) < 2500) {
        const nestedPrivacy = resolvedEvidence?.policyLinks?.find((candidate) =>
          candidate.url !== resolvedEvidence.finalUrl && /privacy policy|privacy notice/i.test(`${candidate.label} ${candidate.url}`)
        );
        if (nestedPrivacy?.url) {
          await chrome.tabs.update(tab.id, { url: nestedPrivacy.url });
          if (await waitForTabComplete(tab.id)) {
            resolvedEvidence = await waitForPolicyPageEvidence(tab.id) ?? resolvedEvidence;
          }
        }
      }
      if (!resolvedEvidence?.finalUrl || !resolvedEvidence.bodyText) continue;
      await uploadArtifact(scan, {
        artifactJson: {
          ...resolvedEvidence,
          capturedAtMs: nowMs(scan),
          discoveredFromUrl: scan.targetUrl,
          linkLabel: link.label,
          pageType: link.type,
          requestedUrl: link.url,
          sourceId: "BX01",
          sourceType: "browser_extension"
        },
        artifactType: "policy_surface",
        contentType: "application/json"
      });
      policySurfaceCount += 1;
    } finally {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
  return { policySurfaceCount };
}

async function clearSiteDataForFreshVisit(targetUrl) {
  const origin = originFromUrl(targetUrl);
  if (!origin) {
    return false;
  }

  await chrome.browsingData.remove(
    {
      origins: [origin]
    },
    {
      cacheStorage: true,
      cookies: true,
      fileSystems: true,
      indexedDB: true,
      localStorage: true,
      serviceWorkers: true,
      webSQL: true
    }
  );

  return true;
}

function eventHeaders(headers = [], name) {
  const match = headers.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return match?.value;
}

function trimOptionalString(value, maxLength) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function eventHeaderValues(headers = [], name) {
  return headers.filter((header) => header.name?.toLowerCase() === name.toLowerCase()).map((header) => header.value ?? "");
}

function summarizeResponseHeaders(headers = []) {
  const allowed = new Set([
    "cache-control",
    "content-security-policy",
    "content-type",
    "location",
    "permissions-policy",
    "referrer-policy",
    "set-cookie",
    "strict-transport-security",
    "x-content-type-options"
  ]);

  return [
    ...new Set(
      headers
        .map((header) => header.name?.toLowerCase())
        .filter((name) => name && allowed.has(name))
    )
  ].slice(0, 40);
}

function cookieDomainMatches(cookieDomain, hostname) {
  const normalized = cookieDomain.replace(/^\./, "").toLowerCase();
  return hostname === normalized || hostname.endsWith(`.${normalized}`);
}

async function baselineCookies(targetUrl) {
  const cookies = await chrome.cookies.getAll({ url: targetUrl });
  return new Map(
    cookies.map((cookie) => [
      `${cookie.name}|${cookie.domain}|${cookie.path}`,
      {
        domain: cookie.domain,
        expiration: cookie.expirationDate ?? null,
        httpOnly: cookie.httpOnly,
        name: cookie.name,
        path: cookie.path,
        sameSite: cookie.sameSite,
        secure: cookie.secure
      }
    ])
  );
}

function serializeCookie(cookie, observedAtMs, eventType, source, timingPrecision) {
  return {
    cookieName: cookie.name,
    domain: cookie.domain,
    eventType,
    expiration: cookie.expirationDate ?? cookie.expiration ?? null,
    httpOnly: Boolean(cookie.httpOnly),
    observedAtMs,
    path: cookie.path ?? "/",
    sameSite: cookie.sameSite ?? "unspecified",
    secure: Boolean(cookie.secure),
    source,
    timingPrecision,
    valueCaptured: false
  };
}

function parseSetCookieHeader(headerValue, requestUrl, observedAtMs) {
  const [nameValue, ...attributes] = headerValue.split(";").map((part) => part.trim()).filter(Boolean);
  const separatorIndex = nameValue.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  const url = new URL(requestUrl);
  const cookie = {
    domain: url.hostname,
    eventType: "cookie_observed",
    expiration: null,
    httpOnly: false,
    observedAtMs,
    path: "/",
    sameSite: "unspecified",
    secure: false,
    source: "Set-Cookie header",
    timingPrecision: "exact_event",
    valueCaptured: false,
    cookieName: nameValue.slice(0, separatorIndex).trim().slice(0, 255)
  };

  for (const attribute of attributes) {
    const [rawKey, ...rawValueParts] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const value = rawValueParts.join("=").trim();

    if (key === "domain" && value) {
      cookie.domain = value.slice(0, 255);
    } else if (key === "path" && value) {
      cookie.path = value.slice(0, 1024);
    } else if (key === "samesite" && value) {
      cookie.sameSite = value.slice(0, 32);
    } else if (key === "secure") {
      cookie.secure = true;
    } else if (key === "httponly") {
      cookie.httpOnly = true;
    } else if (key === "max-age" && value) {
      const maxAge = Number(value);
      cookie.expiration = Number.isFinite(maxAge) ? Math.round(Date.now() / 1000 + maxAge) : null;
    } else if (key === "expires" && value) {
      const expiresAt = Date.parse(value);
      cookie.expiration = Number.isFinite(expiresAt) ? Math.round(expiresAt / 1000) : null;
    }
  }

  return cookie.cookieName ? cookie : null;
}

async function uploadEvents(scan, events) {
  if (events.length === 0) {
    return;
  }

  for (let index = 0; index < events.length; index += config.maxEventsPerUpload) {
    const batch = events.slice(index, index + config.maxEventsPerUpload);
    const response = await fetch(`${scan.apiBaseUrl}/api/browser-scans/${scan.browserScanId}/events`, {
      body: JSON.stringify({ events: batch }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-certscore-browser-scan-token": scan.uploadToken
      },
      method: "POST"
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = body?.path ? `${body.error ?? "Invalid event"} at ${body.path}` : body?.error;
      throw new Error(`Event upload failed with ${response.status}${detail ? `: ${detail}` : ""}.`);
    }
  }
}

async function uploadArtifact(scan, artifact) {
  const response = await fetch(`${scan.apiBaseUrl}/api/browser-scans/${scan.browserScanId}/artifact`, {
    body: JSON.stringify(artifact),
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-certscore-browser-scan-token": scan.uploadToken
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Artifact upload failed with ${response.status}.`);
  }
}

async function uploadScreenshotArtifact(scan) {
  if (!chrome.tabs?.get || !chrome.tabs?.captureVisibleTab) {
    return;
  }

  const tab = await chrome.tabs.get(scan.tabId).catch(() => null);
  if (!tab?.windowId) {
    return;
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }).catch(() => null);
  if (!dataUrl) {
    return;
  }
  if (dataUrl.length > config.maxScreenshotDataUrlBytes) {
    scan.events.push({
      eventType: "browser_capture_note",
      message: "Visible-tab screenshot skipped because it exceeded the browser-evidence upload size limit.",
      observedAtMs: nowMs(scan),
      sourceId: "BX01",
      sourceType: "browser_extension"
    });
    return;
  }

  await uploadArtifact(scan, {
    artifactJson: {
      capturedAtMs: nowMs(scan),
      dataUrl,
      description: "Reviewer-visible tab screenshot captured near the end of the browser scan window.",
      sourceId: "BX01",
      sourceType: "browser_extension",
      targetUrl: scan.targetUrl
    },
    artifactType: "screenshot",
    contentType: "image/png"
  });
}

async function completeScan(scan) {
  setScanStatus(scan, {
    label: "Normalizing",
    message: "Comparing the starting cookie jar with the post-reload browser state.",
    phase: "normalizing"
  });

  const endingCookies = await baselineCookies(scan.targetUrl);
  for (const [key, cookie] of endingCookies.entries()) {
    if (!scan.baselineCookies.has(key)) {
      scan.events.push(serializeCookie(cookie, nowMs(scan), "cookie_observed", "baseline_diff", "scan_window_diff"));
    }
  }

  const consent = await chrome.tabs.sendMessage(scan.tabId, { type: "BX01_SUMMARIZE_CONSENT_UI" }).catch(() => null);
  if (consent?.summary) {
    scan.events.push({
      ...consent.summary,
      eventType: "consent_ui_observed",
      observedAtMs: nowMs(scan)
    });

    await uploadArtifact(scan, {
      artifactJson: {
        consentInteractionObserved: Boolean(consent.consentInteractionObserved || scan.consentInteractionObserved),
        ...consent.summary
      },
      artifactType: "banner_dom_summary",
      contentType: "application/json"
    });
  }

  await uploadScreenshotArtifact(scan);
  const pageEvidenceSummary = await captureBrowserPageEvidence(scan);

  setScanStatus(scan, {
    label: "Reporting",
    message: `Packaging ${scan.events.length} browser-observed events for CertScore.ai intake.`,
    phase: "reporting"
  });

  await uploadEvents(scan, scan.events);

  const durationMs = nowMs(scan);
  const networkRequestCount = scan.events.filter((event) => event.eventType === "network_request").length;
  const cookieEventCount = scan.events.filter((event) => event.eventType?.startsWith("cookie_")).length;
  const bannerObserved = scan.events.some((event) => event.eventType === "consent_ui_observed" && event.bannerObserved);

  const response = await fetch(`${scan.apiBaseUrl}/api/browser-scans/${scan.browserScanId}/complete`, {
    body: JSON.stringify({
      durationMs,
      summary: {
        bannerObserved,
        cookieEventCount,
        networkRequestCount,
        policySurfaceCount: pageEvidenceSummary.policySurfaceCount,
        sourceId: "BX01",
        sourceType: "browser_extension"
      }
    }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-certscore-browser-scan-token": scan.uploadToken
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Completion failed with ${response.status}.`);
  }

  const body = await response.json();
  const summary = {
    bannerObserved,
    cookieEventCount,
    networkRequestCount,
    policySurfaceCount: pageEvidenceSummary.policySurfaceCount
  };
  cleanupScan(scan.tabId);
  const completeStatus = {
    anonymous: scan.anonymous,
    browserScanId: scan.browserScanId,
    busy: false,
    label: "Complete",
    message: `Captured ${networkRequestCount} requests, ${cookieEventCount} cookie events, ${pageEvidenceSummary.policySurfaceCount} linked legal surfaces, and ${bannerObserved ? "a visible consent banner" : "no visible consent banner"}.`,
    phase: "complete",
    reportUrl: body.reportUrl,
    summary,
    targetUrl: scan.targetUrl
  };
  setStatus(completeStatus);
  sendStatusToLauncher(scan, completeStatus);
  setBadge("complete");
}

function cleanupScan(tabId) {
  activeScans.delete(tabId);
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const scan = activeScans.get(details.tabId);
    if (!scan) {
      return;
    }

    const hostname = hostnameFromUrl(details.url);
    scan.events.push({
      consentInteractionObserved: scan.consentInteractionObserved,
      eventType: "network_request",
      hostname,
      initiator: trimOptionalString(details.initiator, 8192),
      method: trimOptionalString(details.method, 16),
      observedAtMs: nowMs(scan),
      resourceType: details.type,
      tabId: details.tabId,
      url: details.url
    });
  },
  { urls: ["http://*/*", "https://*/*"] }
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const scan = activeScans.get(details.tabId);
    if (!scan) {
      return;
    }

    const last = scan.events[scan.events.length - 1];
    if (last?.eventType === "network_request" && last.url === details.url) {
      last.referrer = trimOptionalString(eventHeaders(details.requestHeaders, "referer"), 8192);
    }
  },
  { urls: ["http://*/*", "https://*/*"] },
  ["requestHeaders"]
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const scan = activeScans.get(details.tabId);
    if (!scan) {
      return;
    }

    const setCookieHeaders = eventHeaderValues(details.responseHeaders, "set-cookie");
    const matchingNetworkEvents = scan.events.filter((event) => event.eventType === "network_request" && event.url === details.url);
    const networkEvent = matchingNetworkEvents[matchingNetworkEvents.length - 1];
    if (networkEvent) {
      networkEvent.statusCode = details.statusCode;
      networkEvent.responseHeadersObserved = summarizeResponseHeaders(details.responseHeaders);
    }

    for (const header of setCookieHeaders) {
      const cookie = parseSetCookieHeader(header, details.url, nowMs(scan));
      if (cookie) {
        scan.events.push(cookie);
      }
    }
  },
  { urls: ["http://*/*", "https://*/*"] },
  ["responseHeaders"]
);

chrome.cookies.onChanged.addListener((changeInfo) => {
  for (const scan of activeScans.values()) {
    if (changeInfo.removed || !cookieDomainMatches(changeInfo.cookie.domain, scan.targetHostname)) {
      continue;
    }

    scan.events.push(
      serializeCookie(
        changeInfo.cookie,
        nowMs(scan),
        changeInfo.cause === "overwrite" ? "cookie_changed" : "cookie_added",
        "chrome.cookies.onChanged",
        "exact_event"
      )
    );
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "BX01_CONSENT_INTERACTION") {
    for (const scan of activeScans.values()) {
      scan.consentInteractionObserved = true;
    }
    return false;
  }

  if (message?.type === "BX01_FINGERPRINT_API_OBSERVED") {
    const scan = typeof sender.tab?.id === "number" ? activeScans.get(sender.tab.id) : null;
    const category = typeof message.category === "string" ? message.category : "";
    if (
      scan &&
      ["audio", "canvas_webgl", "fonts_plugins", "hardware", "screen_viewport", "storage", "timezone_locale"].includes(category)
    ) {
      scan.events.push({
        api: trimOptionalString(message.api, 160) || "unknown",
        category,
        eventType: "fingerprint_api_observed",
        observedAtMs: nowMs(scan),
        sampleCount: Number.isFinite(message.sampleCount) ? Math.max(1, Math.min(1000, Math.round(message.sampleCount))) : 1,
        scriptUrl: trimOptionalString(message.scriptUrl, 512)
      });
    }
    return false;
  }

  if (message?.type !== "BX01_START_SCAN") {
    return false;
  }

  startScan({
    ...message,
    launcherTabId: message.returnToLauncherOnComplete === true ? sender.tab?.id : null
  })
    .then((result) => sendResponse(result))
    .catch((error) => {
      setStatus({ busy: false, error: error instanceof Error ? error.message : String(error), label: "Error" });
      sendResponse({ error: error instanceof Error ? error.message : String(error), ok: false });
    });

  return true;
});

async function startScan(message) {
  await openProgressWindow();
  setBadge("observing");
  const apiBaseUrl = await getApiBaseUrl();
  const targetUrl = message.targetUrl;
  await registerTargetContentScripts(targetUrl);
  const startedAtEpochMs = Date.now();
  const launcherTabId = typeof message.launcherTabId === "number" ? message.launcherTabId : null;

  const queueingStatus = {
    busy: true,
    label: "Queueing",
    message: message.freshVisit
      ? "Scanning is in progress. CertScore.ai is preparing a fresh visit and clearing this site's local browser state."
      : "Scanning is in progress. CertScore.ai is opening a browser evidence session.",
    phase: "queueing",
    startedAt: startedAtEpochMs,
    targetUrl
  };
  setStatus(queueingStatus);
  sendStatusToLauncher(launcherTabId, queueingStatus);

  await fetch(`${apiBaseUrl}/api/browser-scans/metadata`, {
    credentials: "include",
    headers: { accept: "application/json" },
    method: "GET"
  }).catch(() => null);

  const startResponse = await fetch(`${apiBaseUrl}/api/browser-scans/start`, {
    body: JSON.stringify({
      scanWindowMs: message.scanWindowMs ?? config.defaultScanWindowMs,
      targetUrl
    }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST"
  });

  if (!startResponse.ok) {
    if (startResponse.status === 401) {
      throw new Error("Sign in to CertScore.ai before running a browser scan.");
    }
    if (startResponse.status === 404) {
      throw new Error("The CertScore.ai browser-scan service is not available right now.");
    }
    throw new Error(`Start failed with ${startResponse.status}.`);
  }

  const session = await startResponse.json();
  if (message.freshVisit) {
    const fresheningStatus = {
      browserScanId: session.browserScanId,
      busy: true,
      label: "Freshening",
      message: "Scanning is in progress. Clearing cookies, cache storage, local storage, IndexedDB, and service workers for this origin only.",
      phase: "freshening",
      startedAt: startedAtEpochMs,
      targetUrl
    };
    setStatus(fresheningStatus);
    sendStatusToLauncher(launcherTabId, fresheningStatus);
    await clearSiteDataForFreshVisit(targetUrl);
  }

  let tabId = message.tabId;
  if (message.launchFromCertScore) {
    const createdTab = await chrome.tabs.create({ active: true, url: session.targetUrl || targetUrl });
    if (!createdTab.id) {
      throw new Error("Could not open the target website tab for this scan.");
    }
    tabId = createdTab.id;
  }

  const scanWindowMs = session.scanWindowMs ?? config.defaultScanWindowMs;
  const baseline = await baselineCookies(targetUrl);
  const scan = {
    anonymous: Boolean(session.anonymous),
    baselineCookies: baseline,
    apiBaseUrl,
    browserScanId: session.browserScanId,
    consentInteractionObserved: false,
    events: [],
    launcherTabId,
    startedAt: performance.now(),
    startedAtEpochMs,
    tabId,
    targetHostname: hostnameFromUrl(session.targetUrl || targetUrl),
    targetUrl: session.targetUrl || targetUrl,
    uploadToken: session.uploadToken
  };

  activeScans.set(tabId, scan);
  setScanStatus(scan, {
    label: "Reloading",
    message: "Scanning is in progress. Reloading the page without clicking the consent banner so pre-consent activity is visible.",
    phase: "reloading"
  });
  await chrome.tabs.reload(tabId, { bypassCache: true });

  setScanStatus(scan, {
    label: "Scanning",
    message: `Scanning is in progress. Keep the CertScore.ai and target-site tabs open while browser evidence is observed for ${Math.round(scanWindowMs / 1000)} seconds.`,
    phase: "scanning"
  });
  setTimeout(() => {
    completeScan(scan).catch((error) => {
      cleanupScan(scan.tabId);
      setStatus({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
        label: "Error",
        message: "The scan stopped before CertScore.ai could finish packaging the evidence.",
        phase: "error",
        targetUrl: scan.targetUrl
      });
      setBadge("error");
    });
  }, scanWindowMs);

  return { browserScanId: session.browserScanId, ok: true, reportUrl: session.reportUrl };
}
