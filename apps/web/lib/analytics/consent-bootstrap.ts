import { ANALYTICS_CONSENT_STORAGE_KEY, type AnalyticsConsentChoice, getGoogleConsentModeState } from "./consent-shared";

const DEFAULT_CONSENT = getGoogleConsentModeState("denied");
const GRANTED_CONSENT = getGoogleConsentModeState("granted");

function serializeConsentState(state: ReturnType<typeof getGoogleConsentModeState>) {
  return JSON.stringify(state).replace(/</g, "\\u003c");
}

export function buildConsentBootstrapScript(googleTagId: string) {
  const safeGoogleTagId = JSON.stringify(googleTagId);
  const defaultConsent = serializeConsentState(DEFAULT_CONSENT);
  const grantedConsent = serializeConsentState(GRANTED_CONSENT);
  const storageKey = JSON.stringify(ANALYTICS_CONSENT_STORAGE_KEY);

  return `
    (function(w,d){
      var storageKey = ${storageKey};
      var googleTagId = ${safeGoogleTagId};
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

      w.certscoreLoadGoogleTag = loadGoogleTag;

      if (storedChoice === 'granted') {
        loadGoogleTag();
      }
    })(window,document);
  `;
}

export function isAnalyticsConsentChoice(value: unknown): value is AnalyticsConsentChoice {
  return value === "granted" || value === "denied";
}
