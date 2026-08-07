(function () {
  // Synthetic Google-tag-style identifiers; no personal data is used.
  document.cookie = "_ga=GA1.1.CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  document.cookie = "_gid=GA1.1.CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  document.cookie = "_ga_CANARY=GS1.1.CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  document.cookie = "certscore_canary_marketing=pre_consent; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  window.localStorage.setItem("certscore_canary_storage", "pre_consent_non_essential");

  // Synthetic analytics and marketing requests, intentionally before consent.
  var img = new Image();
  img.src = "https://www.google-analytics.com/collect?v=1&t=pageview&tid=G-CANARYTEST&cid=CANARY";
  var marketing = new Image();
  marketing.src = "https://www.googletagmanager.com/gtm.js?id=GTM-CANARYTEST";

  // Deterministic, non-sensitive canvas fingerprinting signal.
  var canvas = document.createElement("canvas");
  canvas.width = 16; canvas.height = 16;
  var context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, 16, 16);
    window.__certscoreCanaryCanvasFingerprint = canvas.toDataURL();
  }
  window.__certscoreCanaryFeatureFingerprint = {
    language: navigator.language,
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}());
