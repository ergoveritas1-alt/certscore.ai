import { ANALYTICS_CONSENT_STORAGE_KEY, type AnalyticsConsentChoice, getGoogleConsentModeState } from "./consent-shared";

const DEFAULT_CONSENT = getGoogleConsentModeState("denied");
const GRANTED_CONSENT = getGoogleConsentModeState("granted");

function serializeConsentState(state: ReturnType<typeof getGoogleConsentModeState>) {
  return JSON.stringify(state).replace(/</g, "\\u003c");
}

export function buildConsentBootstrapScript(googleTagId: string, umami?: {
  domains?: string[];
  scriptUrl: string;
  websiteId: string;
}) {
  const safeGoogleTagId = JSON.stringify(googleTagId);
  const safeUmamiDomains = JSON.stringify(umami?.domains?.join(",") ?? "");
  const safeUmamiScriptUrl = JSON.stringify(umami?.scriptUrl ?? "");
  const safeUmamiWebsiteId = JSON.stringify(umami?.websiteId ?? "");
  const defaultConsent = serializeConsentState(DEFAULT_CONSENT);
  const grantedConsent = serializeConsentState(GRANTED_CONSENT);
  const storageKey = JSON.stringify(ANALYTICS_CONSENT_STORAGE_KEY);

  return `
    (function(w,d){
      var storageKey = ${storageKey};
      var googleTagId = ${safeGoogleTagId};
      var umamiDomains = ${safeUmamiDomains};
      var umamiScriptUrl = ${safeUmamiScriptUrl};
      var umamiWebsiteId = ${safeUmamiWebsiteId};
      var defaultConsent = ${defaultConsent};
      var grantedConsent = ${grantedConsent};
      var storedChoice = null;

      w.dataLayer = w.dataLayer || [];
      w.gtag = w.gtag || function(){ w.dataLayer.push(arguments); };
      w.gtag('consent', 'default', defaultConsent);

      try {
        storedChoice = w.localStorage && w.localStorage.getItem(storageKey);
      } catch (error) {
        storedChoice = null;
      }

      w.certscoreAnalyticsConsent = storedChoice === 'granted' ? 'granted' : 'denied';

      function loadGoogleTag(){
        if (w.certscoreAnalyticsConsent !== 'granted' || w.certscoreGoogleTagLoaded || !googleTagId) {
          return;
        }

        w.certscoreGoogleTagLoaded = true;
        w.gtag('consent', 'update', grantedConsent);

        var firstScript = d.getElementsByTagName('script')[0];
        var script = d.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + googleTagId;
        firstScript.parentNode.insertBefore(script, firstScript);

        w.gtag('js', new Date());
        w.gtag('config', googleTagId);
      }

      function loadUmami(){
        if (w.certscoreAnalyticsConsent !== 'granted' || w.certscoreUmamiLoaded || !umamiScriptUrl || !umamiWebsiteId) {
          return;
        }

        w.certscoreUmamiLoaded = true;
        w.certscoreUmamiEventQueue = w.certscoreUmamiEventQueue || [];

        w.certscoreBeforeUmamiSend = function(type, payload){
          if (w.certscoreAnalyticsConsent !== 'granted' || !payload || typeof payload !== 'object') {
            return false;
          }

          var sanitized = Object.assign({}, payload);
          var rawUrl = typeof sanitized.url === 'string' ? sanitized.url : '/';
          var pathname = rawUrl.split('?')[0].split('#')[0] || '/';
          try {
            pathname = new URL(rawUrl, w.location.origin).pathname;
          } catch (error) {
            pathname = '/';
          }

          var sensitiveRoutes = [
            [new RegExp('^/preview/[^/]+'), '/preview/:scan'],
            [new RegExp('^/scan/[^/]+'), '/scan/:scan'],
            [new RegExp('^/browser-scans/[^/]+'), '/browser-scans/:scan'],
            [new RegExp('^/app/scans/[^/]+'), '/app/scans/:scan'],
            [new RegExp('^/app/domains/[^/]+'), '/app/domains/:domain'],
            [new RegExp('^/app/admin/scans/[^/]+'), '/app/admin/scans/:scan'],
            [new RegExp('^/app/admin/pulse/[^/]+'), '/app/admin/pulse/:request'],
            [new RegExp('^/monitor-site/status/[^/]+'), '/monitor-site/status/:token'],
            [new RegExp('^/pulse/[^/]+'), '/pulse/:domain']
          ];

          for (var index = 0; index < sensitiveRoutes.length; index += 1) {
            if (sensitiveRoutes[index][0].test(pathname)) {
              pathname = pathname.replace(sensitiveRoutes[index][0], sensitiveRoutes[index][1]);
              break;
            }
          }

          sanitized.url = pathname;
          delete sanitized.title;
          delete sanitized.referrer;
          return sanitized;
        };

        var firstScript = d.getElementsByTagName('script')[0];
        var script = d.createElement('script');
        script.defer = true;
        script.src = umamiScriptUrl;
        script.setAttribute('data-website-id', umamiWebsiteId);
        script.setAttribute('data-do-not-track', 'true');
        script.setAttribute('data-exclude-search', 'true');
        script.setAttribute('data-before-send', 'certscoreBeforeUmamiSend');
        if (umamiDomains) {
          script.setAttribute('data-domains', umamiDomains);
        }
        script.addEventListener('load', function(){
          if (!w.umami || typeof w.umami.track !== 'function') {
            return;
          }

          var queuedEvents = w.certscoreUmamiEventQueue || [];
          w.certscoreUmamiEventQueue = [];
          for (var eventIndex = 0; eventIndex < queuedEvents.length; eventIndex += 1) {
            w.umami.track(queuedEvents[eventIndex].eventName, queuedEvents[eventIndex].properties);
          }
        });
        firstScript.parentNode.insertBefore(script, firstScript);
      }

      function loadAnalytics(){
        loadGoogleTag();
        loadUmami();
      }

      w.certscoreLoadGoogleTag = loadGoogleTag;
      w.certscoreLoadUmami = loadUmami;
      w.certscoreLoadAnalytics = loadAnalytics;

      if (storedChoice === 'granted') {
        loadAnalytics();
      }
    })(window,document);
  `;
}

export function isAnalyticsConsentChoice(value: unknown): value is AnalyticsConsentChoice {
  return value === "granted" || value === "denied";
}
