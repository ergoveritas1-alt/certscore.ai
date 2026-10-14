/** Concise policy presentation. Source assessment and full passages stay in evidence. */
export function policyFindingSummary(input: {
  id: string; status: string; summary?: string; hasSupportingEvidence: boolean;
}) {
  const { id, status, summary, hasSupportingEvidence } = input;
  if (status === "Not confirmed" && [
    "Not confirmed by scan evidence; No production-approved topic match was established. This neutral result does not establish that the disclosure is absent.",
    "Not confirmed by scan evidence; No production-approved topic match was established. A retained candidate was rejected by the canonical projection and remains available for audit; this result does not establish that the disclosure is absent.",
  ].includes(summary ?? ""))
    return "This disclosure could not be confirmed from the saved policy evidence.";
  if (status !== "Observed" || !hasSupportingEvidence || !summary) return summary;
  // Only replace the standard excerpt preview, never a specific warning or limitation.
  if (/^Policy text included matching (?:international-transfer )?disclosure evidence:/.test(summary)) {
    const topics: Record<string, string> = {
      legal_basis_disclosure_observed: "Includes legal grounds for using personal data.",
      retention_disclosure_observed: "Describes when personal data is kept or deleted.",
      controller_contact_disclosure: "Identifies who is responsible for personal data and provides contact details.",
      processing_purposes_disclosure: "Describes purposes for using personal data.",
      recipients_vendor_categories_disclosure: "Identifies recipients or types of organizations that may receive personal data.",
      data_subject_rights_disclosure: "Describes rights people have over their personal data.",
      international_transfers_disclosure: "Addresses transfers of personal data to other countries.",
      dpo_contact_point_disclosure: "Provides contact details for a data protection officer.",
      supervisory_authority_complaint_disclosure: "Explains the right to complain to a data protection authority.",
      automated_decision_making_profiling_disclosure: "Addresses profiling or automated decisions about people.",
    };
    return topics[id] ?? summary;
  }
  if (id === "automated_decision_making_profiling_disclosure") {
    if (summary.startsWith("Profiling disclosed: individual interest tracking:"))
      return "Describes tracking pages visited to understand individual interests.";
    if (summary.startsWith("Profiling disclosed: engagement-based newsletter personalization:"))
      return "Describes tailoring newsletters based on how people interact with them.";
  }
  return summary;
}

/** Copy only, over projected results. Never changes assessment or evidence. */
export function detailedEvidenceCopy(input: { id?: string; status?: string; title: string; summary?: string }) {
  let { title, summary } = input;
  const id = input.id?.replace(/^evidence-row-/, "");
  if (["post_reject_tracking_reduction", "cmp-criterion-implementation"].includes(id ?? "") &&
      ["Limited", "Not assessed"].includes(input.status ?? "") && summary &&
      /^(?:Could not be fully evaluated using scan evidence; )?Post-choice consent-flow automation is deferred from the current production core scanner\./.test(summary))
    summary = "Post-choice tracking was not assessed in this saved scan.";
  const negative: Record<string, string> = {
    pre_consent_third_party_tracking: "No non-essential tracking requests were detected before a consent choice.",
    pre_consent_cookies_storage: "No non-essential cookie or storage writes were detected before a consent choice.",
    third_party_iframe_pre_consent: "No third-party iframes were detected before a consent choice.",
    social_media_embed_pre_consent: "No social or media services loaded before a consent choice.",
    embedded_content_pre_consent: "No third-party embeds were detected before a consent choice.",
    session_replay_fingerprinting_review: "No session-recording service was detected during this scan.",
    device_identification_fingerprinting_signal_observed: "No device-fingerprinting activity was detected during this scan.",
  };
  if (input.status === "Not observed" && id && negative[id]) summary = negative[id];
  if (input.status === "Observed") {
    const positive: Record<string, string> = {
      privacy_notice_availability: "A privacy-policy link or page was found.",
      transport_security_https_delivery: "The scanned page used HTTPS.",
      transport_security_tls_certificate: "The website's HTTPS certificate passed validation.",
      transport_security_http_redirect: "HTTP redirected to HTTPS.",
      transport_security_mixed_content: "No insecure HTTP resources were found on the scanned HTTPS page.",
      transport_security_form_transport: "No insecure form destinations were found during this scan.",
    };
    if (id && positive[id]) summary = positive[id];
    summary = summary?.replace(/^Policy text included matching (?:international-transfer )?disclosure evidence:\s*/, "Privacy policy: ");
  }
  const titles: Record<string, string> = {
    privacy_notice_availability: "Privacy-policy link or page",
    transport_security_https_delivery: "Secure page connection (HTTPS)",
    transport_security_tls_certificate: "Website certificate",
    transport_security_mixed_content: "Mixed-content check",
    transport_security_form_transport: "Form connection security",
    third_party_iframe_pre_consent: "Third-party iframes before consent",
    social_media_embed_pre_consent: "Social and media services before consent",
    embedded_content_pre_consent: "Third-party embeds before consent",
    session_replay_fingerprinting_review: "Session recording",
    device_identification_fingerprinting_signal_observed: "Device fingerprinting",
  };
  if (id && titles[id]) title = titles[id];
  if (input.id?.startsWith("cmp-criterion-") && summary) {
    summary = summary
      .replace("Consent surface observed on the initial visit.", "A cookie banner was displayed.")
      .replace("First-layer Reject or equivalent refusal control.", "Reject or an equivalent refusal option was available on the banner.")
      .replace("Public privacy-policy link or surface on the scanned page.", "A privacy-policy link or page was found.")
      .replace("A reject action and post-reject comparison window were retained, and eligible non-essential tracking activity persisted after reject.", "Non-essential tracking requests were detected after a confirmed Reject choice.")
      .replace(/(\d+) selectable categories observed in the inspected consent surface:/, (_match, count: string) => count === "1" ? "1 category was available:" : `${count} categories were available:`)
      .replace(/The CMP configuration identifies (\d+) individual services\. Separate service controls were not assessed\./, "The CMP lists $1 services. Individual service controls were not tested.")
      .replace("A privacy-policy link had an unobstructed click target before consent interaction. Retrieval of the linked document is outside this criterion.", "The privacy-policy link was accessible before a consent choice. The linked page was not checked here.")
      .replace("Accept and Reject client-side decision confirmed with a timestamp and hashed state evidence. Server-side audit history is outside this assessment.", "Accept and Reject choices were recorded in the browser with a timestamp.")
      .replace(/Cookie names, purposes and duration text were retained for (\d+) CMP inventory entries\./, "$1 cookie entries included names, purposes and storage durations.")
      .replace(/(\d+) observed cookie names did not match (\d+) retained CMP declaration patterns\./, "$1 cookie names did not match the CMP's $2 listed patterns.")
      .replace("Accept visit:", "After Accept:").replace("Reject visit:", "After Reject:")
      .replace("Captured cookie expiry only; future choice persistence and appropriateness are not assessed.", "Expiry was checked; long-term behavior was not tested.")
      .replace(/(\d+) of (\d+) retained CMP cookie declaration patterns matched the pre-consent cookie capture; (\d+) were not observed in that window\. Unobserved cookies may require consent or another page; this is not a declaration defect\./, "$1 of $2 CMP cookie patterns matched cookies found before consent; $3 were not seen. They may appear after consent or on other pages.");
    // Keep legacy assessment scopes intact; rename only the current scoped titles.
    const scopedTitles: Record<string,string> = {
      "Individual services identified in the CMP": "Services listed in the CMP",
      "Privacy-policy link reachable before consent interaction": "Privacy link accessible before consent",
      "Client-side consent decision recorded": "Consent choices saved in the browser",
      "Consent-cookie expiry observed": "Consent-cookie expiry",
      "CMP cookie declarations compared with pre-consent capture": "Declared cookies compared before consent",
      "Observed cookie names missing from CMP declarations": "Unmatched cookie names",
      "Information about cookies available (e.g., storage duration)": "Cookie information available",
    };
    title = scopedTitles[title] ?? title;
  }
  // Exact label aliases keep legacy criterion scopes and unknown labels intact.
  const conciseTitles: Record<string, string> = {
    "Cookie banner available": "Cookie banner",
    "Option to reject cookies available": "Reject option",
    "Accept / Reject prominence comparison": "Accept / Reject prominence",
    "Selection by categories available": "Category choices",
    "Services listed in the CMP": "CMP service list",
    "Individual services identified in the CMP": "CMP service list",
    "Link to privacy policy available": "Privacy-policy link",
    "Privacy link accessible before consent": "Privacy link before consent",
    "Consent choices saved in the browser": "Browser consent record",
    "Tracking activity after consent choices": "Tracking after consent choices",
    "Declared cookies compared before consent": "Pre-consent cookie comparison",
    "CMP cookie declarations compared with pre-consent capture": "Pre-consent cookie comparison",
    "Cookie information available": "Cookie details",
    "Information about cookies available (e.g., storage duration)": "Cookie details",
    "Privacy notice link/surface discovered": "Privacy policy or link",
    "Privacy-policy link or page": "Privacy policy or link",
    "Cookie disclosure available": "Cookie disclosure",
    "Cookie notice or policy surface": "Cookie disclosure",
    "Controller/contact disclosure": "Controller and contact details",
    "Processing purposes disclosure": "Data use purposes",
    "Legal basis disclosure": "Legal basis",
    "Recipients/vendor categories disclosed": "Recipients and vendor categories",
    "Retention disclosure": "Data retention",
    "Data subject rights disclosure": "Privacy rights",
    "International transfer disclosure": "International data transfers",
    "DPO contact point (where applicable)": "DPO contact (if applicable)",
    "Supervisory authority complaint": "Complaints to a regulator",
    "Profiling / automated decisions disclosure": "Profiling and automated decisions",
    "Automated decision-making / profiling disclosure": "Profiling and automated decisions",
    "Non-essential pre-consent cookies/storage": "Non-essential storage before consent",
    "Social and media services before consent": "Social/media services before consent",
    "Social/media embeds or plugins loaded before consent": "Social/media services before consent",
    "Embedded third-party services before consent": "Third-party embeds before consent",
    "3rd party iframes before consent": "Third-party iframes before consent",
    "Session replay signal": "Session recording",
    "Device identification / fingerprinting signal": "Device fingerprinting",
    "Secure page connection (HTTPS)": "HTTPS delivery",
    "HTTPS delivery for scanned pages": "HTTPS delivery",
    "Valid SSL/TLS certificate": "HTTPS certificate",
    "Website certificate": "HTTPS certificate",
    "HTTP redirects to HTTPS": "HTTP-to-HTTPS redirect",
    "Mixed-content check": "Mixed content",
    "Form connection security": "Form transport security",
    "Observed form transport": "Form transport security",
  };
  title = conciseTitles[title] ?? title;
  if (input.id?.startsWith("cmp-criterion-")) {
    if (input.status === "Not assessed") summary = summary
      ?.replace("Sufficient verified evidence for this criterion was not retained in this scan.", "Not enough verified evidence was captured.")
      .replace("The retained action evidence does not establish whether settings are implemented correctly. No implementation pass is inferred from an absence of findings.", "Action evidence was insufficient to assess implementation.");
    // Merge identical expiry statements only; different Accept/Reject results remain separate.
    summary = summary?.replace(/^After Accept: ([^;]+); After Reject: \1\./, "Accept and Reject: $1.");
  }
  summary = summary?.replace(/^Observed in policy-surface evidence; Privacy notice evidence was retained in public policy-surface evidence; policy surface: /, "Privacy-policy evidence: ")
    .replace("Potential issue based on scan evidence; Known 3rd party iframe embeds were retained before a recorded consent action on the scanned page.", "Known third-party iframes were detected before a consent choice.");
  return { title, summary };
}
