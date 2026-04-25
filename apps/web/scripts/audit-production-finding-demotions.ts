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
  | "third_party_advertising_disclosure_present"
  | "unqualified_superlative_claim_detected"
  | "children_privacy_disclosure_present"
  | "do_not_sell_sharing_disclosure_conflict"
  | "session_replay_observed"
  | "simulated_performance_without_disclosure"
  | "policy_clarity_risk"
  | "gpc_disclosure_present"
  | "cookie_disclosure_gap"
  | "arbitration_clause_present"
  | "behavioral_analytics_disclosure_present"
  | "cookie_policy_present"
  | "guaranteed_outcome_claim_detected"
  | "missing_retention_disclosure"
  | "missing_transfer_disclosure"
  | "missing_dsar_mechanism"
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
  cookie_policy_present: boolean | null;
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
  session_replay_tool_detected: boolean | null;
  session_replay_tracker_count: number | null;
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
    value === "third_party_advertising_disclosure_present" ||
    value === "unqualified_superlative_claim_detected" ||
    value === "children_privacy_disclosure_present" ||
    value === "do_not_sell_sharing_disclosure_conflict" ||
    value === "session_replay_observed" ||
    value === "simulated_performance_without_disclosure" ||
    value === "policy_clarity_risk" ||
    value === "gpc_disclosure_present" ||
    value === "cookie_disclosure_gap" ||
    value === "arbitration_clause_present" ||
    value === "behavioral_analytics_disclosure_present" ||
    value === "cookie_policy_present" ||
    value === "guaranteed_outcome_claim_detected" ||
    value === "missing_retention_disclosure" ||
    value === "missing_transfer_disclosure" ||
    value === "missing_dsar_mechanism" ||
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

async function probeTrackingDisclosure(
  row: CandidateRow,
  kind: "tracking" | "targeted_advertising" | "third_party_advertising" | "children" | "gpc"
): Promise<LiveProbe> {
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
      : kind === "targeted_advertising"
        ? /targeted advertising|personalized ads?|interest-based advertising|cross-context behavioral advertising|advertising partners/i
        : kind === "third_party_advertising"
          ? /third-party advertising|advertising partners?|ad networks?|advertising service providers?|advertising companies/i
          : kind === "children"
            ? /children(?:'s)? privacy|under (?:13|16)|minors?|knowingly collect.*children/i
            : /global privacy control|\bgpc\b|browser opt-out preference|universal opt-out/i;

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
            : kind === "targeted_advertising"
              ? "Live URL review found a policy surface disclosing targeted, personalized, interest-based, or cross-context advertising."
              : kind === "third_party_advertising"
                ? "Live URL review found a policy surface disclosing third-party advertising partners, ad networks, or advertising service providers."
                : kind === "children"
                  ? "Live URL review found a children privacy or under-13/under-16 disclosure."
                  : "Live URL review found a Global Privacy Control or universal opt-out disclosure."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale:
      kind === "tracking"
        ? "Live URL probe did not find tracking-technology disclosure language; keep the positive disclosure finding review-only without retained policy text."
        : kind === "targeted_advertising"
          ? "Live URL probe did not find targeted-advertising disclosure language; keep the positive disclosure finding review-only without retained policy text."
          : kind === "third_party_advertising"
            ? "Live URL probe did not find third-party advertising disclosure language; keep the positive disclosure finding review-only without retained policy text."
            : kind === "children"
              ? "Live URL probe did not find children privacy disclosure language; keep the positive disclosure finding review-only without retained policy text."
              : "Live URL probe did not find GPC disclosure language; keep the positive disclosure finding review-only without retained policy text."
  };
}

async function probeUnqualifiedSuperlative(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  if (homepage && /\b(best|top|leading|#1|number one|premier|ultimate)\b/i.test(homepage.text) && /invest|trading|trade|forex|signal|portfolio|return|profit/i.test(homepage.text)) {
    return {
      assessment: "supports_promotion",
      evidenceUrl: homepage.finalUrl,
      rationale: "Live URL review found financial/investment context with best, top, leading, or similar superlative claim language."
    };
  }

  return {
    assessment: "needs_review",
    evidenceUrl: homepage?.finalUrl ?? null,
    rationale: "Live URL probe did not find enough financial-context superlative language; keep the finding review-only without retained claim text."
  };
}

async function probeDoNotSellSharingConflict(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const homepageHasAdtech = homepage ? /fbq\(|connect\.facebook\.net|googletagmanager|google-analytics|doubleclick|clarity\.ms/i.test(homepage.html) : false;
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: ["/privacy", "/privacy-policy", "/privacy-notice", "/privacy-choices", "/your-privacy-choices", "/do-not-sell"],
    patterns: [/privacy|do-not-sell|do-not-share|privacy-choices|opt-?out|cookie/i]
  });

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    const hasDoNotSellClaim = /do not sell|do not share|not sell or share|we do not sell|we do not share/i.test(page.text);
    if (hasDoNotSellClaim && (homepageHasAdtech || row.retargeting_pixel_detected === true || (row.advertising_tracker_count ?? 0) > 0)) {
      return {
        assessment: "supports_promotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found a do-not-sell/share claim plus homepage or retained evidence of advertising/retargeting technology."
      };
    }
    if (hasDoNotSellClaim) {
      return {
        assessment: "needs_review",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found do-not-sell/share language, but runtime adtech evidence needs retained artifact corroboration."
      };
    }
  }

  return {
    assessment: "supports_demotion",
    evidenceUrl: null,
    rationale: "Live URL probe did not find a do-not-sell/share claim; conflict interpretation should not promote without both policy and runtime anchors."
  };
}

async function probeSessionReplayObserved(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  if (homepage && /fullstory|hotjar|clarity\.ms|logrocket|sessioncam|smartlook/i.test(homepage.html)) {
    return {
      assessment: "supports_promotion",
      evidenceUrl: homepage.finalUrl,
      rationale: "Live URL review found a known session replay vendor script or runtime marker on the homepage."
    };
  }

  return {
    assessment: row.session_replay_tool_detected === true || (row.session_replay_tracker_count ?? 0) > 0 ? "needs_review" : "supports_demotion",
    evidenceUrl: homepage?.finalUrl ?? row.final_url,
    rationale:
      row.session_replay_tool_detected === true || (row.session_replay_tracker_count ?? 0) > 0
        ? "Scanner retained session replay evidence, but external promotion should rely on retained vendor/runtime artifacts."
        : "No session replay runtime marker was found by the bounded URL probe or retained snapshot fields."
  };
}

async function probeSimulatedPerformance(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  if (homepage && /backtest|backtested|simulated|hypothetical|model(?:ed)? performance|paper trading/i.test(homepage.text) && /return|profit|performance|strategy|trading|investment/i.test(homepage.text)) {
    return {
      assessment: "supports_promotion",
      evidenceUrl: homepage.finalUrl,
      rationale: "Live URL review found financial/investment context with backtested, simulated, hypothetical, or modeled performance language."
    };
  }

  return {
    assessment: "needs_review",
    evidenceUrl: homepage?.finalUrl ?? null,
    rationale: "Live URL probe did not find enough simulated-performance claim context; keep review-only without retained claim text."
  };
}

async function probePolicyClarity(row: CandidateRow): Promise<LiveProbe> {
  const privacy = await probePrivacyPolicy(row);
  if (privacy.assessment !== "supports_promotion" || !privacy.evidenceUrl) {
    return {
      assessment: "needs_review",
      evidenceUrl: privacy.evidenceUrl,
      rationale: "Policy clarity risk needs a fetched substantive policy plus retained ambiguity or low-coverage evidence."
    };
  }

  return {
    assessment: "needs_review",
    evidenceUrl: privacy.evidenceUrl,
    rationale: "Live URL review found a policy surface; clarity-risk promotion still needs retained ambiguity score, word-count, or parser-quality evidence."
  };
}

async function probeCookieDisclosureGap(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: ["/privacy", "/privacy-policy", "/cookie-policy", "/cookies", "/privacy-center"],
    patterns: [/privacy|cookie|tracking|notice/i]
  });

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (/cookie table|cookie list|cookies? we use|tracking technolog(?:y|ies)|pixels?|analytics/i.test(page.text)) {
      return {
        assessment: "needs_review",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found cookie/tracking disclosure language; gap promotion requires retained runtime cookie inventory plus missing/partial policy coverage."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale: "Live URL probe did not find cookie disclosure language; gap promotion still needs retained runtime cookie inventory and policy anchor evidence."
  };
}

async function probeCookiePolicy(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: ["/cookie-policy", "/cookies", "/privacy-choices", "/cookie-notice", "/privacy", "/privacy-policy"],
    patterns: [/cookie|privacy-choices|privacychoices|privacy|notice/i]
  });

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (/cookie policy|cookie notice|cookie settings|privacy choices|cookies? we use|manage cookies|cookie preferences/i.test(page.text)) {
      return {
        assessment: "supports_promotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found a substantive cookie policy, cookie notice, cookie settings, or privacy choices surface."
      };
    }
  }

  return {
    assessment: row.cookie_policy_present === true ? "needs_review" : "supports_demotion",
    evidenceUrl: homepage?.finalUrl ?? row.final_url,
    rationale:
      row.cookie_policy_present === true
        ? "Scanner retained a cookie-policy-present signal, but live URL review did not confirm a substantive cookie surface."
        : "Live URL probe and retained snapshot fields did not confirm a cookie policy surface."
  };
}

async function probeBehavioralAnalyticsDisclosure(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const candidateUrls = getCandidateUrls({
    baseUrl,
    homepage,
    paths: ["/privacy", "/privacy-policy", "/cookie-policy", "/cookies", "/privacy-center"],
    patterns: [/privacy|cookie|analytics|tracking|notice/i]
  });

  for (const url of candidateUrls) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (/behavioral analytics|session recording|session replay|heatmaps?|product analytics|usage analytics|record(?:ing)? interactions/i.test(page.text)) {
      return {
        assessment: "supports_promotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found behavioral analytics, heatmap, session-recording, or product analytics disclosure language."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale: "Live URL probe did not find behavioral-analytics disclosure language; keep positive interpretation review-only without retained policy text."
  };
}

async function probeGuaranteedOutcomeClaim(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  if (
    homepage &&
    /\bguarante(?:e|ed|es|eing)\b/i.test(homepage.text) &&
    /profit|return|payout|pass(?:ing)?|funded|trading|investment|income|earn/i.test(homepage.text)
  ) {
    return {
      assessment: "supports_promotion",
      evidenceUrl: homepage.finalUrl,
      rationale: "Live URL review found guaranteed outcome language in a financial, trading, payout, or investment context."
    };
  }

  return {
    assessment: "needs_review",
    evidenceUrl: homepage?.finalUrl ?? null,
    rationale: "Live URL probe did not find enough guaranteed-outcome financial claim context; keep review-only without retained claim text."
  };
}

async function probeMissingPolicyDisclosure(row: CandidateRow, kind: "retention" | "transfer"): Promise<LiveProbe> {
  const privacy = await probePrivacyPolicy(row);
  if (!privacy.evidenceUrl) {
    return {
      assessment: "needs_review",
      evidenceUrl: null,
      rationale: `Missing ${kind} disclosure needs a fetched primary privacy policy plus retained section-review evidence.`
    };
  }

  const page = await fetchText(privacy.evidenceUrl);
  if (!page) {
    return {
      assessment: "needs_review",
      evidenceUrl: privacy.evidenceUrl,
      rationale: `Missing ${kind} disclosure needs retained section-review evidence because the policy page could not be re-fetched.`
    };
  }

  const hasDisclosure =
    kind === "retention"
      ? /retention|retain|deleted within|stored for|as long as reasonably necessary|how long.*keep/i.test(page.text)
      : /data privacy framework|\bdpf\b|standard contractual clauses|\bsccs?\b|binding corporate rules|adequacy decision|international transfer|cross-border transfer/i.test(page.text);

  if (hasDisclosure) {
    return {
      assessment: "supports_demotion",
      evidenceUrl: page.finalUrl,
      rationale: `Live URL review found ${kind} disclosure language, so the missing-disclosure interpretation should not promote.`
    };
  }

  return {
    assessment: "needs_review",
    evidenceUrl: page.finalUrl,
    rationale: `Live URL review did not find ${kind} disclosure language; promotion still needs retained section-review evidence confirming the scoped absence.`
  };
}

async function probeMissingDsarMechanism(row: CandidateRow): Promise<LiveProbe> {
  const privacy = await probePrivacyPolicy(row);
  if (!privacy.evidenceUrl) {
    return {
      assessment: "needs_review",
      evidenceUrl: null,
      rationale: "Missing DSAR mechanism needs a fetched primary privacy policy plus retained section-review evidence."
    };
  }

  const page = await fetchText(privacy.evidenceUrl);
  if (!page) {
    return {
      assessment: "needs_review",
      evidenceUrl: privacy.evidenceUrl,
      rationale: "Missing DSAR mechanism needs retained section-review evidence because the policy page could not be re-fetched."
    };
  }

  if (hasPrivacyRightsMechanism(page.text)) {
    return {
      assessment: "supports_demotion",
      evidenceUrl: page.finalUrl,
      rationale: "Live URL review found a concrete privacy-rights request mechanism, so the missing-DSAR interpretation should not promote."
    };
  }

  return {
    assessment: "needs_review",
    evidenceUrl: page.finalUrl,
    rationale: "Live URL review did not find a concrete DSAR mechanism; promotion still needs retained section-review evidence confirming the scoped absence."
  };
}

async function probeArbitrationClause(row: CandidateRow): Promise<LiveProbe> {
  const terms = await probeTermsOfService(row);
  if (!terms.evidenceUrl) {
    return {
      assessment: "needs_review",
      evidenceUrl: null,
      rationale: "Arbitration clause promotion needs a fetched terms surface and retained arbitration/dispute-resolution text."
    };
  }
  const page = await fetchText(terms.evidenceUrl);
  if (page && /arbitration|class action waiver|waive.*jury|dispute resolution|binding arbitrat/i.test(page.text)) {
    return {
      assessment: "supports_promotion",
      evidenceUrl: page.finalUrl,
      rationale: "Live URL review found arbitration, class-action waiver, jury waiver, or binding dispute-resolution language."
    };
  }

  return {
    assessment: "needs_review",
    evidenceUrl: terms.evidenceUrl,
    rationale: "Live URL review found a terms surface but not arbitration-specific language."
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
    tracking_technologies_disclosure_present: `exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'privacy.tracking_technologies_disclosure_present' and sig.signal_value_json = 'true'::jsonb)`,
    third_party_advertising_disclosure_present: `exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'privacy.third_party_advertising_disclosure_present' and sig.signal_value_json = 'true'::jsonb)`,
    unqualified_superlative_claim_detected: `exists (select 1 from validation_runs vr join validation_run_findings vf on vf.validation_run_id = vr.id where vr.scan_id = s.id and vf.rule_key = 'financial_review.unqualified_superlative_claim_detected')`,
    children_privacy_disclosure_present: `exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'privacy.children_privacy_disclosure_present' and sig.signal_value_json = 'true'::jsonb)`,
    do_not_sell_sharing_disclosure_conflict: `ss.retargeting_pixel_detected is true and (ss.do_not_sell_link_present is true or ss.mentions_data_sale_or_sharing is true or exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key in ('privacy.targeted_advertising_disclosure_present','privacy.third_party_advertising_disclosure_present') and sig.signal_value_json = 'true'::jsonb))`,
    session_replay_observed: `(ss.session_replay_tool_detected is true or ss.session_replay_tracker_count > 0 or exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key in ('privacy.session_replay_runtime_detected','commerce.session_replay_tool_detected','privacy.session_replay_runtime_vendors')))`,
    simulated_performance_without_disclosure: `exists (select 1 from validation_runs vr join validation_run_findings vf on vf.validation_run_id = vr.id where vr.scan_id = s.id and vf.rule_key = 'financial_review.simulated_performance_without_disclosure')`,
    policy_clarity_risk: `exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key in ('policyAmbiguityScore','disclosure.privacy_policy_word_count'))`,
    gpc_disclosure_present: `exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'privacy.gpc_disclosure_present' and sig.signal_value_json = 'true'::jsonb)`,
    cookie_disclosure_gap: `exists (select 1 from validation_runs vr join validation_run_findings vf on vf.validation_run_id = vr.id where vr.scan_id = s.id and vf.rule_key = 'cookie_runtime.disclosure_gap')`,
    arbitration_clause_present: `exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'commerce.arbitration_clause_present' and sig.signal_value_json = 'true'::jsonb)`,
    behavioral_analytics_disclosure_present: `exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'privacy.behavioral_analytics_disclosure_present' and sig.signal_value_json = 'true'::jsonb)`,
    cookie_policy_present: `ss.cookie_policy_present is true or exists (select 1 from scan_signals sig where sig.scan_id = s.id and sig.signal_key = 'disclosure.cookie_policy_present')`,
    guaranteed_outcome_claim_detected: `exists (select 1 from validation_runs vr join validation_run_findings vf on vf.validation_run_id = vr.id where vr.scan_id = s.id and vf.rule_key = 'financial_review.guaranteed_outcome_claim_detected')`,
    missing_retention_disclosure: `exists (select 1 from validation_runs vr join validation_run_findings vf on vf.validation_run_id = vr.id where vr.scan_id = s.id and vf.rule_key = 'section_review.no_retention_periods_noted')`,
    missing_transfer_disclosure: `exists (select 1 from validation_runs vr join validation_run_findings vf on vf.validation_run_id = vr.id where vr.scan_id = s.id and vf.rule_key = 'section_review.no_transfer_mechanism_noted')`,
    missing_dsar_mechanism: `exists (select 1 from validation_runs vr join validation_run_findings vf on vf.validation_run_id = vr.id where vr.scan_id = s.id and vf.rule_key = 'section_review.no_dsar_mechanism')`
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
             ss.cookie_policy_present,
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
             ss.session_replay_tool_detected,
             ss.session_replay_tracker_count,
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

  if (finding === "third_party_advertising_disclosure_present" || finding === "children_privacy_disclosure_present") {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Positive policy disclosure findings need retained policy text or live policy-page confirmation."
    };
  }

  if (finding === "unqualified_superlative_claim_detected") {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Financial superlative findings need retained claim text and financial context before promotion."
    };
  }

  if (finding === "do_not_sell_sharing_disclosure_conflict") {
    return {
      assessment: row.retargeting_pixel_detected === true ? "needs_review" : "supports_demotion",
      evidenceUrl: row.final_url,
      rationale: "Do-not-sell/share conflicts need both a retained policy claim and concrete runtime adtech evidence."
    };
  }

  if (finding === "session_replay_observed") {
    return {
      assessment: row.session_replay_tool_detected === true || (row.session_replay_tracker_count ?? 0) > 0 ? "supports_promotion" : "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Session replay observations should rely on retained vendor/runtime artifacts, not generic analytics signals."
    };
  }

  if (finding === "simulated_performance_without_disclosure") {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Simulated performance findings need retained claim text and adjacent disclosure context before promotion."
    };
  }

  if (finding === "policy_clarity_risk") {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Policy clarity risk needs retained ambiguity, low-coverage, or parser-quality evidence."
    };
  }

  if (finding === "gpc_disclosure_present" || finding === "arbitration_clause_present") {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Positive policy/terms findings need retained policy text or live page confirmation."
    };
  }

  if (finding === "behavioral_analytics_disclosure_present") {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Behavioral analytics disclosure findings need retained policy text or live policy-page confirmation."
    };
  }

  if (finding === "cookie_policy_present") {
    return {
      assessment: row.cookie_policy_present === true ? "supports_promotion" : "needs_review",
      evidenceUrl: row.final_url,
      rationale:
        row.cookie_policy_present === true
          ? "Scanner retained a cookie-policy-present signal; live URL review should confirm the surface is substantive."
          : "No direct cookie-policy snapshot field was retained; needs URL review before promotion."
    };
  }

  if (finding === "guaranteed_outcome_claim_detected") {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Guaranteed outcome findings need retained claim text and financial context before promotion."
    };
  }

  if (
    finding === "missing_retention_disclosure" ||
    finding === "missing_transfer_disclosure" ||
    finding === "missing_dsar_mechanism"
  ) {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Missing-disclosure findings need a fetched primary policy plus retained section-review evidence for scoped absence."
    };
  }

  if (finding === "cookie_disclosure_gap") {
    return {
      assessment: "needs_review",
      evidenceUrl: row.final_url,
      rationale: "Cookie disclosure gaps need retained runtime cookie inventory plus policy coverage evidence."
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
          "targeted_advertising_disclosure_present",
          "third_party_advertising_disclosure_present",
          "unqualified_superlative_claim_detected",
          "children_privacy_disclosure_present",
          "do_not_sell_sharing_disclosure_conflict",
          "session_replay_observed",
          "simulated_performance_without_disclosure",
          "policy_clarity_risk",
          "gpc_disclosure_present",
          "cookie_disclosure_gap",
          "arbitration_clause_present",
          "behavioral_analytics_disclosure_present",
          "cookie_policy_present",
          "guaranteed_outcome_claim_detected",
          "missing_retention_disclosure",
          "missing_transfer_disclosure",
          "missing_dsar_mechanism"
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
            : findingId === "third_party_advertising_disclosure_present"
              ? await probeTrackingDisclosure(candidate, "third_party_advertising")
            : findingId === "children_privacy_disclosure_present"
              ? await probeTrackingDisclosure(candidate, "children")
            : findingId === "unqualified_superlative_claim_detected"
              ? await probeUnqualifiedSuperlative(candidate)
            : findingId === "do_not_sell_sharing_disclosure_conflict"
              ? await probeDoNotSellSharingConflict(candidate)
            : findingId === "session_replay_observed"
              ? await probeSessionReplayObserved(candidate)
            : findingId === "simulated_performance_without_disclosure"
              ? await probeSimulatedPerformance(candidate)
            : findingId === "policy_clarity_risk"
              ? await probePolicyClarity(candidate)
            : findingId === "gpc_disclosure_present"
              ? await probeTrackingDisclosure(candidate, "gpc")
            : findingId === "cookie_disclosure_gap"
              ? await probeCookieDisclosureGap(candidate)
            : findingId === "arbitration_clause_present"
              ? await probeArbitrationClause(candidate)
            : findingId === "behavioral_analytics_disclosure_present"
              ? await probeBehavioralAnalyticsDisclosure(candidate)
            : findingId === "cookie_policy_present"
              ? await probeCookiePolicy(candidate)
            : findingId === "guaranteed_outcome_claim_detected"
              ? await probeGuaranteedOutcomeClaim(candidate)
            : findingId === "missing_retention_disclosure"
              ? await probeMissingPolicyDisclosure(candidate, "retention")
            : findingId === "missing_transfer_disclosure"
              ? await probeMissingPolicyDisclosure(candidate, "transfer")
            : findingId === "missing_dsar_mechanism"
              ? await probeMissingDsarMechanism(candidate)
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
