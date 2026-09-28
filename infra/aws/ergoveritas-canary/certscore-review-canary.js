(function runCertScoreReviewCanary() {
  "use strict";

  const config = window.__CERTSCORE_REVIEW_CANARY__;
  if (!config || !Array.isArray(config.cookies) || !Array.isArray(config.trackers)) return;

  const cookieValue = `certscore-${config.id}`;
  for (const name of config.cookies) {
    document.cookie = `${name}=${cookieValue}; Max-Age=900; Path=/; SameSite=Lax; Secure`;
  }

  localStorage.setItem(`certscore_${config.id}_analytics`, cookieValue);
  sessionStorage.setItem(`certscore_${config.id}_session_replay`, "synthetic");

  let tcfState = null;
  if (config.postRefusal === "reject_ignored") {
    const granted = {};
    for (let purposeId = 1; purposeId <= 10; purposeId += 1) granted[String(purposeId)] = true;
    tcfState = { eventStatus: "tcloaded", purpose: { consents: granted }, tcString: `CERTSCORE_${config.id.toUpperCase()}_PRE_ACTION` };
    localStorage.setItem(`certscore_${config.id}_consent_state`, "granted");
    document.cookie = "OptanonConsent=groups%3DC0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1; Max-Age=900; Path=/; SameSite=Lax; Secure";
    window.__tcfapi = function certScoreTcfApi(command, version, callback) {
      if (command === "getTCData" && version === 2 && typeof callback === "function") {
        callback(JSON.parse(JSON.stringify(tcfState)), true);
        return;
      }
      if (typeof callback === "function") callback(null, false);
    };
  }

  let rejectApplied = false;

  function applyReject(root) {
    if (config.postRefusal !== "reject_ignored" || rejectApplied) return;
    rejectApplied = true;
    const denied = {};
    for (let purposeId = 1; purposeId <= 10; purposeId += 1) denied[String(purposeId)] = false;
    tcfState = { eventStatus: "useractioncomplete", purpose: { consents: denied }, tcString: `CERTSCORE_${config.id.toUpperCase()}_REJECTED` };
    localStorage.setItem(`certscore_${config.id}_consent_state`, "denied");
    document.cookie = "OptanonConsent=groups%3DC0001%3A1%2CC0002%3A0%2CC0003%3A0%2CC0004%3A0; Max-Age=900; Path=/; SameSite=Lax; Secure";
    const status = root?.querySelector?.("#canary-consent-status") ?? document.querySelector("#canary-consent-status");
    if (status) status.textContent = "Optional purposes rejected.";
    const banner = root?.querySelector?.("#onetrust-banner-sdk") ?? document.querySelector("#onetrust-banner-sdk");
    if (banner) banner.hidden = true;
    if (root instanceof Element) root.hidden = true;
    window.setTimeout(() => {
      document.cookie = `_gid=GA1.1.CERTSCORE_${config.id.toUpperCase()}_POST_REFUSAL; Max-Age=900; Path=/; SameSite=Lax; Secure`;
      fetch(`https://www.google-analytics.com/g/collect?v=2&tid=G-${config.id.toUpperCase()}&cid=certscore-${config.id}&en=reject_ignored`, {
        cache: "no-store",
        credentials: "omit",
        mode: "no-cors",
        referrerPolicy: "no-referrer",
      }).catch(() => {});
    }, 75);
  }

  function registerRejectControl(root) {
    if (config.postRefusal !== "reject_ignored") return;
    const reject = root?.querySelector?.("#onetrust-reject-all-handler");
    reject?.addEventListener("click", () => {
      applyReject(root);
    });
  }

  if (config.postRefusal === "reject_ignored") {
    document.addEventListener("click", (event) => {
      const rejectInvoked = event.composedPath().some((node) =>
        node instanceof Element && node.id === "onetrust-reject-all-handler"
      );
      if (rejectInvoked) applyReject(document);
    });
  }

  const requests = config.trackers.map((url) =>
    fetch(url, {
      cache: "no-store",
      credentials: "omit",
      mode: "no-cors",
      referrerPolicy: "no-referrer",
    }).then(
      () => ({ status: "settled", url }),
      () => ({ status: "observed", url }),
    ),
  );

  const fingerprint = { kind: config.fingerprint };
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 64;
  const context2d = canvas.getContext("2d");
  context2d?.fillText(`CertScore ${config.id}`, 8, 24);

  if (config.fingerprint === "canvas_audio" || config.fingerprint === "device_canvas" || config.fingerprint === "combined") {
    fingerprint.canvas = canvas.toDataURL();
    fingerprint.canvasPixels = context2d?.getImageData(0, 0, 16, 16).data.length ?? 0;
  }

  if (config.fingerprint === "webgl_fonts" || config.fingerprint === "combined") {
    const webglCanvas = document.createElement("canvas");
    const webgl = webglCanvas.getContext("webgl");
    const debugInfo = webgl?.getExtension("WEBGL_debug_renderer_info");
    fingerprint.webglVendor = debugInfo ? webgl?.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null;
    fingerprint.webglRenderer = debugInfo ? webgl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null;
    fingerprint.fontWidths = ["Arial", "Georgia", "Courier New", "monospace"].map((font) => {
      if (!context2d) return 0;
      context2d.font = `16px ${font}`;
      return context2d.measureText("CertScore fingerprint canary").width;
    });
  }

  if (config.fingerprint === "canvas_audio" || config.fingerprint === "combined") {
    const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (AudioContext) {
      const audio = new AudioContext(1, 256, 44100);
      const oscillator = audio.createOscillator();
      const analyser = audio.createAnalyser();
      oscillator.connect(analyser);
      analyser.connect(audio.destination);
      oscillator.start(0);
      audio.startRendering().then((buffer) => {
        fingerprint.audioSampleRate = buffer.sampleRate;
        fingerprint.audioLength = buffer.length;
      }).catch(() => {});
    }
  }

  if (config.fingerprint === "device_canvas" || config.fingerprint === "combined") {
    fingerprint.device = {
      colorDepth: screen.colorDepth,
      hardwareConcurrency: navigator.hardwareConcurrency,
      languages: navigator.languages,
      pixelRatio: window.devicePixelRatio,
      screen: [screen.width, screen.height],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  if (config.controls === "shadow") {
    const host = document.getElementById("consent-shadow-host");
    const shadow = host?.attachShadow({ mode: "open" });
    if (shadow) {
      shadow.innerHTML = '<section class="banner" id="onetrust-banner-sdk" role="dialog" aria-label="Cookie choices"><strong>Cookie choices</strong><p>These synthetic controls are intentionally rendered in an open shadow root.</p><button id="onetrust-reject-all-handler">Reject all</button><button id="onetrust-pc-btn-handler">Manage choices</button><button id="onetrust-accept-btn-handler">Accept all cookies</button><p id="canary-consent-status" role="status" aria-live="polite"></p></section>';
      registerRejectControl(shadow);
    }
  }

  if (config.controls === "delayed") {
    setTimeout(() => {
      const delayed = document.getElementById("delayed-consent");
      if (delayed) {
        delayed.innerHTML = '<section class="banner" id="onetrust-banner-sdk" role="dialog" aria-label="Cookie choices"><strong>Cookie choices</strong><button id="onetrust-reject-all-handler">Reject non-essential cookies</button><button id="onetrust-pc-btn-handler">Customize settings</button><button id="onetrust-accept-btn-handler">Agree to all cookies</button><p id="canary-consent-status" role="status" aria-live="polite"></p></section>';
        registerRejectControl(delayed);
      }
    }, 600);
  }

  if (config.controls === "direct" || config.controls === "stacked") {
    registerRejectControl(document);
  }

  Promise.all(requests).then((trackerRequests) => {
    window.__CERTSCORE_CANARY_RESULT__ = {
      cookieNames: config.cookies,
      fingerprint,
      id: config.id,
      sessionReplayExpected: true,
      trackerRequests,
    };
    document.documentElement.dataset.certscoreCanaryReady = "true";
  });
})();
