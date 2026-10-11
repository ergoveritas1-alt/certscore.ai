/** Reviewed, bounded catalogue, not an exhaustive CVE feed. Never fetch on a scan. */
export const CMS_CATALOGUE_V1 = "certscore.cms-catalogue.2026-09-17.v1";
export const CMS_CATALOGUE_V2 = "certscore.cms-catalogue.2026-09-17.v2";
export const CMS_CATALOGUE_V3 = "certscore.cms-catalogue.2026-10-11.v3";
export const CMS_CATALOGUE_VERSION = "certscore.cms-catalogue.2026-10-11.v4";
export const CMS_CATALOGUE_LEGACY_REVIEWED_AT = "2026-09-17";
export const CMS_CATALOGUE_REVIEWED_AT = "2026-10-11";
export type CmsProduct = "wordpress" | "joomla" | "drupal" | "magento" | "adobe-commerce" | "prestashop" | "typo3" | "opencart" | "shopify" | "wix" | "squarespace";
export type CmsRange = { min: string; max: string; maxInclusive?: boolean };
export type CmsRule = {
  id: string; products: CmsProduct[]; kind: "vulnerability" | "lifecycle";
  title: string; sourceUrl: string; ranges: CmsRange[];
  severity: "medium" | "high"; fixedVersions?: string[]; effectiveAt: string;
  qualification: string;
};
export const CMS_SECURITY_RULES_V1: readonly CmsRule[] = [
  { id: "CVE-2025-22213", products: ["joomla"], kind: "vulnerability", title: "Media Manager executable file upload",
    sourceUrl: "https://developer.joomla.org/security-centre/961-20250301-core-malicious-file-uploads-via-media-manager.html",
    ranges: [{ min: "4.0.0", max: "4.4.12" }, { min: "5.0.0", max: "5.2.5" }], fixedVersions: ["4.4.12", "5.2.5"], severity: "high", effectiveAt: "2025-03-10",
    qualification: "Requires a user with edit privileges in Media Manager; privileges and backported fixes were not checked." },
  { id: "CVE-2025-3057", products: ["drupal"], kind: "vulnerability", title: "Reflected cross-site scripting",
    sourceUrl: "https://www.drupal.org/sa-core-2025-001",
    ranges: [{ min: "8.0.0", max: "10.3.13" }, { min: "10.4.0", max: "10.4.3" }, { min: "11.0.0", max: "11.0.12" }, { min: "11.1.0", max: "11.1.3" }],
    fixedVersions: ["10.3.13", "10.4.3", "11.0.12", "11.1.3"], severity: "high", effectiveAt: "2025-02-19",
    qualification: "Error-message handling is affected. Drupal Steward or backported patches may mitigate exposure; these were not checked." },
  { id: "CVE-2025-47110", products: ["magento", "adobe-commerce"], kind: "vulnerability", title: "Reflected cross-site scripting / code execution",
    sourceUrl: "https://helpx.adobe.com/security/products/magento/apsb25-50.html",
    ranges: [{ min: "2.4.5", max: "2.4.5-p13" }, { min: "2.4.6", max: "2.4.6-p11" }, { min: "2.4.7", max: "2.4.7-p6" }, { min: "2.4.8", max: "2.4.8-p1" }],
    fixedVersions: ["2.4.5-p13", "2.4.6-p11", "2.4.7-p6", "2.4.8-p1"], severity: "high", effectiveAt: "2025-06-10",
    qualification: "Requires authenticated administrator privileges. An isolated vendor patch may already be installed; patch installation was not checked. B2B extension versions are excluded." },
  { id: "CVE-2025-51586", products: ["prestashop"], kind: "vulnerability", title: "Back-office email enumeration",
    sourceUrl: "https://github.com/PrestaShop/PrestaShop/security/advisories/GHSA-8xx5-h6m3-jr33",
    ranges: [{ min: "1.0.0", max: "8.2.3" }], fixedVersions: ["8.2.3"], severity: "medium", effectiveAt: "2025-09-04",
    qualification: "Requires knowledge of the back-office URL. A manual patch may mitigate exposure; back-office access and patch installation were not checked." },
  { id: "CVE-2024-55893", products: ["typo3"], kind: "vulnerability", title: "Cross-site request forgery in Log Module",
    sourceUrl: "https://news.typo3.com/security/advisory/typo3-core-sa-2025-003",
    ranges: [{ min: "11.0.0", max: "11.5.42" }, { min: "12.0.0", max: "12.4.25" }, { min: "13.0.0", max: "13.4.3" }],
    fixedVersions: ["11.5.42", "12.4.25", "13.4.3"], severity: "medium", effectiveAt: "2025-01-14",
    qualification: "Requires an active backend session and interaction with a malicious URL. Backend configuration and ELTS patches were not checked." },
  { id: "CVE-2026-18412", products: ["opencart"], kind: "vulnerability", title: "Extension installer directory traversal",
    sourceUrl: "https://kb.cert.org/vuls/id/614868",
    ranges: [{ min: "4.2.0.0", max: "4.2.0.0", maxInclusive: true }], severity: "high", effectiveAt: "2026-08-10",
    qualification: "CERT confirms 4.2.0.0 only; other releases are not matched. Requires an administrator to install a malicious extension. No fixed version is identified in this catalogue." },
  { id: "joomla-3-community-eol", products: ["joomla"], kind: "lifecycle", title: "Joomla 3 community support ended",
    sourceUrl: "https://magazine.joomla.org/issues/2021/august-2021/joomla-3-10-end-of-support-handling",
    ranges: [{ min: "3.0.0", max: "4.0.0" }], severity: "medium", effectiveAt: "2023-08-17", qualification: "Community support ended; separately purchased or third-party extended support is not observable." },
  { id: "drupal-8-9-early-10-eol", products: ["drupal"], kind: "lifecycle", title: "Drupal branch outside core security coverage",
    sourceUrl: "https://www.drupal.org/sa-core-2025-001", ranges: [{ min: "8.0.0", max: "10.3.0" }], severity: "medium", effectiveAt: "2025-02-19", qualification: "The advisory documents these branches as end-of-life; third-party support arrangements are not observable." },
  { id: "typo3-11-community-eol", products: ["typo3"], kind: "lifecycle", title: "TYPO3 11 free support ended",
    sourceUrl: "https://news.typo3.com/article/secure-elts-for-typo3-v11", ranges: [{ min: "11.0.0", max: "12.0.0" }], severity: "medium", effectiveAt: "2024-11-01", qualification: "Paid ELTS is available. The scan cannot determine whether this installation has an ELTS subscription or patches." },
  { id: "adobe-2.4.0-2.4.3-regular-eol", products: ["magento", "adobe-commerce"], kind: "lifecycle", title: "Commerce 2.4.0–2.4.3 regular support ended",
    sourceUrl: "https://experienceleague.adobe.com/en/docs/commerce-operations/release/versions", ranges: [{ min: "2.4.0", max: "2.4.4" }], severity: "medium", effectiveAt: "2022-11-29", qualification: "Regular vendor support ended. Separate support contracts and backported fixes are not observable." },
  { id: "prestashop-1.7-project-eol", products: ["prestashop"], kind: "lifecycle", title: "PrestaShop 1.7 project maintenance ended",
    sourceUrl: "https://build.prestashop-project.org/news/2023/178-in-extended-support-phase/", ranges: [{ min: "1.7.0.0", max: "1.8.0.0" }], severity: "medium", effectiveAt: "2025-06-10", qualification: "The project tied 1.7.8 maintenance expiry to PrestaShop 9.0, released June 10, 2025. Third-party support is not assessed." },
];

/** v1 stays immutable so persisted assessments retain their original conclusions. */
export const CMS_SECURITY_RULES_V2: readonly CmsRule[] = [
  ...CMS_SECURITY_RULES_V1,
  { id: "wordpress-4.1-4.6-security-eol", products: ["wordpress"], kind: "lifecycle",
    title: "WordPress 4.1–4.6 security updates ended",
    sourceUrl: "https://wordpress.org/news/2025/06/dropping-security-updates-for-wordpress-versions-4-1-through-4-6/",
    ranges: [{ min: "4.1.0", max: "4.7.0" }], severity: "medium", effectiveAt: "2025-07-01",
    qualification: "The WordPress Security Team ended security updates for these branches in July 2025. The declared version is not runtime-confirmed; independently maintained patches or support were not checked." },
];

/** Historical catalogue rules and review dates remain immutable. */
export const CMS_SECURITY_RULES_V3: readonly CmsRule[] = [
  ...CMS_SECURITY_RULES_V2,
  { id: "drupal-7-community-eol", products: ["drupal"], kind: "lifecycle",
    title: "Drupal 7 community security support ended",
    sourceUrl: "https://www.drupal.org/psa-2023-06-07",
    ranges: [{ min: "7.0.0", max: "8.0.0" }], severity: "medium", effectiveAt: "2025-01-05",
    qualification: "Drupal Association and Drupal Security Team support ended. Paid or third-party extended security support and independently maintained patches are not observable." },
];

/** v4 changes lifecycle proof granularity only; source records stay unchanged. */
export const CMS_SECURITY_RULES = CMS_SECURITY_RULES_V3;
