import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { buildConsentBootstrapScript } from "./consent-bootstrap";
import { ANALYTICS_CONSENT_STORAGE_KEY, saveAnalyticsConsent } from "./consent";
import {
  pushDataLayerEvent,
  pushDataLayerEventBeforeNavigation,
  pushDataLayerEventOnce
} from "./data-layer";
import { CAMPAIGN_ATTRIBUTION_STORAGE_KEY } from "../attribution/campaign-attribution";

type MockWindow = {
  certscoreAnalyticsConsent?: "granted" | "denied";
  certscoreLoadGoogleTag?: () => void;
  dataLayer?: unknown[];
  dispatchEvent: (event: Event) => boolean;
  gtag?: (...args: unknown[]) => void;
  localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

const storage = new Map<string, string>();

function installWindow(overrides: Partial<MockWindow> = {}) {
  const mockWindow: MockWindow = {
    dataLayer: [],
    dispatchEvent: () => true,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    },
    setTimeout,
    clearTimeout,
    ...overrides
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: mockWindow
  });

  if (typeof globalThis.CustomEvent === "undefined") {
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: class CustomEvent<T = unknown> extends Event {
        detail: T;

        constructor(type: string, eventInitDict?: CustomEventInit<T>) {
          super(type, eventInitDict);
          this.detail = eventInitDict?.detail as T;
        }
      }
    });
  }

  return mockWindow;
}

beforeEach(() => {
  storage.clear();
  installWindow({ certscoreAnalyticsConsent: "denied", dataLayer: [] });
});

test("data-layer events are blocked before analytics consent", () => {
  const mockWindow = installWindow({ certscoreAnalyticsConsent: "denied", dataLayer: [] });

  pushDataLayerEvent({
    event: "pricing_viewed",
    page_path: "/pricing"
  });

  assert.deepEqual(mockWindow.dataLayer, []);
});

test("data-layer events dispatch after analytics consent is granted", () => {
  const gtagCalls: unknown[][] = [];
  const mockWindow = installWindow({ certscoreAnalyticsConsent: "granted", dataLayer: [] });
  mockWindow.gtag = (...args: unknown[]) => {
    gtagCalls.push(args);
  };

  pushDataLayerEvent({
    event: "contact_clicked",
    cta_location: "header"
  });

  assert.deepEqual(mockWindow.dataLayer, [
    {
      event: "contact_clicked",
      cta_location: "header"
    }
  ]);
  assert.deepEqual(gtagCalls, [["event", "contact_clicked", { cta_location: "header" }]]);
});

test("consented events include retained first-touch campaign attribution", () => {
  const mockWindow = installWindow({ certscoreAnalyticsConsent: "granted", dataLayer: [] });
  storage.set(
    CAMPAIGN_ATTRIBUTION_STORAGE_KEY,
    JSON.stringify({
      utm_campaign: "privacy_agency_test",
      utm_medium: "newsletter",
      utm_source: "theadminbar"
    })
  );

  pushDataLayerEvent({
    event: "campaign_landing_page_viewed",
    page_path: "/"
  });

  assert.deepEqual(mockWindow.dataLayer, [
    {
      campaign_attribution: {
        utm_campaign: "privacy_agency_test",
        utm_medium: "newsletter",
        utm_source: "theadminbar"
      },
      event: "campaign_landing_page_viewed",
      page_path: "/"
    }
  ]);
});

test("report CTA events dispatch after analytics consent is granted", () => {
  const mockWindow = installWindow({ certscoreAnalyticsConsent: "granted", dataLayer: [] });

  pushDataLayerEvent({
    event: "report_cta_clicked",
    cta_type: "share"
  });

  assert.deepEqual(mockWindow.dataLayer, [
    {
      event: "report_cta_clicked",
      cta_type: "share"
    }
  ]);
});

test("sample report and pricing CTA events dispatch after analytics consent is granted", () => {
  const mockWindow = installWindow({ certscoreAnalyticsConsent: "granted", dataLayer: [] });

  pushDataLayerEvent({
    event: "sample_report_viewed",
    page_path: "/sample-report"
  });
  pushDataLayerEvent({
    event: "pricing_cta_clicked",
    cta_type: "monitoring",
    plan: "pro"
  });

  assert.deepEqual(mockWindow.dataLayer, [
    {
      event: "sample_report_viewed",
      page_path: "/sample-report"
    },
    {
      event: "pricing_cta_clicked",
      cta_type: "monitoring",
      plan: "pro"
    }
  ]);
});

test("demo CTA events dispatch after analytics consent is granted", () => {
  const mockWindow = installWindow({ certscoreAnalyticsConsent: "granted", dataLayer: [] });

  pushDataLayerEvent({
    event: "hero_book_demo_clicked"
  });
  pushDataLayerEvent({
    event: "hero_sample_report_clicked"
  });

  assert.deepEqual(mockWindow.dataLayer, [
    {
      event: "hero_book_demo_clicked"
    },
    {
      event: "hero_sample_report_clicked"
    }
  ]);
});

test("lead form events dispatch after analytics consent is granted", () => {
  const mockWindow = installWindow({ certscoreAnalyticsConsent: "granted", dataLayer: [] });

  pushDataLayerEvent({
    event: "lead_form_submit_attempted",
    form_type: "demo_request"
  });

  assert.deepEqual(mockWindow.dataLayer, [
    {
      event: "lead_form_submit_attempted",
      form_type: "demo_request"
    }
  ]);
});

test("GPT CTA events dispatch after analytics consent is granted", () => {
  const mockWindow = installWindow({ certscoreAnalyticsConsent: "granted", dataLayer: [] });

  pushDataLayerEvent({
    event: "gpt_cta_clicked",
    location: "api_pulse",
    destination: "certscore_gpt",
    url: "https://chatgpt.com/gpts?search=GDPR%20ePrivacy%20Cookie%20Consent%20Privacy%20Scanner"
  });

  assert.deepEqual(mockWindow.dataLayer, [
    {
      event: "gpt_cta_clicked",
      location: "api_pulse",
      destination: "certscore_gpt",
      url: "https://chatgpt.com/gpts?search=GDPR%20ePrivacy%20Cookie%20Consent%20Privacy%20Scanner"
    }
  ]);
});

test("pre-navigation scan events resolve without dispatch when consent is denied", async () => {
  const mockWindow = installWindow({ certscoreAnalyticsConsent: "denied", dataLayer: [] });

  await pushDataLayerEventBeforeNavigation({
    event: "scan_started",
    scan_source: "homepage",
    scan_target_type: "domain",
    scan_status: "queued"
  });

  assert.deepEqual(mockWindow.dataLayer, []);
});

test("pre-navigation scan events still dispatch when consent is granted", async () => {
  const mockWindow = installWindow({ certscoreAnalyticsConsent: "granted", dataLayer: [] });

  const pending = pushDataLayerEventBeforeNavigation(
    {
      event: "scan_started",
      scan_source: "homepage",
      scan_target_type: "domain",
      scan_status: "queued"
    },
    10
  );

  assert.equal(mockWindow.dataLayer?.length, 1);
  assert.equal((mockWindow.dataLayer?.[0] as { event?: string }).event, "scan_started");

  await pending;
});

test("saved analytics consent applies Google consent mode and loads Google tag only when granted", () => {
  let loadCount = 0;
  const mockWindow = installWindow({
    certscoreAnalyticsConsent: "denied",
    dataLayer: [],
    certscoreLoadGoogleTag: () => {
      loadCount += 1;
    }
  });

  saveAnalyticsConsent("denied");

  assert.equal(storage.get(ANALYTICS_CONSENT_STORAGE_KEY), "denied");
  assert.equal(loadCount, 0);
  assert.deepEqual(mockWindow.dataLayer?.at(-1), [
    "consent",
    "update",
    {
      ad_personalization: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      analytics_storage: "denied"
    }
  ]);

  saveAnalyticsConsent("granted");

  assert.equal(storage.get(ANALYTICS_CONSENT_STORAGE_KEY), "granted");
  assert.equal(loadCount, 1);
  assert.deepEqual(mockWindow.dataLayer?.at(-1), [
    "consent",
    "update",
    {
      ad_personalization: "granted",
      ad_storage: "granted",
      ad_user_data: "granted",
      analytics_storage: "granted"
    }
  ]);
});

test("bootstrap defaults Google consent mode to denied before reading saved consent", () => {
  const script = buildConsentBootstrapScript("G-TEST");

  assert.match(script, /gtag\('consent', 'default'/);
  assert.match(script, /gtag\/js\?id/);
  assert.match(script, /certscoreLoadGoogleTag/);
  assert.doesNotMatch(script, /certscoreLoadGtm/);
  assert.match(script, /"analytics_storage":"denied"/);
  assert.match(script, /"ad_storage":"denied"/);
  assert.match(script, /"ad_user_data":"denied"/);
  assert.match(script, /"ad_personalization":"denied"/);
  assert.match(script, /storedChoice === 'granted'/);
  assert.doesNotMatch(script, /ns\.html/);
});
