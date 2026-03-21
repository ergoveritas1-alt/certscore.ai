import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Page } from "playwright";

async function withPage(run: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await run(page);
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

test("consent interaction vendor diff logic is deterministic", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      difference(left: string[], right: string[]): string[];
      intersection(left: string[], right: string[]): string[];
    };
  }).__test;

  assert.ok(helpers);
  assert.deepEqual(helpers?.difference(["Google Ads", "LinkedIn Insight Tag"], ["LinkedIn Insight Tag"]), ["Google Ads"]);
  assert.deepEqual(
    helpers?.intersection(["Google Ads", "LinkedIn Insight Tag"], ["LinkedIn Insight Tag", "Marketo"]),
    ["LinkedIn Insight Tag"]
  );
});

test("accept path logs one-click opt-in evidence", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      performAcceptPath: (page: Page, startHost: string, waitForSettle: (maxWaitMs: number) => Promise<void>) => Promise<{
        clicked: boolean;
        clickCount: number | null;
        evidenceLog: Array<{ action: string; text: string }>;
      }>;
    };
  }).__test;

  await withPage(async (page) => {
    await page.setContent(`
      <div id="banner">
        <button id="accept" onclick="document.getElementById('banner').remove()">Accept all</button>
        <button id="reject">Reject all</button>
      </div>
    `);

    const result = await helpers!.performAcceptPath(page, "", async () => {});
    assert.equal(result.clicked, true);
    assert.equal(result.clickCount, 1);
    assert.deepEqual(result.evidenceLog.map((step) => step.action), ["accept"]);
  });
});

test("reject path traverses preferences, toggles non-essential cookies, and saves", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      performRejectPath: (page: Page, startHost: string, waitForSettle: (maxWaitMs: number) => Promise<void>) => Promise<{
        clicked: boolean;
        clickCount: number | null;
        evidenceLog: Array<{ action: string; text: string }>;
      }>;
    };
  }).__test;

  await withPage(async (page) => {
    await page.setContent(`
      <div id="banner">
        <button id="manage" onclick="document.getElementById('prefs').style.display='block'">Manage preferences</button>
      </div>
      <div id="prefs" style="display:none">
        <label><input id="analytics" type="checkbox" checked /> Analytics cookies</label>
        <button id="save" onclick="document.getElementById('prefs').remove(); document.getElementById('banner').remove()">Save choices</button>
      </div>
    `);

    const result = await helpers!.performRejectPath(page, "", async () => {});
    assert.equal(result.clicked, true);
    assert.equal(result.clickCount, 3);
    assert.deepEqual(result.evidenceLog.map((step) => step.action), ["preferences", "toggle", "save"]);
  });
});

test("reject path flags auth-wall friction when the opt-out flow reveals login gating", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      performRejectPath: (page: Page, startHost: string, waitForSettle: (maxWaitMs: number) => Promise<void>) => Promise<{
        authWallDetected: boolean;
        clicked: boolean;
        clickCount: number | null;
        externalRedirectDetected: boolean;
        redirectOrAuthRequired: boolean;
      }>;
    };
  }).__test;

  await withPage(async (page) => {
    await page.setContent(`
      <div id="banner">
        <button id="manage" onclick="document.body.innerHTML='<form><label>Password <input type=&quot;password&quot; /></label></form>'">Manage preferences</button>
      </div>
    `);

    const result = await helpers!.performRejectPath(page, "", async () => {});
    assert.equal(result.authWallDetected, true);
    assert.equal(result.externalRedirectDetected, false);
    assert.equal(result.redirectOrAuthRequired, true);
    assert.equal(result.clickCount, 1);
  });
});

test("blocker detection treats visible password fields as auth walls", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      detectPathBlockers: (
        page: Page,
        startHost: string
      ) => Promise<{
        authWallDetected: boolean;
        blockerTextSnippet: string | null;
        blockerType: string | null;
        externalRedirectDetected: boolean;
        redirectOrAuthRequired: boolean;
      }>;
    };
  }).__test;

  await withPage(async (page) => {
    await page.setContent(`
      <form>
        <label>Password <input type="password" /></label>
      </form>
    `);

    const result = await helpers!.detectPathBlockers(page, "");
    assert.equal(result.authWallDetected, true);
    assert.equal(result.blockerType, "auth_wall");
    assert.match(result.blockerTextSnippet ?? "", /password/i);
    assert.equal(result.externalRedirectDetected, false);
    assert.equal(result.redirectOrAuthRequired, true);
  });
});

test("blocker detection flags external redirects separately from auth walls", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      performRejectPath: (page: Page, startHost: string, waitForSettle: (maxWaitMs: number) => Promise<void>) => Promise<{
        authWallDetected: boolean;
        clicked: boolean;
        clickCount: number | null;
        externalRedirectDetected: boolean;
        redirectOrAuthRequired: boolean;
      }>;
    };
  }).__test;

  await withPage(async (page) => {
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
    await page.setContent(`
      <div id="banner">
        <button id="reject" onclick="window.location.href='https://other.example/privacy'">Reject all</button>
      </div>
    `);

    const result = await helpers!.performRejectPath(page, "example.com", async () => {});
    assert.equal(result.authWallDetected, false);
    assert.equal(result.externalRedirectDetected, true);
    assert.equal(result.redirectOrAuthRequired, true);
  });
});

test("auth wall snippets prioritize matching login copy", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      buildAuthWallSnippet: (text: string) => string | null;
    };
  }).__test;

  assert.match(
    helpers!.buildAuthWallSnippet("Manage settings. Please sign in to continue with account access. More text here.") ?? "",
    /Please sign in to continue with account access/i
  );
});

test("entrypoint normalization keeps homepage first and deduplicates fallbacks", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      normalizeAuditEntrypoints: (primaryUrl: string, fallbackUrls: string[]) => string[];
    };
  }).__test;

  assert.deepEqual(helpers!.normalizeAuditEntrypoints("https://example.com", [
    "https://example.com/privacy",
    "https://example.com/privacy",
    "https://example.com"
  ]), ["https://example.com", "https://example.com/privacy"]);
});

test("matching evidence passes count repeated blockers across deterministic runs", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      countMatchingEvidencePasses: (
        audits: Array<{
          consentBlockerType: string | null;
          consentBlockerUrl: string | null;
          consentFrictionDelta: number | null;
          consentRedirectOrAuthRequired: boolean | null;
          finalUrl: string;
          optInClicks: number | null;
          optOutClicks: number | null;
        }>,
        selected: {
          consentBlockerType: string | null;
          consentBlockerUrl: string | null;
          consentFrictionDelta: number | null;
          consentRedirectOrAuthRequired: boolean | null;
          finalUrl: string;
          optInClicks: number | null;
          optOutClicks: number | null;
        }
      ) => number;
    };
  }).__test;

  const selected = {
    consentBlockerType: "auth_wall",
    consentBlockerUrl: "https://example.com/login",
    consentFrictionDelta: null,
    consentRedirectOrAuthRequired: true,
    finalUrl: "https://example.com/login",
    optInClicks: null,
    optOutClicks: null
  };

  assert.equal(
    helpers!.countMatchingEvidencePasses([selected, selected, { ...selected, consentBlockerUrl: "https://example.com/privacy-login" }], selected),
    2
  );
});

test("best available consent audit selection tolerates failed profiles when earlier evidence exists", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      chooseBestAvailableAudit: (
        audits: Array<{
          consentBlockerType: string | null;
          consentBlockerUrl: string | null;
          consentFrictionDelta: number | null;
          consentRedirectOrAuthRequired: boolean | null;
          finalUrl: string;
          optInClicks: number | null;
          optOutClicks: number | null;
          postAccept: { interactionSucceeded: boolean; trackerVendorNames: string[] };
          postReject: { interactionSucceeded: boolean; trackerVendorNames: string[] };
        } | null>
      ) => {
        consentBlockerType: string | null;
        consentBlockerUrl: string | null;
      } | null;
    };
  }).__test;

  const successfulAudit = {
    consentBlockerType: "extra_click_path",
    consentBlockerUrl: "https://example.com/privacy",
    consentFrictionDelta: 2,
    consentRedirectOrAuthRequired: false,
    finalUrl: "https://example.com/privacy",
    optInClicks: 1,
    optOutClicks: 3,
    postAccept: { interactionSucceeded: true, trackerVendorNames: [] },
    postReject: { interactionSucceeded: true, trackerVendorNames: [] }
  };

  const chosen = helpers!.chooseBestAvailableAudit([successfulAudit, null]);
  assert.equal(chosen?.consentBlockerType, "extra_click_path");
  assert.equal(chosen?.consentBlockerUrl, "https://example.com/privacy");
  assert.equal(helpers!.chooseBestAvailableAudit([null, null]), null);
});

test("finalizeConsentAudit preserves earlier successful evidence after later failures", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      finalizeConsentAudit: (input: {
        attemptedProbeProfiles: string[];
        audits: Array<{
          acceptNewTrackerVendorNames: string[];
          authWallDetected: boolean;
          baseline: {
            clickCount: number | null;
            cookieCount: number;
            interactionSucceeded: boolean;
            stage: "baseline";
            thirdPartyCookieCount: number;
            trackerEvidenceUrls: string[];
            trackerVendorNames: string[];
          };
          consentBlockerPageTitle: string | null;
          consentBlockerTextSnippet: string | null;
          consentBlockerType: "auth_wall" | "external_redirect" | "extra_click_path" | null;
          consentBlockerUrl: string | null;
          consentEvidencePassCount: number | null;
          consentFrictionDelta: number | null;
          consentRedirectOrAuthRequired: boolean | null;
          evidenceLog: string[];
          externalRedirectDetected: boolean;
          finalUrl: string;
          optInClicks: number | null;
          optInEvidenceLog: Array<{ action: string; stepIndex: number; text: string }>;
          optOutClicks: number | null;
          optOutEvidenceLog: Array<{ action: string; stepIndex: number; text: string }>;
          postAccept: {
            clickCount: number | null;
            cookieCount: number;
            interactionSucceeded: boolean;
            stage: "post_accept";
            thirdPartyCookieCount: number;
            trackerEvidenceUrls: string[];
            trackerVendorNames: string[];
          };
          postReject: {
            clickCount: number | null;
            cookieCount: number;
            interactionSucceeded: boolean;
            stage: "post_reject";
            thirdPartyCookieCount: number;
            trackerEvidenceUrls: string[];
            trackerVendorNames: string[];
          };
          rejectNewTrackerVendorNames: string[];
          rejectPersistedTrackerVendorNames: string[];
        }>;
        winningAudit: {
          acceptNewTrackerVendorNames: string[];
          authWallDetected: boolean;
          baseline: {
            clickCount: number | null;
            cookieCount: number;
            interactionSucceeded: boolean;
            stage: "baseline";
            thirdPartyCookieCount: number;
            trackerEvidenceUrls: string[];
            trackerVendorNames: string[];
          };
          consentBlockerPageTitle: string | null;
          consentBlockerTextSnippet: string | null;
          consentBlockerType: "auth_wall" | "external_redirect" | "extra_click_path" | null;
          consentBlockerUrl: string | null;
          consentEvidencePassCount: number | null;
          consentFrictionDelta: number | null;
          consentRedirectOrAuthRequired: boolean | null;
          evidenceLog: string[];
          externalRedirectDetected: boolean;
          finalUrl: string;
          optInClicks: number | null;
          optInEvidenceLog: Array<{ action: string; stepIndex: number; text: string }>;
          optOutClicks: number | null;
          optOutEvidenceLog: Array<{ action: string; stepIndex: number; text: string }>;
          postAccept: {
            clickCount: number | null;
            cookieCount: number;
            interactionSucceeded: boolean;
            stage: "post_accept";
            thirdPartyCookieCount: number;
            trackerEvidenceUrls: string[];
            trackerVendorNames: string[];
          };
          postReject: {
            clickCount: number | null;
            cookieCount: number;
            interactionSucceeded: boolean;
            stage: "post_reject";
            thirdPartyCookieCount: number;
            trackerEvidenceUrls: string[];
            trackerVendorNames: string[];
          };
          rejectNewTrackerVendorNames: string[];
          rejectPersistedTrackerVendorNames: string[];
        };
        winningProbeProfile: string | null;
      }) => {
        attemptedProbeProfiles: string[];
        consentEvidencePassCount: number | null;
        optInClicks: number | null;
        optOutClicks: number | null;
        winningProbeProfile: string | null;
      };
    };
  }).__test;

  const successfulAudit = {
    acceptNewTrackerVendorNames: [],
    authWallDetected: false,
    baseline: {
      clickCount: null,
      cookieCount: 0,
      interactionSucceeded: true,
      stage: "baseline" as const,
      thirdPartyCookieCount: 0,
      trackerEvidenceUrls: [],
      trackerVendorNames: []
    },
    consentBlockerPageTitle: null,
    consentBlockerTextSnippet: null,
    consentBlockerType: "extra_click_path" as const,
    consentBlockerUrl: "https://example.com/privacy",
    consentEvidencePassCount: null,
    consentFrictionDelta: 2,
    consentRedirectOrAuthRequired: false,
    evidenceLog: [],
    externalRedirectDetected: false,
    finalUrl: "https://example.com/privacy",
    optInClicks: 1,
    optInEvidenceLog: [],
    optOutClicks: 3,
    optOutEvidenceLog: [],
    postAccept: {
      clickCount: 1,
      cookieCount: 0,
      interactionSucceeded: true,
      stage: "post_accept" as const,
      thirdPartyCookieCount: 0,
      trackerEvidenceUrls: [],
      trackerVendorNames: []
    },
    postReject: {
      clickCount: 3,
      cookieCount: 0,
      interactionSucceeded: true,
      stage: "post_reject" as const,
      thirdPartyCookieCount: 0,
      trackerEvidenceUrls: [],
      trackerVendorNames: []
    },
    rejectNewTrackerVendorNames: [],
    rejectPersistedTrackerVendorNames: []
  };

  const finalized = helpers!.finalizeConsentAudit({
    attemptedProbeProfiles: ["desktop_default", "desktop_eu"],
    audits: [successfulAudit],
    winningAudit: successfulAudit,
    winningProbeProfile: "desktop_default"
  });

  assert.equal(finalized.optInClicks, 1);
  assert.equal(finalized.optOutClicks, 3);
  assert.equal(finalized.consentEvidencePassCount, 1);
  assert.equal(finalized.winningProbeProfile, "desktop_default");
});

test("buildConsentRuntimeArtifactsPatch keeps concrete consent evidence fields", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      buildConsentRuntimeArtifactsPatch: (audit: {
        acceptNewTrackerVendorNames: string[];
        baseline: { cookieCount: number; thirdPartyCookieCount: number; trackerVendorNames: string[] };
        consentBlockerPageTitle: string | null;
        consentBlockerTextSnippet: string | null;
        consentBlockerType: "auth_wall" | "external_redirect" | "extra_click_path" | null;
        consentBlockerUrl: string | null;
        consentEvidencePassCount: number | null;
        consentFrictionDelta: number | null;
        consentRedirectOrAuthRequired: boolean | null;
        optInClicks: number | null;
        optInEvidenceLog: Array<{ action: string; stepIndex: number; text: string }>;
        optOutClicks: number | null;
        optOutEvidenceLog: Array<{ action: string; stepIndex: number; text: string }>;
        postAccept: {
          clickCount: number | null;
          cookieCount: number;
          interactionSucceeded: boolean;
          thirdPartyCookieCount: number;
          trackerEvidenceUrls: string[];
          trackerVendorNames: string[];
        };
        postReject: {
          clickCount: number | null;
          cookieCount: number;
          interactionSucceeded: boolean;
          thirdPartyCookieCount: number;
          trackerEvidenceUrls: string[];
          trackerVendorNames: string[];
        };
        rejectNewTrackerVendorNames: string[];
        rejectPersistedTrackerVendorNames: string[];
      }) => {
        consentAuditCompleted: boolean;
        consentBlockerType: string | null;
        consentEvidencePassCount: number | null;
        consentOptInClicks: number | null;
        consentOptOutClicks: number | null;
      };
    };
  }).__test;

  const patch = helpers!.buildConsentRuntimeArtifactsPatch({
    acceptNewTrackerVendorNames: [],
    baseline: { cookieCount: 1, thirdPartyCookieCount: 1, trackerVendorNames: ["Yandex"] },
    consentBlockerPageTitle: null,
    consentBlockerTextSnippet: null,
    consentBlockerType: "auth_wall",
    consentBlockerUrl: "https://example.com/login",
    consentEvidencePassCount: 2,
    consentFrictionDelta: null,
    consentRedirectOrAuthRequired: true,
    optInClicks: 1,
    optInEvidenceLog: [],
    optOutClicks: 1,
    optOutEvidenceLog: [],
    postAccept: {
      clickCount: 1,
      cookieCount: 1,
      interactionSucceeded: true,
      thirdPartyCookieCount: 1,
      trackerEvidenceUrls: [],
      trackerVendorNames: ["Yandex"]
    },
    postReject: {
      clickCount: 1,
      cookieCount: 1,
      interactionSucceeded: true,
      thirdPartyCookieCount: 1,
      trackerEvidenceUrls: [],
      trackerVendorNames: ["Yandex"]
    },
    rejectNewTrackerVendorNames: [],
    rejectPersistedTrackerVendorNames: ["Yandex"]
  });

  assert.equal(patch.consentAuditCompleted, true);
  assert.equal(patch.consentBlockerType, "auth_wall");
  assert.equal(patch.consentOptInClicks, 1);
  assert.equal(patch.consentOptOutClicks, 1);
  assert.equal(patch.consentEvidencePassCount, 2);
});
