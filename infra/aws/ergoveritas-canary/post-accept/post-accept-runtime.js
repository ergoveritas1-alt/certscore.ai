(function () {
  "use strict";

  var variant = document.body.getAttribute("data-post-accept-canary-variant") || "honored";
  var purposeConsents = {};
  for (var purposeId = 1; purposeId <= 10; purposeId += 1) purposeConsents[String(purposeId)] = false;
  var tcfState = {
    eventStatus: "tcloaded",
    purpose: { consents: purposeConsents },
    tcString: "CERTSCORE_CANARY_PRE_ACCEPT"
  };

  window.__tcfapi = function (command, version, callback) {
    if (command === "getTCData" && version === 2 && typeof callback === "function") {
      callback(JSON.parse(JSON.stringify(tcfState)), true);
      return;
    }
    if (typeof callback === "function") callback(null, false);
  };

  var accept = document.getElementById("onetrust-accept-btn-handler");
  var banner = document.getElementById("onetrust-banner-sdk");
  var status = document.getElementById("canary-consent-status");
  if (!accept) return;

  accept.addEventListener("click", function () {
    document.cookie = "OptanonConsent=certscore_accept_registered; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
    if (banner) banner.hidden = true;
    if (status) status.textContent = "Optional purposes accepted.";

    if (variant === "inconsistent") {
      var denied = {};
      for (var deniedId = 1; deniedId <= 10; deniedId += 1) denied[String(deniedId)] = false;
      tcfState = {
        eventStatus: "useractioncomplete",
        purpose: { consents: denied },
        tcString: "CERTSCORE_CANARY_ACCEPT_INCONSISTENT"
      };
      return;
    }

    var granted = {};
    for (var grantedId = 1; grantedId <= 10; grantedId += 1) granted[String(grantedId)] = true;
    tcfState = {
      eventStatus: "useractioncomplete",
      purpose: { consents: granted },
      tcString: "CERTSCORE_CANARY_ACCEPTED"
    };
    window.setTimeout(function () {
      document.cookie = "_ga=GA1.1.POST_ACCEPT_CANARY; Path=/.well-known/certscore-canary/; SameSite=Lax; Secure";
      var analytics = new Image();
      analytics.alt = "";
      analytics.src = "https://www.google-analytics.com/g/collect?v=2&tid=G-CERTSCORE&cid=POST_ACCEPT_CANARY&en=accept_honored";
    }, 75);
  });
}());
