export type CanonicalPolicyDocumentBrandRelationship = {
  targetDomain: string;
  policyDomains: readonly string[];
  ownerEntity: string;
  reasonCode: string;
};

/**
 * Canonical, deliberately narrow relationships for products whose governing
 * privacy notice is hosted on a different registrable domain. Entries must be
 * backed by a stable first-party relationship; ordinary vendor links do not
 * belong here.
 */
export const CANONICAL_POLICY_DOCUMENT_BRAND_RELATIONSHIPS:
  readonly CanonicalPolicyDocumentBrandRelationship[] = [
    {
      targetDomain: "tensorflow.org",
      policyDomains: ["policies.google.com", "privacy.google.com"],
      ownerEntity: "Google",
      reasonCode: "canonical_relationship_tensorflow_google",
    },
    {
      targetDomain: "fortiguard.com",
      policyDomains: ["fortinet.com"],
      ownerEntity: "Fortinet",
      reasonCode: "canonical_relationship_fortiguard_fortinet",
    },
  ];

export function canonicalPolicyDocumentBrandRelationship(input: {
  targetUrl: string;
  documentUrl: string;
}): CanonicalPolicyDocumentBrandRelationship | undefined {
  const targetHostname = hostname(input.targetUrl);
  const documentHostname = hostname(input.documentUrl);
  if (!targetHostname || !documentHostname) return undefined;

  return CANONICAL_POLICY_DOCUMENT_BRAND_RELATIONSHIPS.find((relationship) =>
    hostnameMatchesDomain(targetHostname, relationship.targetDomain) &&
    relationship.policyDomains.some((domain) => hostnameMatchesDomain(documentHostname, domain))
  );
}

function hostname(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function hostnameMatchesDomain(hostnameValue: string, domain: string): boolean {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");
  return hostnameValue === normalizedDomain || hostnameValue.endsWith(`.${normalizedDomain}`);
}
