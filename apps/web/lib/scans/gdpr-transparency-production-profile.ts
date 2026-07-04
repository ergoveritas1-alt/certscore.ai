export const GDPR_TRANSPARENCY_PRODUCTION_EVIDENCE_PROFILES = [
  "legacy_only",
  "gdpr_transparency_multilingual_article13_v1",
] as const;

export type GdprTransparencyProductionEvidenceProfile =
  (typeof GDPR_TRANSPARENCY_PRODUCTION_EVIDENCE_PROFILES)[number];

export const DEFAULT_GDPR_TRANSPARENCY_PRODUCTION_EVIDENCE_PROFILE =
  "gdpr_transparency_multilingual_article13_v1" satisfies GdprTransparencyProductionEvidenceProfile;

export const GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE =
  "gdpr_transparency_multilingual_article13_v1" satisfies GdprTransparencyProductionEvidenceProfile;

export function normalizeGdprTransparencyProductionEvidenceProfile(
  value: unknown,
): GdprTransparencyProductionEvidenceProfile {
  if (value === "legacy_only") {
    return "legacy_only";
  }
  return value === GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE
    ? GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE
    : DEFAULT_GDPR_TRANSPARENCY_PRODUCTION_EVIDENCE_PROFILE;
}

export function getGdprTransparencyProductionEvidenceProfileFromEnv(
  env: Record<string, string | undefined> = process.env,
): GdprTransparencyProductionEvidenceProfile {
  return normalizeGdprTransparencyProductionEvidenceProfile(
    env.CERTSCORE_GDPR_TRANSPARENCY_EVIDENCE_PROFILE?.trim(),
  );
}

export function gdprTransparencyProductionEvidenceProfileEnabled(
  profile: unknown,
): profile is typeof GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE {
  return normalizeGdprTransparencyProductionEvidenceProfile(profile) ===
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE;
}
