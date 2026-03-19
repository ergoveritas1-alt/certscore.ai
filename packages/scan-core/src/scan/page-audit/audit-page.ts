import type { Page } from "playwright";
import { buildAccessibilityFinding, type AccessibilityFindingInsert } from "./build-accessibility-finding";
import { buildAffiliateSignalFinding, buildDisclosureNotObservedFinding } from "./build-legal-finding";
import {
  buildBannerMissingWithTrackersFinding,
  buildRejectControlMissingFinding,
  buildTrackerFinding,
  buildTrackersObservedBeforeConsentFinding
} from "./build-privacy-finding";
import { checkPolicyContent, type PolicyContentCheckResult } from "./check-policy-content";
import { detectCookieSignals, type CookieSignals } from "./detect-cookie-signals";
import { detectFtcSignals } from "./detect-ftc-signals";
import { attachTrackerDetector } from "./detect-trackers";
import { normalizeTrackers } from "./normalize-trackers";
import { normalizeAxeResults } from "./normalize-axe-results";
import { detectPolicyTypeFromUrl } from "./policy-keywords";
import { runAxe } from "./run-axe";
import type { DerivedFindingRecord } from "../types/finding";
import type { RobotsPolicy } from "../robots/policy";
import { navigateWithPolicy } from "../browser/navigate-with-policy";

export type AuditPageResult = {
  accessibilityFindings: AccessibilityFindingInsert[];
  privacyFindings: DerivedFindingRecord[];
  legalFindings: DerivedFindingRecord[];
  cookieSignals: CookieSignals;
  httpStatus: number | null;
  loadTimeMs: number;
  policyContentCheck: PolicyContentCheckResult | null;
  trackerCount: number;
  success: boolean;
};

export async function auditPage(input: {
  page: Page;
  pageType?: string | null;
  robotsPolicy?: RobotsPolicy | null;
  scanId: string;
  scanPageId: string;
  url: string;
}): Promise<AuditPageResult> {
  const startedAt = Date.now();
  const trackerDetector = attachTrackerDetector(input.page);
  try {
    const navigation = await navigateWithPolicy({
      page: input.page,
      robotsPolicy: input.robotsPolicy,
      url: input.url
    });

    if (navigation.blockedByPolicy) {
      return {
        success: false,
        httpStatus: null,
        loadTimeMs: Date.now() - startedAt,
        trackerCount: 0,
        cookieSignals: {
          bannerPresent: false,
          acceptPresent: false,
          rejectPresent: false,
          preferencesPresent: false,
          matchedSelectors: [],
          matchedTextSnippets: []
        },
        accessibilityFindings: [],
        privacyFindings: [],
        legalFindings: [],
        policyContentCheck: null
      };
    }

    await input.page.waitForTimeout(1800);

    const axeResults = await runAxe(input.page);
    const normalizedViolations = normalizeAxeResults(axeResults);
    const cookieSignals = await detectCookieSignals(input.page);
    const normalizedTrackers = normalizeTrackers(trackerDetector.getTrackers());
    const ftcSignals = await detectFtcSignals(input.page);
    const policyType = detectPolicyTypeFromUrl(input.url);

    const accessibilityFindings = normalizedViolations.map((violation) =>
      buildAccessibilityFinding({
        scanId: input.scanId,
        scanPageId: input.scanPageId,
        pageUrl: input.url,
        violation
      })
    );

    const privacyFindings: DerivedFindingRecord[] = normalizedTrackers.map((tracker) =>
      buildTrackerFinding({
        scanId: input.scanId,
        scanPageId: input.scanPageId,
        pageUrl: input.url,
        tracker
      })
    );

    if (normalizedTrackers.length > 0 && !cookieSignals.bannerPresent) {
      privacyFindings.push(
        buildBannerMissingWithTrackersFinding({
          scanId: input.scanId,
          scanPageId: input.scanPageId,
          pageUrl: input.url,
          trackers: normalizedTrackers,
          cookieSignals
        })
      );
    }

    if (cookieSignals.bannerPresent && !cookieSignals.rejectPresent) {
      privacyFindings.push(
        buildRejectControlMissingFinding({
          scanId: input.scanId,
          scanPageId: input.scanPageId,
          pageUrl: input.url,
          cookieSignals
        })
      );
    }

    if (cookieSignals.bannerPresent && normalizedTrackers.length > 0) {
      privacyFindings.push(
        buildTrackersObservedBeforeConsentFinding({
          scanId: input.scanId,
          scanPageId: input.scanPageId,
          pageUrl: input.url,
          trackers: normalizedTrackers,
          cookieSignals
        })
      );
    }

    const legalFindings: DerivedFindingRecord[] = [];

    if (ftcSignals.matchedSignalTerms.length > 0 && !ftcSignals.disclosureObserved) {
      legalFindings.push(
        buildDisclosureNotObservedFinding({
          scanId: input.scanId,
          scanPageId: input.scanPageId,
          pageUrl: input.url,
          pageType: input.pageType ?? null,
          matchedSignalTerms: ftcSignals.matchedSignalTerms,
          matchedDisclosureTerms: ftcSignals.matchedDisclosureTerms,
          representativeSnippets: ftcSignals.representativeSnippets
        })
      );
    }

    if (ftcSignals.matchedSignalTerms.some((term) => term.includes("affiliate") || term.includes("commission"))) {
      legalFindings.push(
        buildAffiliateSignalFinding({
          scanId: input.scanId,
          scanPageId: input.scanPageId,
          pageUrl: input.url,
          pageType: input.pageType ?? null,
          matchedSignalTerms: ftcSignals.matchedSignalTerms,
          representativeSnippets: ftcSignals.representativeSnippets
        })
      );
    }

    const policyContentCheck = policyType
      ? await checkPolicyContent({
          page: input.page,
          policyType,
          url: input.url
        })
      : null;

    return {
      success: true,
      httpStatus: navigation.response?.status() ?? null,
      loadTimeMs: Date.now() - startedAt,
      trackerCount: normalizedTrackers.length,
      cookieSignals,
      accessibilityFindings,
      privacyFindings,
      legalFindings,
      policyContentCheck
    };
  } finally {
    trackerDetector.detach();
  }
}
