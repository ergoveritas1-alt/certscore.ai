import type { KeyPageDiscoveryPageSummary, ScanPage } from "@website-signal-risk-scanner/shared";
import type { StaticPageResult } from "../snapshot/types";

export type KeyPageCoverageDefinition = {
  extractionLimitedSignalKey?: string;
  extractionLimitedSignalLabel?: string;
  fetchFailedSignalKey: string;
  fetchFailedSignalLabel: string;
  pageType: ScanPage["pageType"];
  severity: "high" | "medium";
  surfaceMissingSignalKey: string;
  surfaceMissingSignalLabel: string;
};

export const KEY_PAGE_COVERAGE_DEFINITIONS: KeyPageCoverageDefinition[] = [
  {
    extractionLimitedSignalKey: "disclosure.privacy_policy_extraction_limited",
    extractionLimitedSignalLabel: "Privacy policy linked but automated extraction was limited",
    fetchFailedSignalKey: "disclosure.privacy_policy_fetch_failed",
    fetchFailedSignalLabel: "Privacy policy linked but not retrievable",
    pageType: "privacy_policy",
    severity: "high",
    surfaceMissingSignalKey: "disclosure.privacy_policy_surface_missing",
    surfaceMissingSignalLabel: "Privacy policy surface not detected"
  },
  {
    extractionLimitedSignalKey: "disclosure.terms_of_service_extraction_limited",
    extractionLimitedSignalLabel: "Terms page linked but automated extraction was limited",
    fetchFailedSignalKey: "disclosure.terms_of_service_fetch_failed",
    fetchFailedSignalLabel: "Terms page linked but not retrievable",
    pageType: "terms_of_service",
    severity: "medium",
    surfaceMissingSignalKey: "disclosure.terms_of_service_surface_missing",
    surfaceMissingSignalLabel: "Terms page surface not detected"
  },
  {
    extractionLimitedSignalKey: "disclosure.cookie_policy_extraction_limited",
    extractionLimitedSignalLabel: "Cookie policy linked but automated extraction was limited",
    fetchFailedSignalKey: "disclosure.cookie_policy_fetch_failed",
    fetchFailedSignalLabel: "Cookie policy linked but not retrievable",
    pageType: "cookie_policy",
    severity: "medium",
    surfaceMissingSignalKey: "disclosure.cookie_policy_surface_missing",
    surfaceMissingSignalLabel: "Cookie policy surface not detected"
  },
  {
    extractionLimitedSignalKey: "disclosure.accessibility_statement_extraction_limited",
    extractionLimitedSignalLabel: "Accessibility statement linked but automated extraction was limited",
    fetchFailedSignalKey: "disclosure.accessibility_statement_fetch_failed",
    fetchFailedSignalLabel: "Accessibility statement linked but not retrievable",
    pageType: "accessibility_statement",
    severity: "medium",
    surfaceMissingSignalKey: "disclosure.accessibility_statement_surface_missing",
    surfaceMissingSignalLabel: "Accessibility statement surface not detected"
  },
  {
    fetchFailedSignalKey: "disclosure.contact_page_fetch_failed",
    fetchFailedSignalLabel: "Contact page linked but not retrievable",
    pageType: "contact",
    severity: "medium",
    surfaceMissingSignalKey: "disclosure.contact_page_surface_missing",
    surfaceMissingSignalLabel: "Contact page surface not detected"
  }
] as const;

export type KeyPageCoverageStatus = KeyPageCoverageDefinition & {
  bestCandidateAnchorText: string | null;
  bestCandidateHostRelation: KeyPageDiscoveryPageSummary["bestCandidateHostRelation"];
  bestCandidateUrl: string | null;
  extractionLimited: boolean;
  failedPageUrls: string[];
  fetched: boolean;
  surfaceDetected: boolean;
  surfaceState: KeyPageDiscoveryPageSummary["surfaceState"];
};

export function summarizeKeyPageCoverage(input: {
  pageSummaries: KeyPageDiscoveryPageSummary[];
  fetchedPages: StaticPageResult[];
}) {
  return KEY_PAGE_COVERAGE_DEFINITIONS.map((definition) => {
    const summary = input.pageSummaries.find((candidate) => candidate.pageType === definition.pageType) ?? null;
    const matchingPages = input.fetchedPages.filter((page) => page.pageType === definition.pageType);
    const fetched = summary?.surfaceState === "linked_and_verified" || summary?.surfaceState === "linked_but_extraction_limited";
    const surfaceDetected =
      summary?.surfaceState === "linked_and_verified" ||
      summary?.surfaceState === "linked_but_fetch_blocked" ||
      summary?.surfaceState === "linked_but_extraction_limited" ||
      summary?.surfaceState === "linked_unverified";
    const failedPageUrls =
      summary?.surfaceState === "linked_but_fetch_blocked"
        ? [...new Set(summary.attemptedUrls)]
        : [];

    return {
      ...definition,
      bestCandidateAnchorText: summary?.bestCandidateAnchorText ?? null,
      bestCandidateHostRelation: summary?.bestCandidateHostRelation ?? null,
      bestCandidateUrl: summary?.bestCandidateUrl ?? null,
      extractionLimited: summary?.surfaceState === "linked_but_extraction_limited",
      failedPageUrls: [...new Set(failedPageUrls)],
      fetched,
      surfaceDetected,
      surfaceState: summary?.surfaceState ?? "not_detected"
    } satisfies KeyPageCoverageStatus;
  });
}
