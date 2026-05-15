export const ANALYTICS_CONSENT_STORAGE_KEY = "certscore:analytics-consent:v1";
export const ANALYTICS_CONSENT_CHANGE_EVENT = "certscore:analytics-consent-change";

export type AnalyticsConsentChoice = "granted" | "denied";

export type GoogleConsentModeState = {
  ad_personalization: AnalyticsConsentChoice;
  ad_storage: AnalyticsConsentChoice;
  ad_user_data: AnalyticsConsentChoice;
  analytics_storage: AnalyticsConsentChoice;
};

export function getGoogleConsentModeState(choice: AnalyticsConsentChoice): GoogleConsentModeState {
  return {
    ad_personalization: choice,
    ad_storage: choice,
    ad_user_data: choice,
    analytics_storage: choice
  };
}
