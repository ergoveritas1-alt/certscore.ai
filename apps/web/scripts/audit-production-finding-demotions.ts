import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";

type TargetFinding =
  | "accessibility_support_path_missing"
  | "privacy_contact_path_present"
  | "privacy_contact_channel_missing"
  | "privacy_policy_present"
  | "privacy_rights_path_present"
  | "pricing_or_fee_transparency_unclear"
  | "regulatory_compliance_claim_present"
  | "sale_sharing_controls_missing"
  | "targeted_advertising_disclosure_present"
  | "terms_of_service_present"
  | "tracking_technologies_disclosure_present";

type CandidateRow = {
  ad_network_google_ads: boolean | null;
  ad_network_meta_ads: boolean | null;
  advertising_tracker_count: number | null;
  accessibility_contact_method_present: boolean | null;
  accessibility_statement_present: boolean | null;
  completed_at: string;
  domain: string;
  do_not_sell_link_present: boolean | null;
  final_url: string | null;
  mentions_data_sale_or_sharing: boolean | null;
  privacy_contact_method_present: boolean | null;
  privacy_policy_present: boolean | null;
  privacy_request_form_present: boolean | null;
  privacy_contact_channel_type: string | null;
  terms_of_service_present: boolean | null;
  data_access_request_present: boolean | null;
  data_deletion_request_present: boolean | null;
  fee_related_text_present: boolean | null;
  pricing_page_present: boolean | null;
  retargeting_pixel_detected: boolean | null;
  scan_id: string;
  verified_public_surfaces_count: number | null;
};

type LiveProbe = {
  assessment: "supports_demotion" | "needs_review" | "supports_promotion";
  evidenceUrl: string | null;
  rationale: string;
};

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getNumberArg(flag: string, fallback: number) {
  const raw = getArgValue(flag);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getDomainArgs() {
  const index = process.argv.indexOf("--domains");
  if (index === -1) {
    return [];
  }
  const values: string[] = [];
  for (const value of process.argv.slice(index + 1)) {
    if (value.startsWith("--")) {
      break;
    }
    values.push(value);
  }
  return values
    .join(" ")
    .split(/[,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeFinding(value: string | null): TargetFinding | "all" {
  if (!value || value === "all") {
    return "all";
  }
  if (
    value === "accessibility_support_path_missing" ||
    value === "privacy_contact_path_present" ||
    value === "privacy_contact_channel_missing" ||
    value === "privacy_policy_present" ||
    value === "privacy_rights_path_present" ||
    value === "pricing_or_fee_transparency_unclear" ||
    value === "regulatory_compliance_claim_present" ||
    value === "sale_sharing_controls_missing" ||
    value === "targeted_advertising_disclosure_present" ||
    value === "terms_of_service_present" ||
    value === "tracking_technologies_disclosure_present"
  ) {
    return value;
  }
  throw new Error(`Unsupported finding: ${value}`);
}

function getBaseUrl(row: Pick<CandidateRow, "domain" | "final_url">) {
  const candidate = row.final_url && /^https?:\/\//i.test(row.final_url) ? row.final_url : `https://${row.domain}`;
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return `https://${row.domain}`;
  }
}

function getText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(baseUrl: string, html: string, pattern: RegExp) {
  const links = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (!href || /^(mailto|tel|javascript):/i.test(href)) {
      continue;
    }
    try {
      const url = new URL(href, baseUrl).toString();
      if (pattern.test(url)) {
        links.add(url);
      }
    } catch {
      // Ignore malformed page links.
    }
  }
  return [...links].slice(0, 6);
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 (compatible; CertScoreCalibration/1.0; +https://certscore.ai)"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok || !/text|html|xml/i.test(response.headers.get("content-type") ?? "")) {
      return null;
    }
    const html = await response.text();
    return {
      finalUrl: response.url,
      html,
      text: getText(html)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getCandidateUrls(input: {
  baseUrl: string;
  homepage: Awaited<ReturnType<typeof fetchText>>;
  patterns: RegExp[];
  paths: string[];
}) {
  const linkedUrls = input.homepage
    ? input.patterns.flatMap((pattern) => extractLinks(input.baseUrl, input.homepage!.html, pattern))
    : [];
  return [...new Set([...linkedUrls, ...input.paths.map((path) => `${input.baseUrl}${path}`)])].slice(0, 14);
}

function hasPrivacyRightsMechanism(text: string) {
  return /(?:privacy rights|rights (?:portal|center)|privacy (?:portal|center|request)|(?:access|delete|deletion|correction|opt-out|data) request|request (?:access|deletion|correction|a copy)|submit (?:a )?request|exercise (?:your )?rights|privacy@|data protection officer|\bdpo\b|webform|request form)/i.test(text);
}

function hasPrivacySpecificContact(text: string) {
  return /privacy@|privacy (?:team|office|department|request|contact|form|portal)|data protection officer|\bdpo\b|privacy rights|personal information request|data request/i.test(text);
}

async function probePrivacyPolicy(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: ["/privacy", "/privacy-policy", "/privacy-notice", "/legal/privacy"],
    patterns: [/privacy/i]
  });

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (/privacy (?:policy|notice|statement)|personal information|personal data/i.test(page.text)) {
      return {
        assessment: "supports_promotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found a substantive privacy policy or privacy notice surface."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale: "Live URL probe did not find a substantive privacy policy page; do not promote from a thin footer signal alone."
  };
}

async function probePrivacyContact(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: ["/privacy", "/privacy-policy", "/privacy-notice", "/privacy-center", "/contact"],
    patterns: [/privacy|contact|data-protection|dpo/i]
  });

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (hasPrivacySpecificContact(page.text)) {
      return {
        assessment: "supports_promotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found a privacy-specific contact channel or data-protection contact path."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale: "Live URL probe did not find a privacy-specific contact channel; generic support/contact evidence is not enough."
  };
}

async function probePrivacyRights(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: [
      "/privacy",
      "/privacy-policy",
      "/privacy-center",
      "/privacy-rights",
      "/privacy-request",
      "/privacy-choices",
      "/data-request",
      "/ccpa"
    ],
    patterns: [/privacy|rights|request|ccpa|data/i]
  });

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (hasPrivacyRightsMechanism(page.text)) {
      return {
        assessment: "supports_promotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found a concrete privacy-rights request mechanism, portal, form, or instructions."
      };
    }
    if (/privacy rights|right to access|right to delete|right to correct|your rights/i.test(page.text)) {
      return {
        assessment: "needs_review",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found generic privacy-rights language but not a concrete request mechanism."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale: "Live URL probe did not find a concrete privacy-rights path."
  };
}

async function probePricingTransparency(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: ["/pricing", "/fees", "/plans", "/subscribe", "/checkout"],
    patterns: [/pricing|fees|plans|subscribe|checkout|membership/i]
  });

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    const hasFeeClaim = /\b(?:fee|fees|pricing|price|cost|monthly|annual|subscription|subscribe|membership|trial|\$|usd)\b/i.test(page.text);
    const hasMaterialTerms = /refund|cancel|cancellation|renewal|billing|terms|fee schedule|withdrawal|conditions/i.test(page.text);
    if (hasFeeClaim && !hasMaterialTerms) {
      return {
        assessment: "supports_promotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found fee/pricing language without nearby material fee, billing, cancellation, or terms context."
      };
    }
    if (hasFeeClaim && hasMaterialTerms) {
      return {
        assessment: "supports_demotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found fee/pricing language with nearby material terms context."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: row.final_url,
    rationale: "Live URL probe did not find enough pricing context to confirm or demote the transparency finding."
  };
}

async function probeAccessibility(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const linkedUrls = homepage ? extractLinks(baseUrl, homepage.html, /accessibility|accommodation|ada/i) : [];
  const candidateUrls = [
    ...linkedUrls,
    `${baseUrl}/accessibility`,
    `${baseUrl}/accessibility/`,
    `${baseUrl}/accessibility-statement`,
    `${baseUrl}/accessibility/feedback-form`
  ];

  for (const url of [...new Set(candidateUrls)]) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (/accessibility|accommodation|assistive|screen reader|wcag/i.test(page.text)) {
      const hasSupportPath = /feedback|contact|help|support|suggestions?|issue|phone|email|form/i.test(page.text);
      return {
        assessment: hasSupportPath ? "supports_demotion" : "needs_review",
        evidenceUrl: page.finalUrl,
        rationale: hasSupportPath
          ? "Live URL review found an accessibility surface or support path, so the missing-path interpretation should not promote."
          : "Live URL review found accessibility content, but support-path language was not clear enough for automatic promotion or demotion."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale: "Live URL probe did not find an accessibility surface; retain as review unless bounded crawl evidence confirms absence."
  };
}

async function probeSaleSharing(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const linkedUrls = homepage
    ? extractLinks(baseUrl, homepage.html, /privacy|do-not-sell|do-not-share|privacy-choices|opt-?out|cookie/i)
    : [];
  const candidateUrls = [
    ...linkedUrls,
    `${baseUrl}/privacy`,
    `${baseUrl}/privacy-policy`,
    `${baseUrl}/privacy-center`,
    `${baseUrl}/privacy-choices`,
    `${baseUrl}/your-privacy-choices`,
    `${baseUrl}/do-not-sell`
  ];
  let behaviorDisclosureUrl: string | null = null;

  for (const url of [...new Set(candidateUrls)].slice(0, 12)) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (/do not sell|do not share|your privacy choices|privacy choices|opt out of targeted advertising|global privacy control|\bgpc\b/i.test(page.text)) {
      return {
        assessment: "supports_demotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found a do-not-sell/share, privacy choices, opt-out, or GPC control path."
      };
    }
    if (/targeted advertising|cross-context behavioral|personalized ads?|advertising partners|sale or sharing|sell or share/i.test(page.text)) {
      behaviorDisclosureUrl = behaviorDisclosureUrl ?? page.finalUrl;
    }
  }

  if (behaviorDisclosureUrl) {
    return {
      assessment: "needs_review",
      evidenceUrl: behaviorDisclosureUrl,
      rationale: "Live URL review found sale/sharing or targeted-advertising disclosure language but did not find a control path in the bounded probe."
    };
  }

  return {
    assessment: "supports_demotion",
    evidenceUrl: null,
    rationale: "Live URL probe did not corroborate sale/sharing disclosure or a missing control path; runtime retargeting alone is insufficient."
  };
}

async function probeTermsOfService(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: ["/terms", "/terms-of-service", "/terms-and-conditions", "/legal/terms", "/terms-of-use"],
    patterns: [/terms|conditions|tos|legal/i]
  });

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (/terms (?:of service|of use)|terms and conditions|user agreement|conditions of use|arbitration|governing law/i.test(page.text)) {
      return {
        assessment: "supports_promotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found a substantive terms, conditions, or user-agreement surface."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale: "Live URL probe did not find a substantive terms surface; do not promote from a thin inferred signal alone."
  };
}

async function probePrivacyContactMissing(row: CandidateRow): Promise<LiveProbe> {
  const contactProbe = await probePrivacyContact(row);
  if (contactProbe.assessment === "supports_promotion") {
    return {
      assessment: "supports_demotion",
      evidenceUrl: contactProbe.evidenceUrl,
      rationale: "Live URL review found a privacy-specific contact channel, so the missing privacy-contact interpretation should not promote."
    };
  }

  return {
    assessment: "needs_review",
    evidenceUrl: contactProbe.evidenceUrl,
    rationale: "Live URL probe did not find a privacy-specific contact channel; absence needs retained crawl scope before external promotion."
  };
}

async function probeTrackingDisclosure(row: CandidateRow, kind: "tracking" | "targeted_advertising"): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: ["/privacy", "/privacy-policy", "/privacy-notice", "/cookie-policy", "/cookies", "/privacy-center"],
    patterns: [/privacy|cookie|tracking|advertising|notice/i]
  });
  const pattern =
    kind === "tracking"
      ? /cookies?|tracking technolog(?:y|ies)|pixels?|web beacons?|analytics|similar technolog(?:y|ies)/i
      : /targeted advertising|personalized ads?|interest-based advertising|cross-context behavioral advertising|advertising partners/i;

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (pattern.test(page.text)) {
      return {
        assessment: "supports_promotion",
        evidenceUrl: page.finalUrl,
        rationale:
          kind === "tracking"
            ? "Live URL review found a policy/cookie surface disclosing cookies, pixels, analytics, or similar tracking technologies."
            : "Live URL review found a policy surface disclosing targeted, personalized, interest-based, or cross-context advertising."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale:
      kind === "tracking"
        ? "Live URL probe did not find tracking-technology disclosure language; keep the positive disclosure finding review-only without retained policy text."
        : "Live URL probe did not find targeted-advertising disclosure language; keep the positive disclosure finding review-only without retained policy text."
  };
}

async function probeRegulatoryComplianceClaim(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: ["/", "/about", "/legal", "/regulation", "/compliance", "/licenses"],
    patterns: [/about|legal|regulat|compliance|license|licence|security/i]
  });

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (/\b(?:regulated|registered|licensed|authori[sz]ed|member (?:finra|sipc)|sec|finra|fca|asic|cysec|nfa|cftc)\b/i.test(page.text)) {
      return {
        assessment: "supports_promotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found regulatory, registration, authorization, license, or supervisory claim language."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale: "Live URL probe did not find regulatory claim language; keep the interpretation review-only without retained claim text."
  };
}

async function loadCandidates(finding: TargetFinding, input: { domains: string[]; limit: number }) {
  const predicateByFinding: Record<TargetFinding, string> = {
    accessibility_support_path_missing: `ss.accessibility_contact_method_present is false and ss.accessibility_statement_present is false`,
    privacy_contact_path_present: `ss.privacy_contact_method_present is true or exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'privacy.privacy_contact_path_present')`,
    privacy_contact_channel_missing: `ss.privacy_contact_channel_type = 'none' or exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'privacy.privacy_contact_channel_missing')`,
    privacy_policy_present: `ss.privacy_policy_present is true or exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'disclosure.privacy_policy_present')`,
    privacy_rights_path_present: `ss.privacy_request_form_present is true or ss.data_access_request_present is true or ss.data_deletion_request_present is true or exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'privacy.privacy_rights_path_present')`,
    pricing_or_fee_transparency_unclear: `ss.fee_related_text_present is true or ss.pricing_page_present is true or exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'financial.pricing_or_fee_transparency_unclear')`,
    regulatory_compliance_claim_present: `exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'entity.regulatory_or_license_claim_text_present' and sig.signal_value_json = 'true'::jsonb)`,
    sale_sharing_controls_missing: `ss.retargeting_pixel_detected is true and ss.do_not_sell_link_present is false`,
    targeted_advertising_disclosure_present: `exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'privacy.targeted_advertising_disclosure_present' and sig.signal_value_json = 'true'::jsonb)`,
    terms_of_service_present: `ss.terms_of_service_present is true or exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'disclosure.terms_of_service_present')`,
    tracking_technologies_disclosure_present: `exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'privacy.tracking_technologies_disclosure_present' and sig.signal_value_json = 'true'::jsonb)`
  };
  const predicate = predicateByFinding[finding];
  const domainPredicate =
    input.domains.length > 0
      ? `and lower(regexp_replace(ss.domain, '^www\\.', '')) = any($2::text[])`
      : "";
  const params = input.domains.length > 0
    ? [input.limit, input.domains.map((domain) => domain.replace(/^www\./, ""))]
    : [input.limit];

  const result = await query<CandidateRow>(
    `
      select distinct on (ss.domain)
             s.id as scan_id,
             s.completed_at::text as completed_at,
             ss.domain,
             ss.final_url,
             ss.accessibility_contact_method_present,
             ss.accessibility_statement_present,
             ss.privacy_contact_method_present,
             ss.privacy_policy_present,
             ss.privacy_contact_channel_type,
             ss.privacy_request_form_present,
             ss.terms_of_service_present,
             ss.data_access_request_present,
             ss.data_deletion_request_present,
             ss.retargeting_pixel_detected,
             ss.do_not_sell_link_present,
             ss.mentions_data_sale_or_sharing,
             ss.ad_network_google_ads,
             ss.ad_network_meta_ads,
             ss.advertising_tracker_count,
             ss.fee_related_text_present,
             ss.pricing_page_present,
             ss.verified_public_surfaces_count
        from scans s
        join scan_snapshots ss on ss.scan_id = s.id
       where s.status = 'completed'
         and s.organization_id is not null
         and s.scan_type = 'full'
         and ${predicate}
         ${domainPredicate}
       order by ss.domain, s.completed_at desc
       limit $1
    `,
    params,
    { readOnly: true }
  );

  return result.rows;
}

function localAssessment(finding: TargetFinding, row: CandidateRow): LiveProbe {
  if (finding === "accessibility_support_path_missing") {
    const surfaces = row.verified_public_surfaces_count ?? 0;
    return {
      assessment: surfaces >= 3 ? "needs_review" : "supports_demotion",
      evidenceUrl: row.final_url,
      rationale:
        surfaces >= 3
          ? "Scanner observed several public surfaces but retained no accessibility support path; needs external URL review before promotion."
          : "Scanner coverage is too limited to promote a missing accessibility support path from absence booleans alone."
    };
  }

  if (finding === "privacy_policy_present") {
    return {
      assessment: row.privacy_policy_present === true ? "supports_promotion" : "needs_review",
      evidenceUrl: row.final_url,
      rationale: row.privacy_policy_present === true
        ? "Scanner retained a privacy-policy-present signal; live URL review should confirm the surface is substantive."
        : "No direct privacy-policy snapshot field was retained; needs URL review before promotion."
    };
  }

  if (finding === "privacy_contact_path_present") {
    return {
      assessment: row.privacy_contact_method_present === true ? "supports_promotion" : "needs_review",
      evidenceUrl: row.final_url,
      rationale: row.privacy_contact_method_present === true
        ? "Scanner retained a privacy-specific contact signal; live URL review should confirm it is not generic support-only contact."
        : "No direct privacy-contact snapshot field was retained; needs URL review before promotion."
    };
  }

  if (finding === "privacy_contact_channel_missing") {
    return {
      assessment: row.privacy_contact_channel_type === "none" ? "needs_review" : "supports_demotion",
      evidenceUrl: row.final_url,
      rationale:
        row.privacy_contact_channel_type === "none"
          ? "Missing privacy-contact findings need retained crawl scope plus URL review; a none channel alone is not enough."
          : "Scanner retained a privacy contact channel, so the missing-contact interpretation should not promote."
    };
  }

  if (finding === "privacy_rights_path_present") {
    const concreteRights =
      row.privacy_request_form_present === true ||
      row.data_access_request_present === true ||
      row.data_deletion_request_present === true;
    return {
      assessment: concreteRights ? "supports_promotion" : "needs_review",
      evidenceUrl: row.final_url,
      rationale: concreteRights
        ? "Scanner retained a concrete privacy request/data rights signal; live URL review should confirm the mechanism."
        : "Privacy-rights promotion needs a concrete portal, form, email, or request instruction, not generic rights language."
    };
  }

  if (finding === "pricing_or_fee_transparency_unclear") {
    return {
      assessment: row.fee_related_text_present === true || row.pricing_page_present === true ? "needs_review" : "supports_demotion",
      evidenceUrl: row.final_url,
      rationale: "Pricing transparency needs live offer-page context because fee-related text alone can be generic or balanced by nearby terms."
    };
  }

  if (finding === "regulatory_compliance_claim_present") {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Regulatory-compliance claims need live claim text or retained snippets; generic entity signals are not enough."
    };
  }

  if (finding === "terms_of_service_present") {
    return {
      assessment: row.terms_of_service_present === true ? "supports_promotion" : "needs_review",
      evidenceUrl: row.final_url,
      rationale:
        row.terms_of_service_present === true
          ? "Scanner retained a terms-present signal; live URL review should confirm the surface is substantive."
          : "No direct terms-present snapshot field was retained; needs URL review before promotion."
    };
  }

  if (finding === "tracking_technologies_disclosure_present" || finding === "targeted_advertising_disclosure_present") {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Positive tracking/ad disclosure findings need retained policy text or live policy-page confirmation."
    };
  }

  const hasBehaviorOnly = row.retargeting_pixel_detected === true && row.mentions_data_sale_or_sharing !== true;
  return {
    assessment: hasBehaviorOnly ? "supports_demotion" : "needs_review",
    evidenceUrl: row.final_url,
    rationale: hasBehaviorOnly
      ? "Runtime retargeting is present, but retained policy evidence does not disclose sale/sharing behavior; keep out of external surfacing."
      : "Retained policy/runtime signals may support the interpretation, but need a policy anchor plus missing control-path evidence."
  };
}

async function main() {
  const finding = normalizeFinding(getArgValue("--finding"));
  const domains = getDomainArgs();
  const limit = getNumberArg("--limit", 12);
  const liveCheck = hasFlag("--live-check");
  const findings: TargetFinding[] =
    finding === "all"
      ? [
          "accessibility_support_path_missing",
          "sale_sharing_controls_missing",
          "privacy_policy_present",
          "regulatory_compliance_claim_present",
          "privacy_contact_path_present",
          "privacy_contact_channel_missing",
          "privacy_rights_path_present",
          "pricing_or_fee_transparency_unclear",
          "terms_of_service_present",
          "tracking_technologies_disclosure_present",
          "targeted_advertising_disclosure_present"
        ]
      : [finding];
  const rows: string[] = [
    "# Production Finding Evidence Audit",
    "",
    `Live check: ${liveCheck ? "enabled" : "disabled"}`,
    "",
    "| Finding | Domain | Local assessment | Live assessment | Evidence URL | Rationale |",
    "|---|---|---|---|---|---|"
  ];

  for (const findingId of findings) {
    const candidates = await loadCandidates(findingId, { domains, limit });
    for (const candidate of candidates) {
      const local = localAssessment(findingId, candidate);
      const live = liveCheck
        ? findingId === "accessibility_support_path_missing"
          ? await probeAccessibility(candidate)
          : findingId === "sale_sharing_controls_missing"
            ? await probeSaleSharing(candidate)
            : findingId === "regulatory_compliance_claim_present"
              ? await probeRegulatoryComplianceClaim(candidate)
            : findingId === "terms_of_service_present"
              ? await probeTermsOfService(candidate)
            : findingId === "privacy_contact_channel_missing"
              ? await probePrivacyContactMissing(candidate)
            : findingId === "tracking_technologies_disclosure_present"
              ? await probeTrackingDisclosure(candidate, "tracking")
            : findingId === "targeted_advertising_disclosure_present"
              ? await probeTrackingDisclosure(candidate, "targeted_advertising")
            : findingId === "privacy_policy_present"
              ? await probePrivacyPolicy(candidate)
              : findingId === "privacy_contact_path_present"
                ? await probePrivacyContact(candidate)
                : findingId === "privacy_rights_path_present"
                  ? await probePrivacyRights(candidate)
                  : await probePricingTransparency(candidate)
        : null;
      const effective = live ?? local;
      rows.push(
        `| \`${findingId}\` | ${candidate.domain} | ${local.assessment} | ${live?.assessment ?? "not_run"} | ${effective.evidenceUrl ?? ""} | ${effective.rationale.replace(/\|/g, "/")} |`
      );
    }
  }

  process.stdout.write(`${rows.join("\n")}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
