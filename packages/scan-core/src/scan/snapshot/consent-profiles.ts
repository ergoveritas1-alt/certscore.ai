import type { BrowserContextOptions } from "playwright";

export type ConsentProbeProfile = {
  contextOptions: BrowserContextOptions;
  name: string;
};

const MOBILE_SAFARI_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

export const CONSENT_PROBE_PROFILES: ConsentProbeProfile[] = [
  {
    name: "desktop_default",
    contextOptions: {}
  },
  {
    name: "desktop_us",
    contextOptions: {
      extraHTTPHeaders: {
        "accept-language": "en-US,en;q=0.9"
      },
      geolocation: {
        latitude: 37.7749,
        longitude: -122.4194
      },
      locale: "en-US",
      permissions: ["geolocation"],
      timezoneId: "America/Los_Angeles"
    }
  },
  {
    name: "desktop_eu",
    contextOptions: {
      extraHTTPHeaders: {
        "accept-language": "en-GB,en;q=0.9"
      },
      geolocation: {
        latitude: 53.3498,
        longitude: -6.2603
      },
      locale: "en-GB",
      permissions: ["geolocation"],
      timezoneId: "Europe/Dublin"
    }
  },
  {
    name: "mobile_us",
    contextOptions: {
      deviceScaleFactor: 3,
      extraHTTPHeaders: {
        "accept-language": "en-US,en;q=0.9"
      },
      geolocation: {
        latitude: 34.0522,
        longitude: -118.2437
      },
      hasTouch: true,
      isMobile: true,
      locale: "en-US",
      permissions: ["geolocation"],
      timezoneId: "America/Los_Angeles",
      userAgent: MOBILE_SAFARI_USER_AGENT,
      viewport: {
        width: 390,
        height: 844
      }
    }
  }
];

export function getConsentProbeProfiles() {
  return CONSENT_PROBE_PROFILES;
}

export function getPrimaryConsentProbeProfile(): ConsentProbeProfile {
  return getConsentProbeProfiles().find((profile) => profile.name === "desktop_us") ?? { name: "desktop_default", contextOptions: {} };
}

export function getSelectedConsentProbeProfiles(profileSweepEnabled: boolean | undefined): ConsentProbeProfile[] {
  if (profileSweepEnabled === false) {
    return [getPrimaryConsentProbeProfile()];
  }

  return getConsentProbeProfiles();
}
