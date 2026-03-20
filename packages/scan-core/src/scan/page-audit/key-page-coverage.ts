import type { ScanPage } from "@website-signal-risk-scanner/shared";
import type { StaticPageResult } from "../snapshot/types";

export type KeyPageCoverageDefinition = {
  fetchedSignalLabel: string;
  fetchFailedSignalKey: string;
  fetchFailedSignalLabel: string;
  pageType: ScanPage["pageType"];
  severity: "high" | "medium";
  surfaceMissingSignalKey: string;
  surfaceMissingSignalLabel: string;
};

export const KEY_PAGE_COVERAGE_DEFINITIONS: KeyPageCoverageDefinition[] = [
  {
    fetchedSignalLabel: "Privacy policy fetched",
    fetchFailedSignalKey: "disclosure.privacy_policy_fetch_failed",
    fetchFailedSignalLabel: "Privacy policy page unavailable",
    pageType: "privacy_policy",
    severity: "high",
    surfaceMissingSignalKey: "disclosure.privacy_policy_surface_missing",
    surfaceMissingSignalLabel: "Privacy policy surface not detected"
  },
  {
    fetchedSignalLabel: "Terms page fetched",
    fetchFailedSignalKey: "disclosure.terms_of_service_fetch_failed",
    fetchFailedSignalLabel: "Terms page unavailable",
    pageType: "terms_of_service",
    severity: "medium",
    surfaceMissingSignalKey: "disclosure.terms_of_service_surface_missing",
    surfaceMissingSignalLabel: "Terms page surface not detected"
  },
  {
    fetchedSignalLabel: "Cookie policy fetched",
    fetchFailedSignalKey: "disclosure.cookie_policy_fetch_failed",
    fetchFailedSignalLabel: "Cookie policy unavailable",
    pageType: "cookie_policy",
    severity: "medium",
    surfaceMissingSignalKey: "disclosure.cookie_policy_surface_missing",
    surfaceMissingSignalLabel: "Cookie policy surface not detected"
  },
  {
    fetchedSignalLabel: "Accessibility statement fetched",
    fetchFailedSignalKey: "disclosure.accessibility_statement_fetch_failed",
    fetchFailedSignalLabel: "Accessibility statement unavailable",
    pageType: "accessibility_statement",
    severity: "medium",
    surfaceMissingSignalKey: "disclosure.accessibility_statement_surface_missing",
    surfaceMissingSignalLabel: "Accessibility statement surface not detected"
  },
  {
    fetchedSignalLabel: "Contact page fetched",
    fetchFailedSignalKey: "disclosure.contact_page_fetch_failed",
    fetchFailedSignalLabel: "Contact page unavailable",
    pageType: "contact",
    severity: "medium",
    surfaceMissingSignalKey: "disclosure.contact_page_surface_missing",
    surfaceMissingSignalLabel: "Contact page surface not detected"
  }
] as const;

export type KeyPageCoverageStatus = KeyPageCoverageDefinition & {
  failedPageUrls: string[];
  fetched: boolean;
  surfaceDetected: boolean;
};

function isSuccessfulFetch(fetchStatus: ScanPage["fetchStatus"]) {
  return fetchStatus === "ok" || fetchStatus === "redirected";
}

export function summarizeKeyPageCoverage(input: {
  discoveredPageTypes: Set<ScanPage["pageType"]>;
  failedAttemptedUrlsByPageType?: Partial<Record<ScanPage["pageType"], string[]>>;
  fetchedPages: StaticPageResult[];
}) {
  return KEY_PAGE_COVERAGE_DEFINITIONS.map((definition) => {
    const matchingPages = input.fetchedPages.filter((page) => page.pageType === definition.pageType);
    const fetched = matchingPages.some((page) => isSuccessfulFetch(page.fetchStatus));
    const surfaceDetected = fetched || input.discoveredPageTypes.has(definition.pageType);
    const failedPageUrls = [
      ...matchingPages.filter((page) => !isSuccessfulFetch(page.fetchStatus)).map((page) => page.pageUrl),
      ...(input.failedAttemptedUrlsByPageType?.[definition.pageType] ?? [])
    ];

    return {
      ...definition,
      failedPageUrls: [...new Set(failedPageUrls)],
      fetched,
      surfaceDetected
    } satisfies KeyPageCoverageStatus;
  });
}
