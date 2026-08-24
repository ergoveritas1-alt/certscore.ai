import { classifyGdprTransparencyTopics, normalizeGdprTransparencyText } from "./gdpr-transparency-topic-classifier";
import { classifyPrivacySurface } from "./privacy-surface-classifier";
import type { SupportedPrivacyEvidenceLocale } from "./supported-languages";

export type GdprSupplementLinkClassification = {
  classifierProvenance: "gdpr_supplement_link_classifier.v1";
  confidence: number;
  likelySupplement: boolean;
  matchedJurisdictionMarker?: string;
  matchedLocale?: SupportedPrivacyEvidenceLocale;
  reasonCodes: string[];
};

const GDPR_JURISDICTION_MARKERS = [
  "general data protection regulation",
  "datenschutz-grundverordnung",
  "reglement general sur la protection des donnees",
  "reglamento general de proteccion de datos",
  "regulamento geral sobre a protecao de dados",
  "regolamento generale sulla protezione dei dati",
  "ogolne rozporzadzenie o ochronie danych",
  "algemene verordening gegevensbescherming",
  "regulamentul general privind protectia datelor",
  "reglament general de proteccio de dades",
  "regulamento xeral de proteccion de datos",
  "gdpr",
  "dsgvo",
  "rgpd",
  "rodo",
  "avg",
] as const;

export function classifyGdprSupplementLink(input: {
  linkText?: string | null;
  surroundingText?: string | null;
  url?: string | null;
}): GdprSupplementLinkClassification {
  const evidence = [input.linkText, input.url, input.surroundingText]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const normalizedEvidence = normalizeGdprTransparencyText(evidence.replace(/[\/_-]+/g, " "));
  const matchedJurisdictionMarker = GDPR_JURISDICTION_MARKERS.find((marker) =>
    hasBoundedMarker(normalizedEvidence, marker)
  );
  const surface = classifyPrivacySurface({
    linkText: input.linkText,
    surroundingText: input.surroundingText,
    url: input.url,
  });
  const transparency = classifyGdprTransparencyTopics({ text: evidence });
  const hasCanonicalPolicyEvidence = surface.surfaceType === "privacy_policy" ||
    transparency.matches.some((match) =>
      match.matchStrength === "direct" || match.matchStrength === "equivalent"
    );
  const legacyEuropeanResidentClickThrough =
    /\b(?:additional\s+(?:rights|protections?)|eu(?:ropean)?\s+(?:residents?|users?)|international\s+users?)\b.{0,140}\bclick\s+here\b/i.test(evidence);
  const generalLegalFrameworkResource =
    /\b(?:reglement europeen|europaisch(?:e|es|en) datenschutz(?:recht|verordnung)|reglamento europeo|regolamento europeo)\b/i.test(normalizedEvidence) &&
    !/\b(?:privacy|confidentialite|datenschutzerklarung|aviso|informativa|politica|notice|policy)\b/i.test(normalizedEvidence);
  const likelySupplement = Boolean(
    !generalLegalFrameworkResource && (
      legacyEuropeanResidentClickThrough ||
      (matchedJurisdictionMarker && hasCanonicalPolicyEvidence)
    )
  );
  const matchedLocale = surface.matchedLocale ?? transparency.matches[0]?.matchedLocale;

  return {
    classifierProvenance: "gdpr_supplement_link_classifier.v1",
    confidence: likelySupplement
      ? matchedJurisdictionMarker && hasCanonicalPolicyEvidence ? 0.9 : 0.82
      : 0,
    likelySupplement,
    matchedJurisdictionMarker,
    matchedLocale,
    reasonCodes: likelySupplement
      ? [
          "gdpr_supplement_link_observed",
          ...(matchedJurisdictionMarker ? ["canonical_gdpr_jurisdiction_marker"] : []),
          ...(surface.surfaceType === "privacy_policy" ? ["canonical_privacy_surface_match"] : []),
          ...(transparency.matches.length > 0 ? ["canonical_transparency_topic_match"] : []),
          ...(legacyEuropeanResidentClickThrough ? ["bounded_european_resident_clickthrough"] : []),
        ]
      : [
          generalLegalFrameworkResource
            ? "general_legal_framework_resource_not_policy_supplement"
            : "gdpr_supplement_link_not_established",
        ],
  };
}

function hasBoundedMarker(value: string, marker: string): boolean {
  let index = value.indexOf(marker);
  while (index >= 0) {
    const before = index === 0 ? " " : value[index - 1] ?? " ";
    const afterIndex = index + marker.length;
    const after = afterIndex >= value.length ? " " : value[afterIndex] ?? " ";
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
      return true;
    }
    index = value.indexOf(marker, index + 1);
  }
  return false;
}
