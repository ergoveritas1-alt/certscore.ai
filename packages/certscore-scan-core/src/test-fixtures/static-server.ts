import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type StaticFixturePage =
  | "akamai-security-cookie"
  | "clarity-collection"
  | "clarity-f-collection"
  | "cmp-cookie"
  | "demdex-id"
  | "embedded-third-party-iframe"
  | "fingerprinting-api-probe"
  | "consent-accept-only-activation"
  | "consent-analytics-cookie-persists"
  | "consent-ambiguous-controls"
  | "consent-accept-essential"
  | "consent-banner-failed-click"
  | "consent-banner-stateful-click"
  | "consent-cmp-cookie-persists"
  | "consent-deny-non-essential"
  | "consent-iframe-reject"
  | "consent-lean-guarded-image-cookie"
  | "consent-navigation-timeout"
  | "consent-focused-privacy-opt-out"
  | "consent-manage-preferences"
  | "consent-no-reject"
  | "consent-privacy-choice-surface-reject-success"
  | "consent-privacy-choice-only"
  | "consent-privacy-opt-out-ad-comparison"
  | "consent-privacy-opt-out-radio-form-ad-comparison"
  | "consent-preference-center-ambiguous"
  | "consent-preference-center-confirm-save"
  | "consent-post-choice-reopen-control"
  | "consent-preference-center-reject-success"
  | "consent-preference-center-toggle-save"
  | "consent-simple-accept-reject"
  | "consent-tracking-persists-after-reject"
  | "ga-collection"
  | "ga-first-party-vendor-associated-cookie"
  | "generic-cdn-noise"
  | "google-ads-measurement"
  | "google-doubleclick-pixel"
  | "google-consent-tag-support"
  | "google-owned-unresolved"
  | "gtm-library-only"
  | "newrelic-performance-monitoring"
  | "policy-ai-disclosure"
  | "policy-article13-long"
  | "policy-ambiguous-choices"
  | "policy-broken-link"
  | "policy-cookie-link"
  | "policy-do-not-sell-link"
  | "policy-footer-privacy-delayed"
  | "policy-global-footer-delayed"
  | "policy-gold-caltech-common-path"
  | "policy-gold-ford-secondary-only"
  | "policy-gold-ikea-common-path"
  | "policy-gold-latimes-secondary-only"
  | "policy-gold-nvidia-secondary-only"
  | "policy-gold-privacy-duplicates"
  | "policy-external-choice-platform"
  | "policy-footer-privacy"
  | "policy-gpc-disclosure-late"
  | "policy-gpc-disclosure"
  | "policy-generic-links"
  | "policy-link-aria-title"
  | "policy-latimes-footer-surfaces"
  | "policy-onetrust-index-json"
  | "policy-onetrust-notice-json"
  | "policy-privacy-center-link"
  | "policy-retention-rights-only"
  | "policy-state-privacy-rights-link"
  | "policy-cmp-preference-control"
  | "policy-manage-cookies-footer-control"
  | "policy-manage-cookies-footer-anchor"
  | "policy-manage-cookies-embedded-config"
  | "policy-no-links"
  | "policy-notice-at-collection-link"
  | "policy-privacy-choices-link"
  | "policy-session-replay-disclosure"
  | "policy-vendor-mentions"
  | "policy-webmd-like-secondary-surfaces"
  | "region-coded-collection-endpoint"
  | "site-owned-infrastructure"
  | "third-party-cookie-positive"
  | "unresolved-collection-endpoint";

export interface StaticFixtureServer {
  baseUrl: string;
  urlFor(page: StaticFixturePage): string;
  close(): Promise<void>;
}

const fixtureSlugs: Record<StaticFixturePage, string> = {
  "akamai-security-cookie": "ak-security",
  "clarity-collection": "clarity-page",
  "clarity-f-collection": "clarity-f-page",
  "cmp-cookie": "consent-cookie",
  "demdex-id": "demdex-id",
  "embedded-third-party-iframe": "embedded-third-party-iframe",
  "fingerprinting-api-probe": "fingerprinting-api-probe",
  "consent-accept-only-activation": "consent-accept-only",
  "consent-analytics-cookie-persists": "consent-analytics-cookie-persists",
  "consent-ambiguous-controls": "consent-ambiguous-controls",
  "consent-accept-essential": "consent-accept-essential",
  "consent-banner-failed-click": "consent-failed-click",
  "consent-banner-stateful-click": "consent-stateful-click",
  "consent-cmp-cookie-persists": "consent-cmp-cookie-persists",
  "consent-deny-non-essential": "consent-deny-non-essential",
  "consent-iframe-reject": "consent-iframe-reject",
  "consent-lean-guarded-image-cookie": "consent-lean-guarded-image-cookie",
  "consent-navigation-timeout": "consent-navigation-timeout",
  "consent-focused-privacy-opt-out": "consent-focused-privacy-opt-out",
  "consent-manage-preferences": "consent-manage-preferences",
  "consent-no-reject": "consent-no-reject",
  "consent-privacy-choice-surface-reject-success": "consent-privacy-choice-surface-reject-success",
  "consent-privacy-choice-only": "consent-privacy-choice-only",
  "consent-privacy-opt-out-ad-comparison": "consent-privacy-opt-out-ad-comparison",
  "consent-privacy-opt-out-radio-form-ad-comparison": "consent-privacy-opt-out-radio-form-ad-comparison",
  "consent-preference-center-ambiguous": "consent-preference-center-ambiguous",
  "consent-preference-center-confirm-save": "consent-preference-center-confirm-save",
  "consent-post-choice-reopen-control": "consent-post-choice-reopen-control",
  "consent-preference-center-reject-success": "consent-preference-center-reject-success",
  "consent-preference-center-toggle-save": "consent-preference-center-toggle-save",
  "consent-simple-accept-reject": "consent-simple",
  "consent-tracking-persists-after-reject": "consent-persists",
  "ga-collection": "ga-page",
  "ga-first-party-vendor-associated-cookie": "ga-first-party-cookie",
  "generic-cdn-noise": "static-noise",
  "google-ads-measurement": "google-ads",
  "google-doubleclick-pixel": "doubleclick-pixel",
  "google-consent-tag-support": "google-consent",
  "google-owned-unresolved": "google-unresolved",
  "gtm-library-only": "gtm-page",
  "newrelic-performance-monitoring": "newrelic-monitoring",
  "policy-ai-disclosure": "policy-ai",
  "policy-article13-long": "policy-article13-long",
  "policy-ambiguous-choices": "policy-ambiguous-choices",
  "policy-broken-link": "policy-broken-link",
  "policy-cookie-link": "policy-cookie-link",
  "policy-do-not-sell-link": "policy-do-not-sell",
  "policy-footer-privacy-delayed": "policy-footer-privacy-delayed",
  "policy-global-footer-delayed": "policy-global-footer-delayed",
  "policy-gold-caltech-common-path": "policy-gold-caltech-common-path",
  "policy-gold-ford-secondary-only": "policy-gold-ford-secondary-only",
  "policy-gold-ikea-common-path": "policy-gold-ikea-common-path",
  "policy-gold-latimes-secondary-only": "policy-gold-latimes-secondary-only",
  "policy-gold-nvidia-secondary-only": "policy-gold-nvidia-secondary-only",
  "policy-gold-privacy-duplicates": "policy-gold-privacy-duplicates",
  "policy-external-choice-platform": "policy-external-choice",
  "policy-footer-privacy": "policy-footer-privacy",
  "policy-gpc-disclosure-late": "policy-gpc-late",
  "policy-gpc-disclosure": "policy-gpc",
  "policy-generic-links": "policy-generic-links",
  "policy-link-aria-title": "policy-link-aria-title",
  "policy-latimes-footer-surfaces": "policy-latimes-footer-surfaces",
  "policy-onetrust-index-json": "policy-onetrust-index-json",
  "policy-onetrust-notice-json": "policy-onetrust-notice-json",
  "policy-privacy-center-link": "policy-privacy-center",
  "policy-retention-rights-only": "policy-retention-rights-only",
  "policy-state-privacy-rights-link": "policy-state-rights",
  "policy-cmp-preference-control": "policy-cmp-preference-control",
  "policy-manage-cookies-footer-control": "policy-manage-cookies-footer-control",
  "policy-manage-cookies-footer-anchor": "policy-manage-cookies-footer-anchor",
  "policy-manage-cookies-embedded-config": "policy-manage-cookies-embedded-config",
  "policy-no-links": "policy-no-links",
  "policy-notice-at-collection-link": "policy-notice-at-collection",
  "policy-privacy-choices-link": "policy-privacy-choices",
  "policy-session-replay-disclosure": "policy-session-replay",
  "policy-vendor-mentions": "policy-vendors",
  "policy-webmd-like-secondary-surfaces": "policy-webmd-like-secondary",
  "region-coded-collection-endpoint": "region-coded-collection",
  "site-owned-infrastructure": "site-infra",
  "third-party-cookie-positive": "third-party-cookie",
  "unresolved-collection-endpoint": "unresolved-page",
};

const fixturePagesBySlug = new Map<string, StaticFixturePage>(
  Object.entries(fixtureSlugs).map(([page, slug]) => [slug, page as StaticFixturePage]),
);

const onePixelGif = Buffer.from(
  "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

export async function startStaticFixtureServer(): Promise<StaticFixtureServer> {
  const server = createServer(handleRequest);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not bind to a TCP port.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    urlFor(page: StaticFixturePage): string {
      return `${baseUrl}/f/${fixtureSlugs[page]}`;
    },
    close(): Promise<void> {
      return closeServer(server);
    },
  };
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", "http://fixture.local");
  response.setHeader("Cache-Control", "no-store");

  if (url.pathname.startsWith("/f/")) {
    const page = fixturePagesBySlug.get(url.pathname.replace("/f/", ""));
    if (page) {
      serveCase(page, response);
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("unknown fixture");
    return;
  }

  if (url.pathname === "/static/app.css") {
    response.writeHead(200, { "Content-Type": "text/css" });
    response.end("body { color: #222; }");
    return;
  }

  if (url.pathname === "/static/app.js") {
    response.writeHead(200, { "Content-Type": "application/javascript" });
    response.end("window.__fixtureStaticLoaded = true;");
    return;
  }

  if (url.pathname === "/pixel.gif") {
    response.writeHead(200, { "Content-Type": "image/gif" });
    response.end(onePixelGif);
    return;
  }

  if (url.pathname === "/fixture-noise-image.gif") {
    response.setHeader("Set-Cookie", "noise_image_cookie=fixture-redacted; Path=/; SameSite=Lax");
    response.writeHead(200, { "Content-Type": "image/gif" });
    response.end(onePixelGif);
    return;
  }

  if (url.pathname === "/cmp/consent-pixel.gif") {
    response.setHeader("Set-Cookie", "OptanonConsent=fixture-redacted; Path=/; SameSite=Lax");
    response.writeHead(200, { "Content-Type": "image/gif" });
    response.end(onePixelGif);
    return;
  }

  if (url.pathname === "/onetrust/notice-shell.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      languages: [
        {
          code: "en-us",
          isDefault: true,
          policyUrl: "/onetrust/notice-shell-en-us.json",
        },
      ],
    }));
    return;
  }

  if (url.pathname === "/onetrust/notice-shell-en-us.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      notices: [{
        title: "Privacy Policy",
        content: [
          "<h1>Privacy Policy</h1>",
          "<p>The controller for this service can be contacted at privacy@example.test.</p>",
          "<p>We process personal data to provide services, personalize content, measure performance, prevent fraud, and operate customer support.</p>",
          "<p>We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing.</p>",
          "<p>Recipients include processors, service providers, analytics providers, advertising partners, and affiliates.</p>",
          "<p>We retain personal data only as long as necessary for the purposes described or as required by law.</p>",
          "<p>You may exercise rights to access, rectification, erasure, restriction, portability, and objection.</p>",
          "<p>We may transfer personal data outside the European Economic Area using adequacy decisions or standard contractual clauses.</p>",
          "<p>Our data protection officer can be reached through the privacy office, and you may complain to a supervisory authority.</p>",
        ].join(" "),
      }],
    }));
    return;
  }

  if (url.pathname === "/onetrust/index-manifest.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      languages: {
        de: { policyUrl: "/onetrust/index-de.json" },
        "en-us": { policyUrl: "/onetrust/index-en-us.json" },
      },
    }));
    return;
  }

  if (url.pathname === "/onetrust/index-en-us.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      notices: {
        index: {
          content: [
            "<p>Our Privacy Policy explains what information we process.</p>",
            "<table><tr><td>English (U.S.)</td><td><a href=\"/policies/onetrust-final-shell\">Privacy Policy</a></td></tr></table>",
          ].join(" "),
        },
      },
    }));
    return;
  }

  if (url.pathname === "/onetrust/final-manifest.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      languages: {
        "en-us": { policyUrl: "/onetrust/final-en-us.json" },
      },
    }));
    return;
  }

  if (url.pathname === "/onetrust/final-en-us.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      notices: {
        final: {
          content: [
            "<h1>Warner Bros. Discovery Privacy Policy</h1>",
            "<p>Controllers List. The controller for this service can be contacted at privacy@example.test.</p>",
            "<p>We process personal data to provide services, personalize content, measure performance, and operate customer support.</p>",
            "<p>We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing.</p>",
            "<p>Recipients include processors, service providers, analytics providers, advertising partners, and affiliates.</p>",
            "<p>We retain personal data only as long as necessary for the purposes described or as required by law.</p>",
            "<p>You may exercise rights to access, rectification, erasure, restriction, portability, and objection.</p>",
            "<p>We may transfer personal data outside the European Economic Area using adequacy decisions or standard contractual clauses.</p>",
            "<p>Our data protection officer can be reached through the privacy office, and you may complain to a supervisory authority.</p>",
          ].join(" "),
        },
      },
    }));
    return;
  }

  if (url.pathname === "/collect") {
    response.writeHead(204, { "Content-Type": "text/plain" });
    response.end();
    return;
  }

  const policyHtml = policyDocumentHtml(url.pathname);
  if (policyHtml) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(policyHtml);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("not found");
}

function serveCase(caseName: StaticFixturePage, response: ServerResponse): void {
  const cookieHeader = cookieForCase(caseName);
  if (cookieHeader) {
    response.setHeader("Set-Cookie", cookieHeader);
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  if (caseName === "consent-navigation-timeout") {
    response.write(`<!doctype html><html><head><title>slow consent</title></head><body>
      <main>CertScore v2 fixture: consent-navigation-timeout</main>
      <section id="onetrust-banner-sdk">
        <p>We use cookies and similar technologies.</p>
        <button>Accept All Cookies</button>
        <button>Reject All Cookies</button>
        <button>Manage Preferences</button>
      </section>`);
    return;
  }
  response.end(pageHtml(caseName));
}

function cookieForCase(caseName: StaticFixturePage): string | undefined {
  if (caseName === "akamai-security-cookie") {
    return "_abck=fixture-redacted; Path=/; SameSite=Lax";
  }
  if (caseName === "cmp-cookie") {
    return "OptanonConsent=fixture-redacted; Path=/; SameSite=Lax";
  }
  if (caseName === "ga-first-party-vendor-associated-cookie") {
    return "_ga=fixture-redacted; Path=/; SameSite=Lax";
  }
  return undefined;
}

function pageHtml(caseName: StaticFixturePage): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(caseName)}</title>
    ${headMarkup(caseName)}
  </head>
  <body>
    <main data-case="${escapeHtml(caseName)}">CertScore v2 fixture: ${escapeHtml(caseName)}</main>
    ${bodyMarkup(caseName)}
  </body>
</html>`;
}

function headMarkup(caseName: StaticFixturePage): string {
  if (caseName === "gtm-library-only") {
    return `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST"></script>`;
  }
  if (caseName === "generic-cdn-noise") {
    return [
      `<link rel="stylesheet" href="https://static.examplecdn.com/app.css">`,
      `<script src="https://static.examplecdn.com/app.js"></script>`,
    ].join("\n");
  }
  return "";
}

function bodyMarkup(caseName: StaticFixturePage): string {
  if (caseName.startsWith("consent-")) {
    return consentFlowHomeMarkup(caseName);
  }
  if (caseName.startsWith("policy-")) {
    return policyHomeMarkup(caseName);
  }
  if (caseName === "ga-collection") {
    return `<img alt="" src="https://www.google-analytics.com/g/collect?v=2&tid=G-TEST">`;
  }
  if (caseName === "google-consent-tag-support") {
    return `<img alt="" src="https://www.google.com/ccm/collect?gtm=GTM-TEST&gcd=redacted">`;
  }
  if (caseName === "google-ads-measurement") {
    return `<img alt="" src="https://www.google.com/pagead/1p-conversion/123">`;
  }
  if (caseName === "google-doubleclick-pixel") {
    return `<img alt="" src="https://cm.g.doubleclick.net/pixel?google_nid=fixture">`;
  }
  if (caseName === "google-owned-unresolved") {
    return `<img alt="" src="https://www.google.com/collect?event=fixture">`;
  }
  if (caseName === "clarity-collection") {
    return `<img alt="" src="https://n.clarity.ms/collect?project=fixture">`;
  }
  if (caseName === "clarity-f-collection") {
    return `<img alt="" src="https://f.clarity.ms/collect?project=fixture">`;
  }
  if (caseName === "demdex-id") {
    return `<img alt="" src="https://dpm.demdex.net/id?d_orgid=fixture">`;
  }
  if (caseName === "embedded-third-party-iframe") {
    return `<iframe title="Embedded video" src="https://www.youtube.com/embed/certscore-fixture"></iframe>`;
  }
  if (caseName === "fingerprinting-api-probe") {
    return `<script>
      window.__fixtureFingerprintingProbeRan = false;
      setTimeout(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillText("CertScore", 1, 10);
          ctx.getImageData(0, 0, 1, 1);
        }
        canvas.toDataURL();
        const glCanvas = document.createElement("canvas");
        const gl = glCanvas.getContext("webgl");
        if (gl) {
          gl.getParameter(gl.VERSION);
        }
        navigator.plugins;
        window.__fixtureFingerprintingProbeRan = true;
        document.body.setAttribute("data-fingerprinting-probe-ran", "true");
      }, 25);
    </script>`;
  }
  if (caseName === "newrelic-performance-monitoring") {
    return `<img alt="" src="https://bam.nr-data.net/1/browser/fixture">`;
  }
  if (caseName === "site-owned-infrastructure") {
    return `<img alt="" src="https://video-ads-module.ad-tech.nbcuni.com/v1/freewheel-params">`;
  }
  if (caseName === "third-party-cookie-positive") {
    return `<img alt="" src="https://googleads.g.doubleclick.net/pagead/cookie">`;
  }
  if (caseName === "unresolved-collection-endpoint") {
    return `<img alt="" src="https://collector.example.net/collect?event=fixture">`;
  }
  if (caseName === "region-coded-collection-endpoint") {
    return `<img alt="" src="https://collector.us-east-1.amazonaws.com/collect">`;
  }
  return "";
}

function consentFlowHomeMarkup(caseName: StaticFixturePage): string {
  const options = {
    simple: caseName === "consent-simple-accept-reject",
    persists: caseName === "consent-tracking-persists-after-reject",
    acceptOnly: caseName === "consent-accept-only-activation",
    noReject: caseName === "consent-no-reject",
    privacyChoiceOnly: caseName === "consent-privacy-choice-only",
    privacyOptOutAdComparison: caseName === "consent-privacy-opt-out-ad-comparison",
    privacyOptOutRadioFormAdComparison: caseName === "consent-privacy-opt-out-radio-form-ad-comparison",
    focusedPrivacyOptOut: caseName === "consent-focused-privacy-opt-out",
    ambiguous: caseName === "consent-ambiguous-controls",
    acceptEssential: caseName === "consent-accept-essential",
    manage: caseName === "consent-manage-preferences",
    preferenceAmbiguous: caseName === "consent-preference-center-ambiguous",
    preferenceConfirmSave: caseName === "consent-preference-center-confirm-save",
    postChoiceReopen: caseName === "consent-post-choice-reopen-control",
    preferenceSuccess: caseName === "consent-preference-center-reject-success",
    preferenceToggleSave: caseName === "consent-preference-center-toggle-save",
    cmpCookie: caseName === "consent-cmp-cookie-persists",
    denyNonEssential: caseName === "consent-deny-non-essential",
    analyticsCookie: caseName === "consent-analytics-cookie-persists",
    failedClick: caseName === "consent-banner-failed-click",
    statefulClick: caseName === "consent-banner-stateful-click",
    iframeReject: caseName === "consent-iframe-reject",
    privacyChoiceSurfaceRejectSuccess: caseName === "consent-privacy-choice-surface-reject-success",
    leanGuardedImageCookie: caseName === "consent-lean-guarded-image-cookie",
    navigationTimeout: caseName === "consent-navigation-timeout",
  };
  if (options.privacyOptOutAdComparison || options.privacyOptOutRadioFormAdComparison || options.focusedPrivacyOptOut) {
    const radioForm = options.privacyOptOutRadioFormAdComparison || options.focusedPrivacyOptOut
      ? `
          <form id="privacy-form">
            <h2>Privacy Settings</h2>
            <p>California Privacy Rights Act Right to Opt Out. You may opt out of sale or sharing of personal information.</p>
            <fieldset>
              <legend>Choose an option:</legend>
              <label><input type="radio" name="cpra-choice" value="opt-in" checked> Accept Standard Advertising Settings (Opt In)</label>
              <label><input type="radio" name="cpra-choice" value="opt-out"> Do Not Sell or Share My Personal Information (Opt Out)</label>
            </fieldset>
            <button id="save" type="button">Save</button>
            <p id="status">You opted in</p>
          </form>
        `
      : '<h2>Your Privacy Choices</h2><p>California consumer privacy request form. Opt out of sale or share and targeted advertising.</p><button id="save" type="button">Submit Do Not Sell or Share Request</button><p id="status"></p>';
    return `
      <section>
        <p>Consent-flow fixture page with a separate CCPA privacy choices surface.</p>
      </section>
      <script>
        const privacyMode = new URLSearchParams(location.search).has("privacy");
        function adTrack(label) {
          const img = new Image();
          img.alt = "";
          img.src = "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123?label=" + encodeURIComponent(label);
          document.body.appendChild(img);
        }
        if (!privacyMode) {
          adTrack("baseline");
        } else {
          const panel = document.createElement("section");
          panel.id = "privacy-choice-panel";
          panel.setAttribute("role", "dialog");
          panel.setAttribute("aria-label", "Your Privacy Choices");
          panel.innerHTML = ${JSON.stringify(radioForm)};
          document.body.appendChild(panel);
          document.getElementById("save")?.addEventListener("click", () => {
            const selected = document.querySelector("input[name='cpra-choice']:checked");
            if (!selected || selected.value === "opt-out") {
              localStorage.setItem("ccpa-opt-out-state", "do-not-sell-share");
              localStorage.setItem("ccpa-opt-out-saved", "true");
              panel.innerHTML = '<h2>Your Privacy Choices</h2><p>Request received. Your opt-out choices were saved for sale or share and targeted advertising.</p><p>You opted out</p>';
            }
          });
        }
      </script>
    `;
  }
  if (options.privacyChoiceSurfaceRejectSuccess) {
    return `
      <section>
        <p>Consent-flow fixture page with a footer privacy control that opens a preference surface.</p>
      </section>
      <footer>
        <button id="privacy-choice" type="button">Your Privacy Choices</button>
      </footer>
      <script>
        function track(label) {
          const img = new Image();
          img.alt = "";
          img.src = "https://www.google-analytics.com/g/collect?v=2&tid=G-CONSENT&en=" + encodeURIComponent(label);
          document.body.appendChild(img);
        }
        document.getElementById("privacy-choice")?.addEventListener("click", () => {
          if (document.getElementById("preference-center")) return;
          const panel = document.createElement("section");
          panel.id = "preference-center";
          panel.setAttribute("role", "dialog");
          panel.setAttribute("aria-label", "Quantcast Choice Privacy Preferences");
          panel.innerHTML = '<h2>Quantcast Choice Privacy Preferences</h2><p>Manage consent for targeted advertising, sale or share, and analytics cookies.</p><button id="pc-reject-all" type="button">Opt out</button><button id="pc-accept-all" type="button">Accept All</button><button id="pc-save" type="button">Save Choices</button>';
          document.body.appendChild(panel);
          document.getElementById("pc-reject-all")?.addEventListener("click", () => {
            localStorage.setItem("qc-consent-state", "rejected");
          });
          document.getElementById("pc-accept-all")?.addEventListener("click", () => {
            localStorage.setItem("qc-consent-state", "accepted");
            document.cookie = "_ga=fixture; Path=/; SameSite=Lax";
            track("accept");
            document.getElementById("preference-center")?.remove();
          });
          document.getElementById("pc-save")?.addEventListener("click", () => {
            document.getElementById("preference-center")?.remove();
          });
        });
      </script>
    `;
  }
  if (options.iframeReject) {
    const iframeHtml = `<div id="banner" role="dialog" aria-label="OneTrust Cookie consent"><p>OneTrust Cookie Preferences. We use cookies for analytics and advertising.</p><button id="reject-all" type="button">Reject All</button><button id="accept-all" type="button">Accept All</button><script>localStorage.setItem("OptanonConsentState","visible");document.getElementById("reject-all").addEventListener("click",()=>{localStorage.setItem("OptanonConsentState","rejected");document.getElementById("banner").remove();});document.getElementById("accept-all").addEventListener("click",()=>{localStorage.setItem("OptanonConsentState","accepted");document.getElementById("banner").remove();});</script></div>`;
    return `
      <section>
        <p>Consent-flow fixture page with iframe-hosted CMP controls.</p>
      </section>
      <iframe id="cmp-frame" title="OneTrust Cookie Settings" srcdoc="${escapeHtml(iframeHtml)}"></iframe>
    `;
  }
  const preferenceOnly = options.preferenceAmbiguous || options.preferenceConfirmSave || options.preferenceSuccess || options.preferenceToggleSave;
  const rejectLabel = options.denyNonEssential ? "Deny Non-Essential" : "Reject All";
  const rejectButton = options.noReject || options.ambiguous || options.privacyChoiceOnly || options.acceptEssential || preferenceOnly
    ? ""
    : `<button id="reject-all" type="button">${rejectLabel}</button>`;
  const privacyChoiceButton = options.privacyChoiceOnly
    ? `<button id="privacy-choice" type="button">Do not sell or share my personal information</button>`
    : "";
  const acceptButton = options.acceptEssential
    ? `<button id="accept-essential" type="button">Accept Essential</button>`
    : options.ambiguous
    ? `<button id="continue" type="button">Continue</button>`
    : `<button id="accept-all" type="button">Accept All</button>`;
  const manageButton = options.manage || options.ambiguous || preferenceOnly
    ? `<button id="settings" type="button">Settings</button>`
    : "";
  const postChoiceFooter = options.postChoiceReopen
    ? `<footer><button id="post-choice-settings" type="button">Cookie Settings</button></footer>`
    : "";
  return `
    <section>
      <p>Consent-flow fixture page.</p>
    </section>
    <div id="banner" role="dialog" aria-label="Cookie consent">
      <p>We use cookies for analytics and advertising. Choose your consent setting.</p>
      ${acceptButton}
      ${rejectButton}
      ${manageButton}
      ${privacyChoiceButton}
    </div>
    ${postChoiceFooter}
    <script>
      const mode = ${JSON.stringify(caseName)};
      function track(label) {
        const img = new Image();
        img.alt = "";
        img.src = "https://www.google-analytics.com/g/collect?v=2&tid=G-CONSENT&en=" + encodeURIComponent(label);
        document.body.appendChild(img);
      }
      if (mode === "consent-lean-guarded-image-cookie") {
        const noise = new Image();
        noise.alt = "";
        noise.src = "/fixture-noise-image.gif?decorative=1";
        document.body.appendChild(noise);
      }
      function hideBanner() {
        const banner = document.getElementById("banner");
        if (banner && mode !== "consent-banner-failed-click" && mode !== "consent-banner-stateful-click") banner.remove();
      }
      if (mode === "consent-tracking-persists-after-reject") track("preload");
      if (mode === "consent-cmp-cookie-persists") document.cookie = "OptanonConsent=fixture; Path=/; SameSite=Lax";
      if (mode === "consent-analytics-cookie-persists") document.cookie = "_ga=fixture; Path=/; SameSite=Lax";
      if (mode === "consent-preference-center-reject-success") localStorage.setItem("OptanonConsentState", "visible");
      document.getElementById("accept-all")?.addEventListener("click", () => {
        document.cookie = "_ga=fixture; Path=/; SameSite=Lax";
        track("accept");
        hideBanner();
      });
      document.getElementById("accept-essential")?.addEventListener("click", () => {
        localStorage.setItem("essential-consent-state", "essential-only");
        hideBanner();
      });
      document.getElementById("reject-all")?.addEventListener("click", () => {
        if (mode === "consent-tracking-persists-after-reject") track("reject");
        if (mode === "consent-lean-guarded-image-cookie") {
          const consentPixel = new Image();
          consentPixel.alt = "";
          consentPixel.src = "/cmp/consent-pixel.gif?consent=reject";
          document.body.appendChild(consentPixel);
          localStorage.setItem("OptanonConsentState", "rejected");
        }
        if (mode === "consent-banner-stateful-click") {
          document.cookie = "OptanonAlertBoxClosed=fixture; Path=/; SameSite=Lax";
          localStorage.setItem("OptanonConsentState", "rejected");
        }
        hideBanner();
      });
      document.getElementById("continue")?.addEventListener("click", () => {
        track("ambiguous");
        hideBanner();
      });
      function openPreferenceCenter() {
        document.getElementById("banner")?.setAttribute("data-preferences-open", "true");
        if (mode !== "consent-preference-center-reject-success" && mode !== "consent-preference-center-ambiguous" && mode !== "consent-preference-center-toggle-save" && mode !== "consent-preference-center-confirm-save" && mode !== "consent-post-choice-reopen-control") return;
        const existing = document.getElementById("preference-center");
        if (existing) return;
        const panel = document.createElement("section");
        panel.id = "preference-center";
        panel.setAttribute("aria-label", "Cookie preferences");
        panel.innerHTML = mode === "consent-preference-center-reject-success"
          ? '<h2>OneTrust Cookie Preferences</h2><label><input type="checkbox" checked> Analytics cookies</label><label><input type="checkbox" checked> Advertising cookies</label><button id="pc-reject-all" type="button">Reject All</button><button id="pc-save" type="button">Save Choices</button>'
            : mode === "consent-preference-center-toggle-save"
              ? '<h2>Cookie Preferences</h2><label><input type="checkbox" checked> Analytics cookies</label><label><input type="checkbox" checked> Advertising cookies</label><button id="pc-save" type="button">Save Choices</button>'
            : mode === "consent-preference-center-confirm-save"
              ? '<h2>Cookie Preferences</h2><label><input type="checkbox" checked> Analytics cookies</label><label><input type="checkbox" checked> Advertising cookies</label><button id="pc-save" type="button">Confirm My Choice</button>'
              : mode === "consent-post-choice-reopen-control"
                ? '<h2>Cookie Preferences</h2><p>Manage analytics and advertising cookies.</p><button id="pc-save" type="button">Save Choices</button>'
              : '<h2>Cookie Preferences</h2><label><input type="checkbox" checked> Analytics cookies</label><label><input type="checkbox" checked> Advertising cookies</label><button id="pc-continue" type="button">Continue</button><button id="pc-later" type="button">Maybe Later</button>';
        (document.getElementById("banner") ?? document.body).appendChild(panel);
        document.getElementById("pc-reject-all")?.addEventListener("click", () => {
          document.querySelectorAll("#preference-center input[type=checkbox]").forEach((input) => { input.checked = false; });
        });
        document.getElementById("pc-save")?.addEventListener("click", () => {
          if (mode === "consent-preference-center-reject-success") localStorage.setItem("OptanonConsentState", "rejected");
          hideBanner();
        });
      }
      document.getElementById("settings")?.addEventListener("click", openPreferenceCenter);
      document.getElementById("post-choice-settings")?.addEventListener("click", openPreferenceCenter);
    </script>
  `;
}

function policyHomeMarkup(caseName: StaticFixturePage): string {
  const links: Record<string, string> = {
    "policy-ai-disclosure": `<a href="/policies/ai">AI disclosures</a>`,
    "policy-article13-long": `<a href="/policies/article13-long">Privacy Policy</a>`,
    "policy-ambiguous-choices": `<a href="/privacy-choices">Your Choices</a>`,
    "policy-broken-link": `<a href="/policies/missing-privacy">Privacy Policy</a>`,
    "policy-cookie-link": `<a href="/policies/cookies">Cookie Policy</a>`,
    "policy-do-not-sell-link": `<a href="/do-not-sell-or-share">Do Not Sell or Share My Personal Information</a>`,
    "policy-external-choice-platform": `<a href="/privacy-control/onetrust/choices">Your Privacy Choices</a>`,
    "policy-footer-privacy-delayed": `<span id="delayed-footer-anchor"></span><script>setTimeout(() => { document.getElementById("delayed-footer-anchor").outerHTML = '<a href="/policies/privacy">Privacy Policy</a>'; }, 250);</script>`,
    "policy-global-footer-delayed": `<span id="delayed-global-footer"></span><script>setTimeout(() => { document.getElementById("delayed-global-footer").outerHTML = '<a href="/policies/privacy">Privacy Policy</a><a href="/policies/cookies">Cookie Policy</a><a href="/privacy-center">Privacy Center</a><a href="/do-not-sell-or-share">Do Not Sell or Share My Personal Information</a>'; }, 250);</script>`,
    "policy-gold-caltech-common-path": `<a href="/about">About Caltech</a><a href="/terms">Terms</a>`,
    "policy-gold-ford-secondary-only": `<a href="/accessibility">Accessibility</a><a href="/terms">Terms</a>`,
    "policy-gold-ikea-common-path": `<a href="/terms">Terms</a><a href="/accessibility">Accessibility</a>`,
    "policy-gold-latimes-secondary-only": `<a href="/gift-subscription-terms">Gift Subscription Terms</a><a href="/subscriber-terms-and-conditions">Subscriber Terms and Conditions</a><a href="/b2b/ai-technology">AI Technology</a>`,
    "policy-gold-nvidia-secondary-only": `<a href="/en-us/ai-data-science/">AI Data Science</a><a href="/en-eu/gtc/pricing/?nvid=fixture">GTC Pricing</a>`,
    "policy-gold-privacy-duplicates": `<a href="/privacy-policy">Privacy Policy</a><a href="/privacy-policy/">Privacy Policy</a>`,
    "policy-footer-privacy": `<a href="/policies/privacy">Privacy Policy</a>`,
    "policy-gpc-disclosure-late": `<a href="/policies/gpc-late">Privacy Policy</a>`,
    "policy-gpc-disclosure": `<a href="/policies/gpc">Privacy Notice</a>`,
    "policy-generic-links": `<a href="/products">Products</a><a href="/about">About us</a>`,
    "policy-link-aria-title": `<a href="/policies/privacy" aria-label="Privacy Policy" title="Privacy Policy"></a>`,
    "policy-latimes-footer-surfaces": [
      `<a href="/privacy-policy">Privacy Policy</a>`,
      `<a href="/terms">Terms of Service</a>`,
      `<a href="/do-not-sell-or-share">Do Not Sell or Share My Personal Information</a>`,
    ].join(" | "),
    "policy-privacy-center-link": `<a href="/privacy-center">Privacy Center</a>`,
    "policy-retention-rights-only": `<a href="/policies/rights-only">Privacy Policy</a>`,
    "policy-state-privacy-rights-link": `<a href="/state-privacy-rights">State Privacy Rights</a>`,
    "policy-cmp-preference-control": `<button id="ot-sdk-btn" type="button" aria-label="Cookie Settings">Cookie Settings</button>`,
    "policy-manage-cookies-footer-control": `<main><p>News homepage</p></main><footer><button id="manage-cookies" type="button">Manage Cookies+</button></footer>`,
    "policy-manage-cookies-footer-anchor": `<main><p>News homepage</p></main><footer><a href="#" id="manage-cookies">Manage Cookies</a></footer>`,
    "policy-manage-cookies-embedded-config": `<main><p>News homepage</p></main><script>window.CONSENT_CONFIG={consentLinkTitle:{en:"Manage Cookies+"},privacyCenterLinkTitle:{en:"Privacy Policy"}};</script>`,
    "policy-no-links": "",
    "policy-notice-at-collection-link": `<a href="/notice-at-collection">Notice at Collection</a>`,
    "policy-onetrust-index-json": `<a href="/policies/onetrust-index-shell">Privacy Policy</a>`,
    "policy-onetrust-notice-json": `<a href="/policies/onetrust-shell">Privacy Policy</a>`,
    "policy-privacy-choices-link": `<a href="/privacy-choices">Your Privacy Choices</a>`,
    "policy-session-replay-disclosure": `<a href="/policies/session-replay">Privacy Notice</a>`,
    "policy-vendor-mentions": `<a href="/policies/vendors">Privacy Policy</a>`,
    "policy-webmd-like-secondary-surfaces": `<a href="/policies/webmd-like-privacy">Privacy Policy</a>`,
  };
  return `
    <section>
      <p>Fixture storefront homepage with bounded footer policy links for scanner calibration.</p>
    </section>
    <footer>
      ${links[caseName] ?? ""}
    </footer>
  `;
}

function policyDocumentHtml(pathname: string): string | undefined {
  const docs: Record<string, { title: string; body: string }> = {
    "/policies/privacy": {
      title: "Privacy Policy",
      body: "Last updated: May 1, 2026. We use cookies for analytics and advertising. Our service providers include Google Analytics and Meta for measurement and advertising. You may contact privacy@example.test with questions.",
    },
    "/policies/article13-long": {
      title: "Privacy Policy",
      body: [
        "Privacy Policy. We use personal data to provide services, personalize content, measure performance, and improve security.",
        "You can contact the controller at privacy@example.test or by writing to the privacy team.",
        "Filler section one describes product operations, account preferences, support workflows, website diagnostics, and other neutral site functionality in deliberately verbose language so the later Article 13 sections are not adjacent to the opening privacy notice text.",
        "Filler section two repeats neutral operational context about pages, public content, help center links, service availability, communications, preferences, and account administration without adding the disclosure keywords needed by the test.",
        "Filler section three adds more bounded but non-sensitive text to force the scanner to retain a policy excerpt longer than one thousand characters while still staying far below full-policy retention.",
        "We rely on consent, contract, legal obligation, and legitimate interests as lawful bases for processing depending on context.",
        "Recipients include service providers, processors, analytics providers, advertising partners, and affiliates that help us operate the service.",
        "We retain personal data only as long as necessary for the purposes described in this notice or as required by law.",
        "You may exercise rights to access, rectification, erasure, restriction, portability, and objection by contacting the privacy team.",
        "We may transfer personal data outside the European Economic Area using adequacy decisions or standard contractual clauses.",
        "You may complain to a supervisory authority, and our data protection officer can be contacted through the privacy office.",
      ].join(" "),
    },
    "/privacy": {
      title: "Privacy Policy",
      body: "Last updated: May 1, 2026. We use cookies for analytics and advertising. Our service providers include Google Analytics and Meta for measurement and advertising.",
    },
    "/privacy-policy": {
      title: "Privacy Policy",
      body: "Effective date: May 1, 2026. We describe cookies, analytics, advertising, and privacy choices for visitors.",
    },
    "/privacy-policy/": {
      title: "Privacy Policy",
      body: "Effective date: May 1, 2026. We describe cookies, analytics, advertising, and privacy choices for visitors.",
    },
    "/privacy-notice": {
      title: "Privacy Notice",
      body: "Caltech Privacy Notice. We describe the personal information we collect, the purposes for processing, cookies, analytics, and privacy contact information.",
    },
    "/help/privacy": {
      title: "Privacy Policy",
      body: "Ford Privacy Policy. We explain how we collect, use, disclose, and retain personal information. We use cookies and analytics, and privacy choices are available.",
    },
    "/global/en/legal/privacy-cookie-statement": {
      title: "Privacy and Cookie Statement",
      body: "IKEA Privacy and Cookie Statement. We use cookies, analytics, advertising identifiers, and similar technologies. Cookie settings and privacy choices are available.",
    },
    "/global/en/legal/privacy-cookie-statement/": {
      title: "Privacy and Cookie Statement",
      body: "IKEA Privacy and Cookie Statement. We use cookies, analytics, advertising identifiers, and similar technologies. Cookie settings and privacy choices are available.",
    },
    "/en-us/about-nvidia/privacy-policy": {
      title: "NVIDIA Privacy Policy",
      body: "NVIDIA Privacy Policy. We describe personal data collection, cookies, analytics, advertising, privacy choices, and contact information.",
    },
    "/en-us/about-nvidia/privacy-policy/": {
      title: "NVIDIA Privacy Policy",
      body: "NVIDIA Privacy Policy. We describe personal data collection, cookies, analytics, advertising, privacy choices, and contact information.",
    },
    "/en-us/about-nvidia/privacy-center": {
      title: "NVIDIA Privacy Center",
      body: "NVIDIA Privacy Center. Visitors can manage privacy choices and cookie preferences.",
    },
    "/en-us/about-nvidia/privacy-center/": {
      title: "NVIDIA Privacy Center",
      body: "NVIDIA Privacy Center. Visitors can manage privacy choices and cookie preferences.",
    },
    "/policies/rights-only": {
      title: "Privacy Policy",
      body: "Privacy Policy. You have the right to access, delete, erase, rectify, restrict, port, or object to certain processing of your personal data. Contact privacy@example.test to exercise your rights.",
    },
    "/policies/cookies": {
      title: "Cookie Policy",
      body: "Cookie Policy. We use cookies, analytics cookies, advertising cookies, cookie settings, and cookie preferences. You may withdraw consent through manage preferences.",
    },
    "/cookie-policy": {
      title: "Cookie Policy",
      body: "Cookie Policy. Cookies, analytics, advertising, and cookie settings are described here.",
    },
    "/privacy-choices": {
      title: "Your Privacy Choices",
      body: "Your Privacy Choices. You may opt out of sale or share, targeted advertising, and interest-based advertising. Global Privacy Control signals are honored where required.",
    },
    "/state-privacy-rights": {
      title: "State Privacy Rights",
      body: "State Privacy Rights. California and other state residents may access, delete, correct, and opt out of sale or share of personal information and targeted advertising.",
    },
    "/privacy-center": {
      title: "Privacy Center",
      body: "Privacy Center. Visitors can review privacy settings, manage cookie preferences, and find privacy choices.",
    },
    "/privacy-control/onetrust/choices": {
      title: "Your Privacy Choices",
      body: "Your Privacy Choices preference center. This simulated OneTrust control lets visitors opt out of sale or share and manage cookie preferences.",
    },
    "/do-not-sell-or-share": {
      title: "Do Not Sell or Share",
      body: "Do Not Sell or Share My Personal Information. California residents can opt out of sale or share of personal information and targeted advertising.",
    },
    "/notice-at-collection": {
      title: "Notice at Collection",
      body: "Notice at Collection. We collect identifiers, commercial information, internet activity, sensitive personal information, and retain data for stated business purposes.",
    },
    "/policies/vendors": {
      title: "Privacy Policy Vendors",
      body: "Our advertising and analytics partners may include Google Analytics, Google Ads, DoubleClick, Meta, Microsoft Clarity, Hotjar, FullStory, LiveRamp, The Trade Desk, Taboola, Outbrain, OneTrust, Cookiebot, Didomi, and TrustArc.",
    },
    "/policies/webmd-like-privacy": {
      title: "Privacy Policy",
      body: "Privacy Policy. We use cookies and targeted advertising. Please review our Cookie Policy and State Privacy Policy for privacy choices.",
    },
    "/policies/webmd-like-state-privacy": {
      title: "State Privacy Policy",
      body: "State Privacy Policy. Information we collect includes identifiers, internet activity, and sensitive personal information. Categories of sources and business purposes are described here. You may opt out by selecting your preferences within the cookie banner, by clicking the Do Not Sell or Share My Personal Information link, or by enabling an opt-out preference signal in your browser. The cookie banner will automatically read such signals and comply with your preferences for targeted advertising choices.",
    },
    "/policies/webmd-like-cookie-policy": {
      title: "Cookie Policy",
      body: "Cookie Policy. We use cookies, analytics cookies, advertising cookies, cookie settings, and privacy choices for interest-based advertising.",
    },
    "/policies/gpc": {
      title: "Privacy Notice",
      body: "Global Privacy Control. We process GPC opt-out preference signals as a request to opt out of sale or share and targeted advertising.",
    },
    "/policies/gpc-late": {
      title: "Privacy Policy",
      body: [
        "Last updated: May 1, 2026. We use cookies for analytics and advertising.",
        "Our service providers include Google Analytics and Meta for measurement and advertising.",
        "This neutral policy overview paragraph is intentionally long so the first cookie and advertising terms appear far away from the later opt-out preference signal language used for excerpt anchoring.",
        "Additional neutral text describes account settings, contact methods, service operations, retention, and ordinary website functionality without adding another privacy-control phrase.",
        "Global Privacy Control signals are processed as opt-out preference signals for sale or share and targeted advertising choices.",
      ].join(" "),
    },
    "/policies/session-replay": {
      title: "Privacy Notice",
      body: "We may use session replay and behavioral analytics tools to understand how visitors use pages and forms. You may opt out through cookie settings.",
    },
    "/policies/ai": {
      title: "AI Disclosures",
      body: "Artificial intelligence features may summarize account content. Some output may include AI-generated content and automated decision support for internal operations.",
    },
    "/b2b/ai-technology": {
      title: "AI Technology",
      body: "AI technology information for advertisers and newsroom partners.",
    },
    "/en-us/ai-data-science": {
      title: "AI Data Science",
      body: "NVIDIA AI data science product information.",
    },
    "/en-us/ai-data-science/": {
      title: "AI Data Science",
      body: "NVIDIA AI data science product information.",
    },
    "/en-eu/gtc/pricing/": {
      title: "GTC Pricing",
      body: "Conference pricing and registration terms.",
    },
    "/gift-subscription-terms": {
      title: "Gift Subscription Terms",
      body: "Gift subscription terms for this fixture publisher.",
    },
    "/subscriber-terms-and-conditions": {
      title: "Subscriber Terms and Conditions",
      body: "Subscriber terms and conditions for this fixture publisher.",
    },
    "/policies/onetrust-shell": {
      title: "WBD Privacy Center b2c",
      body: "Processing Error. Close Privacy Center. Our Privacy Approach Privacy Policy Terms of Use Cookie Settings. OneTrust NoticeApi LoadNotices shell.",
    },
    "/policies/onetrust-index-shell": {
      title: "WBD Privacy Center b2c",
      body: "Processing Error. Close Privacy Center. Our Privacy Approach Privacy Policy Terms of Use Cookie Settings. OneTrust NoticeApi LoadNotices index shell.",
    },
    "/policies/onetrust-final-shell": {
      title: "en-us | WBD Privacy Center",
      body: "Processing Error. Close Privacy Center. Nested OneTrust NoticeApi LoadNotices shell.",
    },
    "/accessibility": {
      title: "Accessibility Statement",
      body: "Accessibility statement. Contact us if you experience barriers accessing our public website.",
    },
    "/terms": {
      title: "Terms",
      body: "Terms of use for this fixture site.",
    },
  };
  const doc = docs[pathname];
  if (!doc) {
    return undefined;
  }
  if (pathname === "/policies/onetrust-shell") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
    <script>window.OneTrust = { NoticeApi: { LoadNotices() {} } }; OneTrust.NoticeApi.LoadNotices(["/onetrust/notice-shell.json"], true, "en-us", "false");</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/onetrust-index-shell") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
    <script>window.OneTrust = { NoticeApi: { LoadNotices() {} } }; OneTrust.NoticeApi.LoadNotices(["/onetrust/index-manifest.json"], true, "en-us", "false");</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/onetrust-final-shell") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
    <script>window.OneTrust = { NoticeApi: { LoadNotices() {} } }; OneTrust.NoticeApi.LoadNotices(["/onetrust/final-manifest.json"], true, "en-us", "false");</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/webmd-like-privacy") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
      <p><a href="/policies/webmd-like-cookie-policy">Cookie Policy</a></p>
      <p><a href="/policies/webmd-like-state-privacy">State Privacy Policy</a></p>
    </main>
  </body>
</html>`;
  }
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
      <p>This long filler paragraph exists only to prove the scanner keeps a bounded excerpt instead of storing the entire policy page in ReviewResult. Additional neutral fixture text repeats operational details without user-specific values or raw form data.</p>
    </main>
  </body>
</html>`;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
