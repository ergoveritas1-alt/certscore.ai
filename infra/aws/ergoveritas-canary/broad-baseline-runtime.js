(function () {
  // Synthetic Google-tag-style identifiers; no personal data is used.
  document.cookie = "_ga=GA1.1.CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  document.cookie = "_gid=GA1.1.CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  document.cookie = "_ga_CANARY=GS1.1.CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  document.cookie = "certscore_canary_marketing=pre_consent; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  document.cookie = "_fbp=fb.1.CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  document.cookie = "_gcl_au=1.1.CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  window.localStorage.setItem("certscore_canary_storage", "pre_consent_non_essential");

  // Synthetic analytics and marketing requests, intentionally before consent.
  var img = new Image();
  img.src = "https://www.google-analytics.com/collect?v=1&t=pageview&tid=G-X5ZM7BWET3&cid=CANARY";
  var marketing = new Image();
  marketing.src = "https://www.googletagmanager.com/gtm.js?id=GTM-CANARYTEST";

  // Record a real Clarity event while the page is still pre-consent.
  if (typeof window.clarity === "function") {
    window.clarity("set", "canary_variant", "broad-baseline");
  }

  // Deterministic, non-sensitive canvas fingerprinting signal.
  var canvas = document.createElement("canvas");
  canvas.width = 16; canvas.height = 16;
  var context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, 16, 16);
    context.getImageData(0, 0, 16, 16);
    window.__certscoreCanaryCanvasFingerprint = canvas.toDataURL();
  }
  var webglCanvas = document.createElement("canvas");
  var webgl = webglCanvas.getContext("webgl") || webglCanvas.getContext("experimental-webgl");
  if (webgl && typeof webgl.getParameter === "function") {
    window.__certscoreCanaryWebglFingerprint = String(webgl.getParameter(webgl.RENDERER) || "unknown");
  }
  try {
    window.__certscoreCanaryPluginCount = navigator.plugins.length;
    window.__certscoreCanaryMimeTypeCount = navigator.mimeTypes.length;
  } catch (_) {}
  try {
    if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === "function") {
      navigator.userAgentData.getHighEntropyValues(["architecture", "bitness", "model", "platformVersion"]);
    }
  } catch (_) {}
  var fingerprintTransmission = new Image();
  fingerprintTransmission.src = "../runtime/fingerprint-collect.svg?canvas_hash=CANARY&webgl_renderer=" +
    encodeURIComponent(window.__certscoreCanaryWebglFingerprint || "unknown") +
    "&plugin_count=" + encodeURIComponent(window.__certscoreCanaryPluginCount || 0) +
    "&mime_type_count=" + encodeURIComponent(window.__certscoreCanaryMimeTypeCount || 0);
  window.__certscoreCanaryFeatureFingerprint = {
    language: navigator.language,
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };

  // Keep the two first-layer controls functional without introducing a
  // refusal control: Accept dismisses the surface, while Manage opens a
  // preference panel and Save records the selected synthetic choices.
  var banner = document.querySelector('[data-canary-consent-surface="first-layer"]');
  var preferences = document.getElementById("canary-preferences");
  var accept = document.getElementById("canary-accept");
  var manage = document.getElementById("canary-manage");
  var save = document.getElementById("canary-save");
  var status = document.getElementById("canary-consent-status");
  function setConsent(value) {
    document.cookie = "certscore_canary_consent=" + value + "; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
    if (banner) banner.hidden = true;
    if (preferences) preferences.hidden = true;
    if (status) status.textContent = value === "accepted" ? "All optional features accepted." : "Preferences saved.";
  }
  if (accept) accept.addEventListener("click", function () { setConsent("accepted"); });
  if (manage) manage.addEventListener("click", function () {
    if (preferences) preferences.hidden = false;
    if (status) status.textContent = "Preference controls opened.";
  });
  if (save) save.addEventListener("click", function () {
    var analytics = document.getElementById("canary-analytics");
    var media = document.getElementById("canary-media");
    setConsent("managed");
    document.cookie = "certscore_canary_analytics=" + (analytics && analytics.checked ? "enabled" : "disabled") + "; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
    document.cookie = "certscore_canary_media=" + (media && media.checked ? "enabled" : "disabled") + "; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  });
}());
