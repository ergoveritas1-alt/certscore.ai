export type CanonicalPolicyDocumentBrandRelationship = {
  targetDomain: string;
  policyDomains: readonly string[];
  ownerEntity: string;
  reasonCode: string;
  validFrom?: string;
  validThrough?: string;
  source?: {
    title: string;
    url: string;
    verifiedAt: string;
  };
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
      targetDomain: "ms.now",
      policyDomains: ["versantprivacy.com"],
      ownerEntity: "Versant Media",
      reasonCode: "canonical_relationship_ms_now_versant_v1",
      validFrom: "2025-11-15",
      source: { title:"Versant brands — MS NOW", url:"https://www.versantmedia.com/about", verifiedAt:"2026-10-17" },
    },
    {
      targetDomain: "arstechnica.com",
      policyDomains: ["condenast.com"],
      ownerEntity: "Condé Nast",
      reasonCode: "canonical_relationship_ars_technica_conde_nast_v1",
      validFrom: "2026-10-14",
      source: {
        title: "Condé Nast — Ars Technica brand",
        url: "https://commercial.condenast.com/brands/ars-technica",
        verifiedAt: "2026-10-14",
      },
    },
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
    {
      targetDomain: "aajtak.in",
      policyDomains: ["indiatodaygroup.com"],
      ownerEntity: "India Today Group",
      reasonCode: "canonical_relationship_aajtak_india_today_group",
      source: {
        title: "India Today Group brands",
        url: "https://www.indiatodaygroup.com/",
        verifiedAt: "2026-08-31",
      },
    },
    {
      targetDomain: "indiatoday.in",
      policyDomains: ["indiatodaygroup.com"],
      ownerEntity: "India Today Group",
      reasonCode: "canonical_relationship_india_today_group",
      source: {
        title: "India Today Group brands",
        url: "https://www.indiatodaygroup.com/",
        verifiedAt: "2026-08-31",
      },
    },
    {
      targetDomain: "msnbc.com",
      policyDomains: ["versantprivacy.com"],
      ownerEntity: "Versant Media",
      reasonCode: "canonical_relationship_msnbc_ms_now_versant",
      validFrom: "2025-11-15",
      source: {
        title: "MS NOW to debut on Nov. 15: Same mission. New name.",
        url: "https://www.versantmedia.com/newsroom/news/ms-now",
        verifiedAt: "2026-08-31",
      },
    },
    {
      targetDomain: "telemundo.com",
      policyDomains: ["nbcuniversalprivacy.com"],
      ownerEntity: "NBCUniversal Media",
      reasonCode: "canonical_relationship_telemundo_nbcuniversal",
      source: {
        title: "NBCUniversal Terms for Telemundo Networks",
        url: "https://www.nbcuniversal.com/terms?intake=Telemundo_Networks",
        verifiedAt: "2026-08-31",
      },
    },
    {
      targetDomain: "wpguardian.com",
      policyDomains: ["wpguardian.io"],
      ownerEntity: "WP Guardian",
      reasonCode: "canonical_relationship_wpguardian_cross_tld",
      source: {
        title: "WebPros WP Guardian product annex",
        url: "https://www.webpros.com/wp-content/uploads/2026/03/Webpros-Terms-of-Service-for-SaaS-Services-0326.pdf",
        verifiedAt: "2026-08-31",
      },
    },
  ];

export function canonicalPolicyDocumentBrandRelationship(input: {
  targetUrl: string;
  documentUrl: string;
  observedAt?: string;
}): CanonicalPolicyDocumentBrandRelationship | undefined {
  const targetHostname = hostname(input.targetUrl);
  const documentHostname = hostname(input.documentUrl);
  if (!targetHostname || !documentHostname) return undefined;

  return CANONICAL_POLICY_DOCUMENT_BRAND_RELATIONSHIPS.find((relationship) =>
    hostnameMatchesDomain(targetHostname, relationship.targetDomain) &&
    relationship.policyDomains.some((domain) => hostnameMatchesDomain(documentHostname, domain)) &&
    relationshipIsValidAt(relationship, input.observedAt)
  );
}

function relationshipIsValidAt(
  relationship: CanonicalPolicyDocumentBrandRelationship,
  observedAt: string | undefined,
): boolean {
  if (!relationship.validFrom && !relationship.validThrough) return true;
  if (!observedAt) return false;
  const observedAtMs = Date.parse(observedAt);
  if (!Number.isFinite(observedAtMs)) return false;
  const validFromMs = relationship.validFrom
    ? Date.parse(`${relationship.validFrom}T00:00:00.000Z`)
    : Number.NEGATIVE_INFINITY;
  const validThroughMs = relationship.validThrough
    ? Date.parse(`${relationship.validThrough}T23:59:59.999Z`)
    : Number.POSITIVE_INFINITY;
  return observedAtMs >= validFromMs && observedAtMs <= validThroughMs;
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

/** Reviewed owner-policy routes for positive opt-out signals only. These grants
 * do not upgrade general policy ownership, negative coverage or scoring. */
export const REVIEWED_OPT_OUT_POLICY_OWNERS = [
  {id:"ramnode_inmotion_opt_out.v1",targetDomain:"ramnode.com",policyDomain:"inmotionhosting.com",
    paths:["/legal/privacy-policy/"],indexPaths:[] as string[],owner:"InMotion Hosting",
    verifiedAt:"2026-10-24",sourceUrl:"https://ramnode.com/"},
  {id:"bournemouth_newsquest_opt_out.v1",targetDomain:"bournemouthecho.co.uk",policyDomain:"newsquest.co.uk",
    paths:["/our-policies/privacy-policy/"],indexPaths:["/our-policies/"],owner:"Newsquest Media Group",
    verifiedAt:"2026-10-24",sourceUrl:"https://www.bournemouthecho.co.uk/"},
] as const;
export function reviewedOptOutPolicyOwner(targetUrl:string,documentUrl:string,observedAt:string){
  try {
    const target=new URL(targetUrl),document=new URL(documentUrl),at=Date.parse(observedAt);
    if(target.protocol!=="https:"||document.protocol!=="https:"||target.username||target.password||target.port||document.username||document.password||document.search||document.hash||document.port)return undefined;
    return REVIEWED_OPT_OUT_POLICY_OWNERS.find(row=>hostname(targetUrl)===row.targetDomain&&hostname(documentUrl)===row.policyDomain&&
      row.paths.some(path=>document.pathname.replace(/\/$/,"")===path.replace(/\/$/,""))&&Number.isFinite(at)&&at>=Date.parse(row.verifiedAt+"T00:00:00.000Z"));
  }catch{return undefined;}
}
export function reviewedOptOutPolicyIndexLink(targetUrl:string,documentUrl:string,label:string,location:string){
  if(!["footer","header"].includes(location)||!/^policies$|^our policies$/i.test(label.trim()))return false;
  try {const url=new URL(documentUrl);return url.protocol==="https:"&&!url.username&&!url.password&&!url.search&&!url.hash&&!url.port&&
    REVIEWED_OPT_OUT_POLICY_OWNERS.some(row=>hostname(targetUrl)===row.targetDomain&&hostname(documentUrl)===row.policyDomain&&
      row.indexPaths.some(path=>url.pathname.replace(/\/$/,"")===path.replace(/\/$/,"")));
  }catch{return false;}
}
