export const SUPPORTED_PRIVACY_EVIDENCE_LOCALES = [
  "en",
  "de",
  "fr",
  "es",
  "it",
  "nl",
  "pl",
] as const;

export type SupportedPrivacyEvidenceLocale = typeof SUPPORTED_PRIVACY_EVIDENCE_LOCALES[number];

export function isSupportedPrivacyEvidenceLocale(
  value: string | null | undefined,
): value is SupportedPrivacyEvidenceLocale {
  return SUPPORTED_PRIVACY_EVIDENCE_LOCALES.includes(value as SupportedPrivacyEvidenceLocale);
}
