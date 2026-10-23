import { CERT_SCORE_FINDING_REGISTRY } from "./finding-registry";
import { gpcReaderSummary } from "./gpc-reader-summary";
import { type AssessmentBrief, normalizeAssessmentCopy } from "./assessment-brief";

// Editorial aliases only. Canonical recipient identities and evidence are untouched.
const RECIPIENT_NAMES: Record<string, string> = {
  "Google LLC": "Google",
  "Meta Platforms, Inc.": "Meta",
  "Microsoft Corporation": "Microsoft",
};
const list = (values: string[]) => values.length < 3 ? values.join(" and ") : `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;

function firstObservedTime(times: number[]) {
  const min = Math.min(...times), max = Math.max(...times);
  return max - min < 0.1 ? `about ${max.toFixed(1)} seconds` : `about ${min.toFixed(1)}–${max.toFixed(1)} seconds`;
}

/** Shorten only known projected wording. Unknown copy and its qualifications stay whole. */
export function assessmentHighlightFacts(summary: string, id: string | null): string[] {
  // Historical projected snippets may end inside a semantic qualification.
  // Suppress the whole snippet rather than guessing its missing restriction.
  if (/(?:\.\.\.|…)$/.test(summary.trim())) return [];
  let copy = normalizeAssessmentCopy(summary).replace(/^Potential issue based on scan evidence; /, "");
  if (id === "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction") {
    copy = copy.replace(/^Partial support from scan evidence; /, "Partial evidence: ")
      .replace(/(\d+) tracking request\(s\)/g, (_match, count: string) => `${count} tracking ${count === "1" ? "request" : "requests"}`)
      .replace(" Review the recorded requests and how the Reject action controls this tracking activity.", "");
    copy = copy.replace(/Non-essential entities after Reject: (.+?)\. Classified non-essential cookies or service requests were observed after the Reject control was clicked\./, (original, inventory: string) => {
      const rows = inventory.split("; ").map(row => row.match(/^(.+) \((?:service request and cookie snapshot|cookie snapshot and service request|service request|cookie snapshot), first observed \+(\d+(?:\.\d+)?) ms after Reject click\)$/));
      if (rows.some(row => !row)) return original;
      const names = rows.map(row => RECIPIENT_NAMES[row![1]!] ?? row![1]!);
      const time = firstObservedTime(rows.map(row => Number(row![2]) / 1000));
      return `After the Reject click, non-essential cookies or service requests were observed for ${list(names)}; first observed ${time} after the click.`;
    });
  }
  if (id !== "gpc_response") {
    if (id === "regulatory_gap__gdpr_eprivacy__consent_surface_observed" && copy === "Not confirmed by scan evidence; The canonical pre-interaction consent assessment was limited, so consent-surface presence was not confirmed from retained evidence.") {
      return ["The scan could not confirm whether a consent interface was present; the pre-interaction assessment was limited."];
    }
    const detailed = copy;
    // Whole, recognized editorial shapes only; retain unfamiliar restrictions verbatim.
    copy = copy.replace(/^Cookies or browser storage were retained before consent\. First retained item: .+\. Essentiality was not confirmed for every item\.$/,
      "Cookies or browser storage were observed before consent. Essentiality was not confirmed for every item.")
      .replace("Tracking requests and embedded content were observed before consent. Review each observation’s evidence, affected pages and consent requirements.",
        "Tracking requests and embedded content were observed before consent.")
      .replace("Known 3rd party iframe embeds were retained before a recorded consent action on the scanned page. This establishes pre-consent embedded-service activity, not tracking classification by itself.",
        "Third-party frames loaded before recorded consent; this alone does not establish tracking.");
    if (id === "regulatory_gap__gdpr_eprivacy__options_settings_preferences_control" && copy === "Accept and Decline controls were observed on the first-layer consent surface. A separate preferences or granular-settings control was not retained on that layer. This is not necessarily a compliance gap where refusal is as easy as acceptance. Verify whether users can later review, vary, or withdraw consent by purpose.") {
      return [copy, "A first-layer settings control was not observed alongside Accept and Decline. Where refusal is as easy as acceptance, this need not be a compliance gap. Check how visitors can change or withdraw consent by purpose."];
    }
    if (id === "accessibility_priority_group") {
      const compact = copy.replace(/Automated accessibility checks found failures on \d+ tested pages? \(\d+ element failures?\)\. /g, "");
      // Measurements remain linked evidence; whole barrier descriptions and
      // any semantic qualifications stay in the concise group variant.
      const barriers = compact.replace(/ Retained examples measured \d+(?:\.\d+)?:1 \(required \d+(?:\.\d+)?:1\)(?:; \d+(?:\.\d+)?:1 \(required \d+(?:\.\d+)?:1\))*\./g, "");
      return [...new Set([copy, compact, barriers])];
    }
    return [...new Set([/^Cookies or browser storage were retained before consent\. First retained item:/.test(detailed) ? detailed : copy, copy])];
  }

  // Preserve the existing highlight policy for standalone capture diagnostics.
  // Semantic restrictions and any unfamiliar qualifications remain bound to their facts.
  copy = gpcReaderSummary(copy).replace(/GPC causation is not established\.\s*/g, "")
    .replace(/Bounded GPC observation was limited\.\s*/g, "")
    .replace(/Main-document GPC delivery was not fully verified\.\s*/g, "")
    .replace(/Request coverage was limited\.\s*/g, "")
    .replace(/CMP-recorded sale state: unknown; sharing state: unknown\.\s*/g, "")
    .replace(/CMP-recorded sale state: unknown; sharing state: (opted out|not opted out)\./g, "CMP-recorded sharing state: $1.")
    .replace(/CMP-recorded sale state: (opted out|not opted out); sharing state: unknown\./g, "CMP-recorded sale state: $1.");
  let core = "";
  copy = copy.replace(/Advertising identity, audience or synchronization activity with GPC enabled: (.+?\(first observed \+\d+(?:\.\d+)? ms from GPC visit start\))\./, (original, inventory: string) => {
    const rows = inventory.split("; ").map(row => row.match(/^(.+) \(first observed \+(\d+(?:\.\d+)?) ms from GPC visit start\)$/));
    if (rows.some(row => !row)) return original;
    const names = rows.map(row => RECIPIENT_NAMES[row![1]!] ?? row![1]!);
    const times = rows.map(row => Number(row![2]) / 1000);
    const time = firstObservedTime(times);
    core = `With Global Privacy Control (GPC) on, advertising identity, audience or sync activity was first observed for ${list(names)} ${time} into the visit.`;
    return core;
  });
  copy = copy.replace(/Bounded GPC observation completed\.\s*/g, "")
    .replace(/GPC (?:was observed on the main-document request and browser property|delivery was verified on the page request and browser setting)\./g, "GPC was verified in the page request and browser setting.")
    .replace(/(?:Retained GPC request samples include |)(\d+) classified advertising, marketing, analytics or replay requests(?: were observed with GPC)?, including (\d+) collection requests?\./g, (original, total: string, collection: string) => {
      if (!Number.isSafeInteger(Number(total)) || !Number.isSafeInteger(Number(collection)) || Number(collection) > Number(total)) return original;
      if (total === "0") return "The retained sample contains no classified tracking requests.";
      if (total === collection) return total === "1" ? "The sampled tracking request collected data." : `All ${total} sampled tracking requests collected data.`;
      return `Samples include ${total} tracking ${total === "1" ? "request" : "requests"}; ${collection} collected data.`;
    })
    // The absence of a detected response adds technical detail rather than an
    // actionable highlight. Keep the original comparison in the evidence copy.
    .replace(/(?:Paired activity comparison: no observable response\.|The paired comparison showed no observable GPC response\.)\s*/g, "")
    .replace("Paired activity comparison: responsive.", "The paired comparison showed an observable GPC response.");
  // The core variant is safe only for this exact, fully understood summary shape.
  // Any extra restriction, contradiction, unknown state or qualification binds the whole copy.
  const remainder = core ? copy.replace(core, "")
    .replace("GPC was verified in the page request and browser setting.", "")
    .replace(/The sampled tracking request collected data\.|All \d+ sampled tracking requests? collected data\.|Samples include \d+ tracking requests?; \d+ collected data\./, "")
    .replace(/The paired comparison showed (?:no observable|an observable) GPC response\./, "").trim() : copy;
  // Keep the comparison with the activity: a responsive result must never disappear.
  const comparison = copy.match(/The paired comparison showed (?:no observable|an observable) GPC response\./)?.[0];
  const compact = core && !remainder ? [core, comparison].filter(Boolean).join(" ") : "";
  return [...new Set([normalizeAssessmentCopy(copy), compact].filter(Boolean))].map(value =>
    value.replace(/\bCMP-recorded /g, "Consent platform recorded ")
      .replace(/\bGPC\b/, value.includes("Global Privacy Control") ? "GPC" : "Global Privacy Control (GPC)"));
}

// Only exact, known referral boilerplate is discarded; unfamiliar qualifications stay whole.
export function isAssessmentReferral(copy: string) {
  return /^(?:Review (?:the )?(?:(?:supporting|retained|automated accessibility) )?(?:evidence|findings)(?: and (?:recommended fixes|retained examples))?(?: in Detailed evidence| for this visit)?\.|Potential issue based on scan evidence\.)$/i.test(copy);
}

const COMPACT_ACTIONS: Record<string, string> = {
  site_integrity_hidden_outbound_links: "Trace the hidden links to their source; remove unintended links or make intended navigation visible, preserving legitimate skip links, then retest.",
  pre_consent_cookies_storage: "Check each retained item's purpose; defer confirmed non-essential storage until the relevant consent is given, then retest.",
  pre_consent_third_party_tracking: "Confirm each service's purpose and necessity; gate consent-dependent requests until consent, then retest.",
  social_media_embed_pre_consent: "Check the embed's purpose and consent requirements; delay consent-dependent loading until the relevant choice, then retest.",
  third_party_iframe_pre_consent: "Check the frame's purpose and consent requirements; delay consent-dependent loading until the relevant choice, then retest.",
  embedded_content_pre_consent: "Check the embedded service's purpose; gate consent-dependent loading on the relevant choice, then retest.",
  reject_all_path_availability: "Check the refusal path and make any required Reject or necessary-only choice easy to find and use, then retest.",
  options_settings_preferences_control: "Check how visitors can change or withdraw consent by purpose; provide an accessible settings path where required.",
  session_replay_fingerprinting_review: "Check replay activation and sensitive-field masking; apply the required consent controls and disclosures, then retest.",
  device_identification_fingerprinting_signal_observed: "Identify the scripts and their purpose; limit non-essential device-data collection and align disclosures and privacy controls.",
  california_rights_disclosure_not_observed: "Check which California privacy rights apply and add clear instructions for exercising them to the site's privacy disclosures.",
  consent_surface_observed: "Check whether optional services require consent on this page; verify the consent interface in a fresh visit and correct any confirmed gaps.",
  cookie_notice_policy_availability: "Check which cookie disclosures apply; provide an accessible notice covering the site's actual cookie purposes and choices, then verify its links.",
  privacy_notice_availability: "Publish an accessible privacy policy describing the site's actual data practices and link it from the affected pages.",
  transport_security_https_delivery: "Check the affected URL's HTTPS configuration, correct delivery failures, and retest.",
  transport_security_tls_certificate: "Correct the affected host's certificate or chain configuration, then verify HTTPS access.",
  transport_security_form_transport: "Use HTTPS for the affected form and its submission destination, then retest submission transport.",
  transport_security_mixed_content: "Replace the flagged HTTP resources with HTTPS versions or remove them, then retest.",
  transport_security_http_redirect: "Redirect the affected HTTP URLs to their HTTPS equivalents, then verify the redirect path.",
  accessibility_priority_group: "Fix the flagged accessibility barriers, then retest the affected elements with the relevant accessibility checks.",
  visual_contrast_accessibility_issue: "Fix the flagged contrast or color-only cues, then retest the affected elements.",
  text_alternative_accessibility_issue: "Add purpose-appropriate text alternatives to the flagged content; use empty alt text for decorative images, then retest.",
  focus_management_issue: "Correct focus movement, visibility and return behavior in the flagged controls, then test with a keyboard.",
  probable_fingerprinting: "Identify the scripts and their purpose; limit non-essential device-data collection and align disclosures and privacy controls.",
  site_integrity_cms_security: "Verify the installed version and backported fixes; update unsupported or vulnerable software, then retest.",
  gpc_response: "Check that GPC sets the sale/sharing opt-out and controls advertising collection.",
  post_reject_tracking_reduction: "Check which optional services run after Reject, correct their choice handling, and retest.",
};

/** Pick a complete, useful step, never a clipped fragment of a qualified instruction. */
export function assessmentHighlightAction(finding: NonNullable<AssessmentBrief["primary"]>) {
  const member = finding.readerMembers.length === 1 ? finding.readerMembers[0] : null;
  const id = (member?.id ?? finding.id ?? "").replace(/^regulatory_gap__gdpr_eprivacy__/, "");
  const summary = member?.summary ?? finding.readerSummary;
  // Older grouped accessibility projections carry unrelated catch-all remediation.
  if (id === "visual_contrast_accessibility_issue" && summary?.startsWith("Links were not distinguishable from surrounding text without relying on color")) {
    return "Add a persistent non-color cue, such as an underline, to the flagged links, then retest.";
  }
  if (id === "visual_contrast_accessibility_issue" && summary?.startsWith("Low-contrast text was detected")) {
    return "Adjust the affected text and background colors to meet the reported contrast requirement, then retest.";
  }
  if (finding.readerMembers.length > 1) {
    const fixes: Record<string, string> = {
      keyboard_navigation_accessibility_issue: "make the flagged regions and controls keyboard-operable",
      semantic_labeling_accessibility_issue: "correct the flagged accessible names and control semantics",
      visual_contrast_accessibility_issue: "fix the flagged contrast or color-only cues",
      text_alternative_accessibility_issue: "add purpose-appropriate text alternatives",
      target_size_accessibility_issue: "adjust the flagged target sizes or spacing",
      focus_management_issue: "correct the flagged focus behavior",
      zoom_restriction_accessibility_issue: "remove the flagged zoom restriction",
    };
    const steps = finding.readerMembers.map(member => {
      if (member.id === "visual_contrast_accessibility_issue" && member.summary?.startsWith("Links were not distinguishable from surrounding text without relying on color")) return "add a persistent non-color cue, such as an underline, to the flagged links";
      if (member.summary?.includes("Interactive controls were nested inside other interactive controls")) return "separate the flagged nested interactive controls";
      if (member.id === "semantic_labeling_accessibility_issue" && member.summary?.includes("Command controls lacked accessible names")) return "name the flagged command controls";
      if (member.id === "keyboard_navigation_accessibility_issue" && member.summary?.includes("Scrollable regions lacked keyboard access")) return "enable keyboard access to flagged scrollable regions";
      if (member.id === "semantic_labeling_accessibility_issue" && member.summary?.includes("Buttons lacked discernible accessible names; Links lacked discernible accessible names")) return "name the flagged buttons and links";
      return fixes[member.id ?? ""];
    });
    if (steps.every(Boolean)) {
      const action = `${list(steps as string[])}; then retest.`;
      if (action.length <= 180) return action[0]!.toUpperCase() + action.slice(1);
    }
    return "Fix the flagged accessibility barriers, then retest the affected elements with the relevant accessibility checks.";
  }
  if (id === "gpc_response" && summary.includes("sale state: opted out; sharing state: opted out")
      && /(?:[1-9]\d* collection requests?|[1-9]\d* collected data)/.test(summary)) {
    return "Check the collected data's purpose and whether the recorded opt-out applies; correct affected services and retest with GPC.";
  }
  const candidates = id === "visual_contrast_accessibility_issue" ? [] : member
    ? [CERT_SCORE_FINDING_REGISTRY[id]?.remediation ?? ""].filter(Boolean) : finding.actions;
  const action = candidates.find(value => value.length <= 180 && !isAssessmentReferral(value));
  if (action === "Check that GPC applies the relevant sale/sharing opt-out state and governs advertising collection.") return COMPACT_ACTIONS.gpc_response!;
  if (COMPACT_ACTIONS[id] && action && (
      /^Review (?:the )?retained (?:(?:checklist|vendor and request timing) evidence,|cookie and storage rows,)/.test(action)
      || id === "pre_consent_cookies_storage" && action === "Defer analytics cookies until explicit user consent is obtained.")) return COMPACT_ACTIONS[id]!;
  if (id === "pre_consent_cookies_storage" && action === "Inspect the listed cookie and storage identities, their purposes, and the retained timing evidence. Distinguish a directly observed write from snapshot presence.") return COMPACT_ACTIONS[id]!;
  if (id === "site_integrity_hidden_outbound_links" && action === "Ask the site owner to review the retained destination domains and concealment methods against the intended page content.") return COMPACT_ACTIONS[id]!;
  if (action) return action;
  if (COMPACT_ACTIONS[id]) return COMPACT_ACTIONS[id]!;
  const canonicalAction = CERT_SCORE_FINDING_REGISTRY[id]?.remediation;
  if (canonicalAction && canonicalAction.length <= 180) return canonicalAction;
  // Unknown identities get a conditional next step, not an invented fix or a legal conclusion.
  return "Confirm the reported issue, correct any confirmed problem, and retest the affected page.";
}
