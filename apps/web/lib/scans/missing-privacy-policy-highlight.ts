/** Select an already-projected absence finding; never infer absence from capture or retrieval status. */
export function findMissingPrivacyPolicyHighlight<T extends { id?: string; title: string }>(findings: ReadonlyArray<T>) {
  return findings.find(finding => finding.id === "regulatory_gap__gdpr_eprivacy__privacy_notice_availability");
}
