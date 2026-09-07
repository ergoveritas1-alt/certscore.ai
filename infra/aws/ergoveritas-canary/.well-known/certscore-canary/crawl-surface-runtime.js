// Bounded synthetic crawl-surface signals for the first ten canary pages.
// This is intentionally same-origin, deterministic per page, and read-only.
(function () {
  "use strict";
  var root = document.querySelector("[data-certscore-crawl-surface]");
  if (!root) return;
  var pageKey = root.getAttribute("data-certscore-crawl-surface") || "canary";
  var seed = Array.from(pageKey).reduce(function (sum, ch) { return sum + ch.charCodeAt(0); }, 0);
  var count = function (offset) { return 1 + ((seed + offset) % 5); };
  var embedTypes = ["clarity", "google-map", "facebook", "linkedin", "x", "youtube"];
  var embedSources = {
    "google-map": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1!2d-117.16!3d32.72",
    facebook: "https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2Ffacebook",
    linkedin: "https://www.linkedin.com/embed/feed/update/urn%3Ali%3Ashare%3A1",
    x: "https://platform.twitter.com/embed/index.html",
    youtube: "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?rel=0"
  };
  var cookieTypes = ["cookie", "localStorage", "sessionStorage", "indexedDB", "cookie-parent-child"];
  var requestTypes = ["fetch", "image", "script", "stylesheet", "parent-child-fetch"];
  var embeds = count(1), cookies = count(2), requests = count(3);

  function tag(kind, type, index, parent) {
    var el = document.createElement("span");
    el.hidden = true;
    el.dataset.certscoreSynthetic = kind;
    el.dataset.certscoreType = type;
    el.dataset.certscoreIndex = String(index);
    if (parent) el.dataset.certscoreParent = parent;
    root.appendChild(el);
    return el;
  }

  for (var i = 0; i < embeds; i += 1) {
    var type = embedTypes[(seed + i) % embedTypes.length];
    var parent = i > 1 && i % 3 === 0 ? "embed-" + (i - 1) : "";
    var frame = document.createElement("iframe");
    frame.hidden = true;
    frame.title = "Synthetic " + type + " embed";
    frame.dataset.certscoreSynthetic = "embed";
    frame.dataset.certscoreType = type;
    frame.dataset.certscoreIndex = String(i);
    if (parent) frame.dataset.certscoreParent = parent;
    frame.src = embedSources[type] || "data:text/html,<title>synthetic " + encodeURIComponent(type) + "</title>";
    root.appendChild(frame);
    if (type === "clarity") {
      var clarity = document.createElement("script");
      clarity.async = true;
      clarity.src = "https://www.clarity.ms/tag/ergoveritas-canary";
      clarity.dataset.certscoreSynthetic = "session-replay-clarity";
      root.appendChild(clarity);
    }
    tag("embed-marker", type, i, parent);
  }

  for (var c = 0; c < cookies; c += 1) {
    var storageType = cookieTypes[(seed + c) % cookieTypes.length];
    var key = "certscore_crawl_" + pageKey.replace(/[^a-z0-9]/gi, "_") + "_" + c;
    var parentKey = c > 1 && c % 3 === 0 ? "certscore_crawl_parent_" + (c - 1) : "";
    try {
      if (storageType.indexOf("cookie") === 0) document.cookie = key + "=synthetic; Max-Age=300; SameSite=Lax; Secure";
      else if (storageType === "localStorage") localStorage.setItem(key, "synthetic");
      else if (storageType === "sessionStorage") sessionStorage.setItem(key, "synthetic");
      else if (storageType === "indexedDB" && window.indexedDB) indexedDB.open("certscore-crawl-surface");
    } catch (_) {}
    tag("storage-marker", storageType, c, parentKey);
  }

  for (var r = 0; r < requests; r += 1) {
    var requestType = requestTypes[(seed + r) % requestTypes.length];
    var parentRequest = r > 1 && r % 3 === 0 ? "request-" + (r - 1) : "";
    var requestUrl = "./index.html?synthetic_request=" + encodeURIComponent(pageKey) + "&type=" + requestType + "&i=" + r;
    if (requestType === "fetch" || requestType === "parent-child-fetch") {
      fetch(requestUrl, { cache: "no-store", credentials: "same-origin" }).catch(function () {});
    } else {
      var probe = document.createElement(requestType === "image" ? "img" : "script");
      probe.hidden = true;
      probe.src = requestUrl;
      root.appendChild(probe);
    }
    tag("request-marker", requestType, r, parentRequest);
  }
}());
