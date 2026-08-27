(function () {
  "use strict";

  var variant = document.body.getAttribute("data-post-refusal-canary-variant") || "honored";
  var purposeConsents = {};
  for (var purposeId = 1; purposeId <= 10; purposeId += 1) purposeConsents[String(purposeId)] = true;
  var tcfState = {
    eventStatus: "tcloaded",
    purpose: { consents: purposeConsents },
    tcString: "CERTSCORE_CANARY_PRE_ACTION"
  };

  document.cookie = "_ga=GA1.1.CERTSCORE_CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
  window.localStorage.setItem("certscore_canary_storage", "pre_refusal_non_essential");

  window.__tcfapi = function (command, version, callback) {
    if (command === "getTCData" && version === 2 && typeof callback === "function") {
      callback(JSON.parse(JSON.stringify(tcfState)), true);
      return;
    }
    if (typeof callback === "function") callback(null, false);
  };

  var reject = document.getElementById("onetrust-reject-all-handler");
  var banner = document.getElementById("onetrust-banner-sdk");
  var status = document.getElementById("canary-consent-status");
  if (!reject) return;

  reject.addEventListener("click", function () {
    var denied = {};
    for (var purposeId = 1; purposeId <= 10; purposeId += 1) denied[String(purposeId)] = false;
    tcfState = {
      eventStatus: "useractioncomplete",
      purpose: { consents: denied },
      tcString: "CERTSCORE_CANARY_REJECTED"
    };
    document.cookie = "certscore_canary_consent=rejected; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
    if (banner) banner.hidden = true;
    if (status) status.textContent = "Optional purposes rejected.";

    if (variant === "honored") {
      document.cookie = "_ga=; Max-Age=0; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
      window.localStorage.removeItem("certscore_canary_storage");
      return;
    }

    window.setTimeout(function () {
      document.cookie = "_gid=GA1.1.POST_REFUSAL_CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
      var analytics = new Image();
      analytics.alt = "";
      analytics.src = "https://www.google-analytics.com/g/collect?v=2&tid=G-CERTSCORE&cid=POST_REFUSAL_CANARY&en=reject_ignored";
    }, 75);
  });
}());
