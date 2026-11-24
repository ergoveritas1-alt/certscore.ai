import type { CanonicalEvidenceBundle } from "@certscore/contracts";

type DocumentSnapshot = CanonicalEvidenceBundle["domSnapshots"][number];

/** A same-URL identity-less auxiliary read cannot replace the committed document. */
export function consentGateDocument(snapshots: readonly DocumentSnapshot[]): DocumentSnapshot | undefined {
  const latest = snapshots.at(-1);
  if (!latest || latest.artifactId !== "dom_text_pre_consent_recovery" ||
    latest.documentIdentity || latest.consentStateAtTime !== "pre_consent") return latest;
  const committed = snapshots.at(-2);
  return committed?.artifactId === "dom_text_pre_consent" && committed.consentStateAtTime === "pre_consent" &&
    committed.url === latest.url && committed.documentIdentity?.source === "cdp_loader_id" &&
    committed.documentIdentity.token ? committed : latest;
}
