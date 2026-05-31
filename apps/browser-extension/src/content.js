const BUTTON_PATTERNS = {
  acceptObserved: /\b(accept|agree|allow all|ok)\b/i,
  closeObserved: /\b(close|dismiss|continue without accepting|maybe later|not now|×|x)\b/i,
  doNotSellShareObserved: /\b(do not sell|do not share|do not sell or share)\b/i,
  manageObserved: /\b(manage|preferences|settings|choices|customize)\b/i,
  rejectObserved: /\b(reject|decline|deny|necessary only)\b/i
};

const BANNER_PATTERN = /\b(cookie|cookies|consent|privacy preferences|do not sell|tracking technologies)\b/i;

function visibleText(element) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return "";
  }

  const rect = element.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 12) {
    return "";
  }

  return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
}

function summarizeConsentUi() {
  const candidates = Array.from(
    document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [aria-label*="cookie" i], [aria-label*="consent" i], dialog, aside, [role="dialog"], [role="alertdialog"], footer')
  );

  const snippets = [];
  const buttons = [];
  let selectorSummary = "";
  let largestCandidate = null;

  for (const element of candidates.slice(0, 80)) {
    const text = visibleText(element);
    if (!text || !BANNER_PATTERN.test(text)) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (!largestCandidate || rect.width * rect.height > largestCandidate.area) {
      largestCandidate = {
        area: rect.width * rect.height,
        height: rect.height,
        position: window.getComputedStyle(element).position,
        width: rect.width
      };
    }

    if (!selectorSummary) {
      selectorSummary = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`;
    }

    snippets.push(text.slice(0, 240));
    const controls = Array.from(element.querySelectorAll("button, a, input, [role='button']")).slice(0, 20);
    for (const control of controls) {
      const label = visibleText(control) || control.getAttribute("aria-label") || control.getAttribute("value") || "";
      if (label.trim()) {
        buttons.push(label.trim().slice(0, 120));
      }
    }

    if (snippets.length >= 8) {
      break;
    }
  }

  const joinedButtons = buttons.join(" | ");
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const coverage = largestCandidate ? largestCandidate.area / viewportArea : 0;
  const fixedLike = largestCandidate ? /fixed|sticky/i.test(largestCandidate.position) : false;
  return {
    acceptObserved: BUTTON_PATTERNS.acceptObserved.test(joinedButtons),
    bannerObserved: snippets.length > 0,
    buttonsObserved: Array.from(new Set(buttons)).slice(0, 20),
    closeObserved: BUTTON_PATTERNS.closeObserved.test(joinedButtons),
    contentObstructed: snippets.length > 0 && coverage >= 0.25,
    cookieWallDetected: snippets.length > 0 && coverage >= 0.45,
    doNotSellShareObserved: BUTTON_PATTERNS.doNotSellShareObserved.test(joinedButtons),
    firstLayerButtonCount: buttons.length,
    manageObserved: BUTTON_PATTERNS.manageObserved.test(joinedButtons),
    matchedTextSnippets: snippets,
    pageInteractionBlocked: snippets.length > 0 && fixedLike && coverage >= 0.35,
    rejectObserved: BUTTON_PATTERNS.rejectObserved.test(joinedButtons),
    selectorSummary
  };
}

let consentInteractionObserved = false;

function getRuntime() {
  try {
    const runtime = globalThis.chrome?.runtime;
    return runtime?.id ? runtime : null;
  } catch {
    return null;
  }
}

function sendRuntimeMessage(message) {
  const runtime = getRuntime();
  if (!runtime) {
    return Promise.resolve(null);
  }

  try {
    return Promise.resolve(runtime.sendMessage(message)).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

document.addEventListener(
  "click",
  (event) => {
    const target = event.target instanceof Element ? event.target.closest("button, a, input, [role='button']") : null;
    const label = target ? visibleText(target) || target.getAttribute("aria-label") || target.getAttribute("value") || "" : "";
    if (label && /(accept|agree|reject|decline|manage|preferences|settings|choices|do not sell|do not share)/i.test(label)) {
      consentInteractionObserved = true;
      void sendRuntimeMessage({
        label: label.slice(0, 120),
        type: "BX01_CONSENT_INTERACTION"
      });
    }
  },
  true
);

const runtime = getRuntime();
if (runtime) {
  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "BX01_SUMMARIZE_CONSENT_UI") {
      sendResponse({
        consentInteractionObserved,
        summary: summarizeConsentUi()
      });
    }
  });
}

async function handleWindowMessage(event) {
  if (event.source !== window || !event.data || typeof event.data !== "object") {
    return;
  }

  if (event.data.source === "certscore-bx01-fingerprint-probe" && event.data.type === "CERTSCORE_BX01_FINGERPRINT_API") {
    void sendRuntimeMessage({
      api: String(event.data.api || "").slice(0, 160),
      category: String(event.data.category || "").slice(0, 80),
      sampleCount: Number.isFinite(event.data.sampleCount) ? event.data.sampleCount : 1,
      scriptUrl: typeof event.data.scriptUrl === "string" ? event.data.scriptUrl.slice(0, 512) : null,
      type: "BX01_FINGERPRINT_API_OBSERVED"
    });
    return;
  }

  if (event.data.type === "CERTSCORE_BX01_PING") {
    if (!getRuntime()) {
      return;
    }

    window.postMessage(
      {
        requestId: event.data.requestId,
        source: "certscore-bx01-extension",
        type: "CERTSCORE_BX01_READY"
      },
      window.location.origin
    );
    return;
  }

  if (event.data.type !== "CERTSCORE_BX01_START_SCAN") {
    return;
  }

  if (!getRuntime()) {
    return;
  }

  const response = await sendRuntimeMessage({
    freshVisit: event.data.freshVisit !== false,
    launchFromCertScore: true,
    returnToLauncherOnComplete: event.data.returnToLauncherOnComplete === true,
    scanWindowMs: event.data.scanWindowMs,
    targetUrl: event.data.targetUrl,
    type: "BX01_START_SCAN"
  });

  if (!response) {
    return;
  }

  window.postMessage(
    {
      requestId: event.data.requestId,
      response,
      source: "certscore-bx01-extension",
      type: "CERTSCORE_BX01_START_RESPONSE"
    },
    window.location.origin
  );
}

window.addEventListener("message", (event) => {
  void handleWindowMessage(event).catch(() => {});
});
