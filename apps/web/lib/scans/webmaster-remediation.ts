import { SITE_INTEGRITY_REMEDIATION } from "./site-integrity-remediation";
import { accessibilityCorrectionGuidance, accessibilityRemediationVerification } from "./accessibility-correction-guidance";

export type WebmasterRemediation = {
  owner: string;
  steps: readonly string[];
  verification: string;
};

const tracking: WebmasterRemediation = {
  owner: "Developer + tag-manager owner; privacy owner confirms purposes",
  steps: [
    "In DevTools Network, filter each listed hostname/path, reload with site data cleared, and open its Initiator stack. Locate the originating tag, inline script, embed or CMS/plugin configuration; search source files for the hostname if no initiator was retained. Record each integration's purpose and required consent category with the privacy owner.",
    "Move consent-dependent initialization behind the CMP's confirmed category state: default optional loaders and storage writers to off, and start them only after the matching category is granted. Remove unconditional page-load triggers and duplicate hard-coded tags. A banner, consent cookie, or denied-storage flag alone does not prevent a request.",
    "Apply the same gate to deferred callbacks, SPA route changes, timers and retries. For replay tools, exclude sensitive pages and mask inputs; verify with non-sensitive test values in staging. A script download does not prove what was recorded. Do not delete essential or consent-decision storage indiscriminately. Publish the approved source/CMP changes and clear caches.",
  ],
  verification: "Use three independent fresh sessions: no choice, confirmed Reject, and confirmed Accept. For each relevant category, compare the listed requests and storage writes over equal windows at least as long as the retained comparison. Consent-dependent collection must not start before a grant or after refusal, and should work after the applicable grant. Inspect payloads and replay masking separately; retain sanitized Network logs and re-scan the same URL.",
};

const refusal: WebmasterRemediation = {
  owner: "Developer + CMP/tag-manager owner",
  steps: [
    "Filter the cited post-refusal endpoint in DevTools Network and inspect its Initiator stack. Locate its tag, timer, retry, queued callback or storage writer. Use the retained confirmation-relative timing to separate a new request chain from one already in flight; cookie presence alone does not prove active use.",
    "In the Reject handler, persist denied optional categories and apply them to each consent-dependent loader and collection call before queued work can run. Cancel pending optional timers/retries and use the vendor's documented disable/consent mechanism for an already-loaded SDK. Guard SPA navigation and later callbacks against reinitializing it.",
    "Stop the cited optional writes at their source. If cleanup is appropriate, remove only the identified optional cookie name/domain/path or web-storage origin/type/key; do not clear essential cookies or the saved refusal. Review browser and corresponding server-side collection settings, validate in staging, publish the approved changes and clear caches.",
  ],
  verification: "In a fresh session confirm Reject, record confirmation separately from the click, then inspect new request chains and writes for the full configured observation target listed here, not just an early-stop sample. If that target is unavailable, cover at least the measured window in Appendix A and later callbacks. Reload and navigate without submitting forms. The saved refusal must remain in force without newly initiated consent-dependent collection. Compare with a separate confirmed Accept session and retain sanitized results.",
};

const device: WebmasterRemediation = {
  owner: "Developer; privacy owner confirms purpose",
  steps: [
    "Search loaded sources for the listed API names (for example toDataURL, getImageData or startRendering) and set a breakpoint at the actual call site. Reload and inspect the call stack to identify the responsible first-party function or SDK. Do not disable browser APIs globally: graphics and audio can have legitimate uses.",
    "Trace the returned values through the calling code and Network payloads using synthetic test data. Check whether results are combined into an identifier, stored or transmitted; API access alone is not proof of fingerprinting. If a minified third-party bundle cannot be traced, obtain the vendor's purpose/configuration documentation before deciding on a change.",
    "Remove unnecessary collection in the initiating component, or disable the vendor feature. Where the verified purpose requires consent, gate the call and subsequent storage/transmission on the relevant category, including delayed callbacks. Preserve legitimate graphics/audio functions and document the purpose. Validate in staging, publish the approved change and clear caches.",
  ],
  verification: "Repeat the call-stack and Network inspection before a choice, after Reject and after the relevant Accept choice. Confirm the unnecessary call or data flow has stopped, or document the verified legitimate use. Test affected graphics/audio features and re-scan. An unresolved purpose remains a review item, not a confirmed fingerprinting defect.",
};

const conflict: WebmasterRemediation = {
  owner: "Developer + privacy/content owner",
  steps: [
    "Open the cited policy URL and locate the quoted claim. Reproduce the linked runtime behavior on the scanned page in the same choice state; use Network Initiator to identify its controlling integration. Keep the claim and runtime evidence paired rather than treating every vendor request as the same conflict.",
    "Agree the intended behavior with the privacy owner. If collection should wait for consent, correct the initiating tag/loader and queued callbacks using the tracking instructions. If the verified practice or policy description is wrong, correct that specific practice or passage after approval; do not merely weaken a consent promise to make a failing implementation appear consistent.",
    "Publish the approved configuration and policy together, update the policy date/version as appropriate, and clear relevant caches. Keep the prior version and a rollback path; ensure the notice still describes actual purposes, recipients and choices.",
  ],
  verification: "Re-open the published claim without signing in and repeat the cited runtime scenario in fresh sessions. Compare the same endpoint, choice state and policy passage. The documented commitment and observed behavior must agree; retain the revised URL, exact passage and sanitized request evidence, then re-scan.",
};

const rights: WebmasterRemediation = {
  owner: "Privacy/content owner approves wording; webmaster publishes",
  steps: [
    "Open each inspected policy document listed with this finding and locate its consumer-rights section. Confirm the exact missing right against the retained clause assessment. Ask the privacy owner to determine applicability and exceptions; a disclosure finding does not prove requests would be refused.",
    "For each confirmed applicable omission, add plain-language wording explaining that right and how to exercise it. For non-discrimination, explain that exercising privacy rights will not result in prohibited discriminatory treatment; have the privacy owner approve any applicable exception or incentive wording. Do not publish an unreviewed blanket promise or a fictional contact channel.",
    "Publish the approved text as readable HTML under a clear rights heading, with a real request/contact route where required. Keep the policy linked from the scanned page, update its version/date, and clear caches. Check the deployed contact destination with the owner; do not send real personal data or submit a request merely to test discovery.",
  ],
  verification: "Open the revised policy from the scanned page in a fresh signed-out session. Confirm the specific missing right is now stated in its rights context, and that links resolve to the approved route. Retain the exact passage and URL, obtain privacy-owner sign-off, then re-scan. Legal applicability and fulfillment effectiveness remain separate checks.",
};

const privacyNotice: WebmasterRemediation = {
  owner: "Privacy/content owner + webmaster",
  steps: [
    "Check the scanned page's footer and collection forms for the intended privacy-policy link. Inspect the link href and HTTP response, including redirects, access restrictions and stale routes. If a policy already exists, repair its link or public access rather than creating a competing notice.",
    "If no governing notice exists, have the privacy owner prepare accurate controller/contact, data/purpose, legal-basis where applicable, recipient, retention, rights and transfer disclosures based on actual processing. Use a working contact channel; do not invent facts from the scan.",
    "Publish readable public HTML at a stable URL; add descriptive anchor links in footer and relevant collection surfaces before submission. Remove login/bot/interstitial barriers that prevent intended public access, publish the updated template and clear caches.",
  ],
  verification: "From the exact scanned page, open the policy link in a fresh signed-out browser and confirm the intended document returns successfully and is readable before any collection/form submission. Check mobile layout and keyboard access, record the final URL and re-scan.",
};

const plans: Record<string, WebmasterRemediation> = {
  "post-refusal-review": {
    owner: "Developer + privacy owner",
    steps: [
      "Locate each retained post-refusal request in DevTools Network and trace its Initiator to the responsible tag/SDK. Compare the confirmed refusal time with new request starts; keep in-flight traffic separate.",
      "Inspect the actual request fields, consent declarations, identifier transmission and cookie/storage writes using synthetic test data. Confirm the stated measurement/performance purpose and its approved implementation with the privacy owner; do not assume every post-refusal request is optional tracking or that a storage-denied declaration proves compliance.",
      "If the verified behavior contradicts the approved choice or purpose, change the originating tag/SDK configuration and guard later callbacks; stop any confirmed unwanted collection at its source. Otherwise document the verified measurement behavior and remaining limits without inventing a defect or changing working essential functionality.",
    ],
    verification: "Repeat the same confirmed-refusal visit in a fresh session and compare the exact endpoint, request fields, consent declarations and storage activity over a matched window. Retain sanitized evidence and privacy-owner approval. Unverified purpose, identifiers or action registration remain an open investigation, not a completed repair.",
  },
  "initial-tracking": tracking, preconsent_tracking: tracking,
  pre_consent_third_party_tracking: tracking, pre_consent_cookies_storage: tracking,
  session_replay_fingerprinting_review: tracking, session_replay_observed: tracking,
  social_media_embed_pre_consent: tracking, embedded_content_pre_consent: tracking, third_party_iframe_pre_consent: tracking,
  refusal, post_refusal_non_essential_activity: refusal, post_reject_click_tracking: refusal, post_reject_tracking_reduction: refusal,
  "device-identification": device, device_identification_fingerprinting_signal_observed: device,
  policy_behavior_conflict: conflict, california_rights_disclosure_not_observed: rights,
  "privacy-notice": privacyNotice, privacy_notice_availability: privacyNotice,
  semantic_labeling_accessibility_issue: {
    owner: "Frontend developer + accessibility reviewer",
    steps: [
      "Locate the retained selectors in their source components and apply only the corrections for the reported rule IDs; do not add unrelated ARIA or change tab order merely to silence an audit.",
      "For label failures, associate a persistent visible label with the input's unique id using label/for or a wrapping label. For button-name failures, supply accurate visible action text or an appropriate aria-label for an icon-only button; preserve native semantics and the actual handler.",
      "Update the shared component/CMS template, check repeated instances and dynamic states, then publish and clear caches. Verify the computed name in the browser accessibility tree rather than assuming an attribute alone fixed the issue.",
    ], verification: "Rerun each reported rule on its retained selectors, test label-to-input focus and keyboard button activation in staging, and check screen-reader names/states. Retain automated and manual results; do not submit real personal data or trigger a live transaction.",
  },
  text_alternative_accessibility_issue: {
    owner: "Frontend developer + content/accessibility owner",
    steps: accessibilityCorrectionGuidance("image-alt")!.steps,
    verification: accessibilityRemediationVerification("image-alt"),
  },
  site_integrity_hidden_outbound_links: { owner: "Developer + content owner", steps: SITE_INTEGRITY_REMEDIATION.steps, verification: SITE_INTEGRITY_REMEDIATION.reTest },
};

export function webmasterRemediation(id: string): WebmasterRemediation | null {
  return plans[id] ?? null;
}

export function webmasterRemediationText(plan: WebmasterRemediation) {
  return [...plan.steps, `Re-test: ${plan.verification}`].join("\n\n");
}
