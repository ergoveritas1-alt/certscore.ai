import type { CertScoreFinding, CertScoreFindingSection } from "../../lib/scans/finding-registry";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { FindingCard } from "./finding-card";

export function FindingsSection(input: {
  section: CertScoreFindingSection;
  findings: CertScoreFinding[];
}) {
  if (input.findings.length === 0) {
    return null;
  }

  return (
    <CollapsibleSectionCard
      title={input.section}
      subtitle={`${input.findings.length} surfaced finding${input.findings.length === 1 ? "" : "s"} with direct evidence or strong runtime inference.`}
      contentClassName="space-y-4"
    >
      {input.findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}
    </CollapsibleSectionCard>
  );
}
