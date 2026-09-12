/** Shared guidance for canonical checklist results; never infers findings from raw evidence. */
export type ChecklistRemediation = { kind: "none" | "steps"; message?: string; steps: string[] };
export function readChecklistRemediation(value: unknown): ChecklistRemediation | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if ((row.kind !== "none" && row.kind !== "steps") || !Array.isArray(row.steps) || !row.steps.every(step => typeof step === "string")) return null;
  return { kind: row.kind, steps: row.steps as string[], ...(typeof row.message === "string" ? { message: row.message } : {}) };
}
const consentChecks: Record<string, string> = {
  consent_surface_observed: "the first-layer consent mechanism",
  accept_consent_control: "the Accept control",
  reject_all_path_availability: "the Reject or necessary-only control",
  options_settings_preferences_control: "the Options or preferences control",
  consent_choice_quality: "the clarity, default selections, and prominence of consent choices",
  preference_withdrawal: "the ability to reopen preferences and withdraw consent",
};
const policyChecks: Record<string, string> = {
  privacy_notice_availability: "the governing privacy notice and its accessibility from the scanned page",
  controller_contact_disclosure: "the controller identity and contact details",
  processing_purposes_disclosure: "the purposes for each described processing activity",
  legal_basis_disclosure_observed: "the legal basis stated for each processing purpose",
  retention_disclosure_observed: "the retention period or substantive criteria for each relevant data category",
  recipients_vendor_categories_disclosure: "the recipients or recipient categories that receive personal data",
  data_subject_rights_disclosure: "the applicable rights and how to exercise them",
  international_transfers_disclosure: "the intended international transfers and applicable safeguard information",
  dpo_contact_point_disclosure: "an expressly designated Data Protection Officer and contact route, where applicable",
  supervisory_authority_complaint_disclosure: "the right to complain to a supervisory authority",
  automated_decision_making_profiling_disclosure: "the applicable automated decision-making or profiling disclosures",
};
const runtimeChecks: Record<string, string[]> = {
  pre_consent_cookies_storage: [
    "Inspect the listed cookie and storage identities, their purposes, and the retained timing evidence. Distinguish a directly observed write from snapshot presence.",
    "For items confirmed to require consent, gate their creation and use on the relevant affirmative choice; check the responsible tag or integration.",
    "Retest the same page and location in a fresh session. Verify those items are absent before consent and after Reject, and appear only after the applicable Accept choice.",
  ],
  session_replay_fingerprinting_review: [
    "Inspect the retained vendor, script, and collection-request evidence to establish which replay or fingerprinting features are active.",
    "Review collection settings, field masking, purpose, and consent requirements. Disable unnecessary capture and gate consent-dependent collection at its source.",
    "Retest a fresh session before consent, after Reject, and after Accept; retain the collection-request evidence for each state and verify masking separately.",
  ],
  pre_consent_third_party_tracking: [
    "Review the listed tracking requests, initiating integrations, and purposes against the retained pre-consent timing.",
    "Gate consent-dependent tracking at the tag or integration and verify that essential traffic remains separately classified.",
    "Retest the same page in fresh sessions before consent, after Reject, and after Accept; compare the listed endpoints and retain the results.",
  ],
};
export function checklistRemediation(input: { rowId: string; status: string }): ChecklistRemediation | null {
  const subject = consentChecks[input.rowId] ?? policyChecks[input.rowId];
  if (!subject && !runtimeChecks[input.rowId]) return null;
  if (["Observed", "Not observed", "Not applicable", "Out of scope"].includes(input.status)) {
    return { kind: "none", message: "No remediation is established by this check alone. Retain its evidence and reassess after relevant changes.", steps: [] };
  }
  const confirmedGap = input.status === "Gap observed";
  const runtimeSteps = runtimeChecks[input.rowId];
  if (runtimeSteps) return { kind: "steps", steps: runtimeSteps };
  if (consentChecks[input.rowId]) {
    return { kind: "steps", steps: [
      `Inspect ${subject} in a fresh browser session using the scan's location and page.`,
      confirmedGap ? "Correct the specific control or behavior identified in the retained evidence." : "Resolve the stated evidence limitation before treating an unconfirmed control or behavior as absent or defective.",
      "Record control visibility separately from click completion and confirmed consent registration.",
      "Retest the same scenario; confirm the intended control and behavior are supported by complete, document-bound evidence.",
    ] };
  }
  return { kind: "steps", steps: [
    `Review the governing policy section for ${subject}; retain the exact excerpt and source URL.`,
    ...(input.rowId === "dpo_contact_point_disclosure" ? ["Determine whether DPO designation is required separately. A generic privacy mailbox does not prove a designation."] : []),
    confirmedGap ? "Correct the evidenced disclosure gap and confirm the wording reflects actual processing." : "If relevant wording exists, record it for review and investigate extraction coverage. Unconfirmed evidence alone does not establish a missing disclosure.",
    "Retest the same policy version or record the revised version; verify that the extracted passage supports this specific topic, rather than nearby or unrelated wording.",
  ] };
}
