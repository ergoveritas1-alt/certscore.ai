import { ANALYTICS_CONSENT_STORAGE_KEY, type AnalyticsConsentChoice, getGoogleConsentModeState } from "./consent-shared";

const DEFAULT_CONSENT = getGoogleConsentModeState("denied");
const GRANTED_CONSENT = getGoogleConsentModeState("granted");

function serializeConsentState(state: ReturnType<typeof getGoogleConsentModeState>) {
  return JSON.stringify(state).replace(/</g, "\\u003c");
}

export function buildConsentBootstrapScript(gtmContainerId: string) {
  const safeContainerId = JSON.stringify(gtmContainerId);
  const defaultConsent = serializeConsentState(DEFAULT_CONSENT);
  const grantedConsent = serializeConsentState(GRANTED_CONSENT);
  const storageKey = JSON.stringify(ANALYTICS_CONSENT_STORAGE_KEY);

  return `
    (function(w,d){
      var storageKey = ${storageKey};
      var containerId = ${safeContainerId};
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

      function loadGtm(){
        if (w.certscoreAnalyticsConsent !== 'granted' || w.certscoreGtmLoaded || !containerId) {
          return;
        }

        w.certscoreGtmLoaded = true;
        w.gtag('consent', 'update', grantedConsent);
        w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

        var firstScript = d.getElementsByTagName('script')[0];
        var script = d.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtm.js?id=' + containerId;
        firstScript.parentNode.insertBefore(script, firstScript);
      }

      w.certscoreLoadGtm = loadGtm;

      if (storedChoice === 'granted') {
        loadGtm();
      }
    })(window,document);
  `;
}

export function isAnalyticsConsentChoice(value: unknown): value is AnalyticsConsentChoice {
  return value === "granted" || value === "denied";
}
