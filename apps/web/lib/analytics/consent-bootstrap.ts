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

        var firstScript = d.getElementsByTagName('script')[0];
        var script = d.createElement('script');
        script.defer = true;
        script.src = umamiScriptUrl;
        script.setAttribute('data-website-id', umamiWebsiteId);
        script.setAttribute('data-do-not-track', 'true');
        script.setAttribute('data-exclude-search', 'true');
        if (umamiDomains) {
          script.setAttribute('data-domains', umamiDomains);
        }
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
