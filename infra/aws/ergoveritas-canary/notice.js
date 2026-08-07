(function () {
  var text = "ergoveritas.com is a controlled test environment used solely for automated compliance-scanning validation. Pages on this domain intentionally exhibit non-compliant behaviors for detection-testing purposes. This site is not intended for public use.";
  var banner = document.createElement("div");
  banner.setAttribute("role", "note");
  banner.setAttribute("data-canary-site-notice", "true");
  banner.textContent = text;
  banner.style.cssText = "position:fixed;top:0;right:0;left:0;z-index:2147483647;padding:10px 16px;border-bottom:2px solid #92400e;background:#fffbeb;color:#451a03;font:600 13px/1.45 system-ui,sans-serif;text-align:center;box-shadow:0 2px 10px rgba(69,26,3,.2)";
  document.documentElement.style.paddingTop = "58px";
  document.body.insertBefore(banner, document.body.firstChild);
}());
