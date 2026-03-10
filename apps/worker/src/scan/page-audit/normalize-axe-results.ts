import type { AxeResults, Result } from "axe-core";

export type NormalizedAxeViolation = {
  description: string;
  help: string;
  helpUrl: string;
  impact: string | null;
  nodeCount: number;
  representativeSelectors: string[];
  ruleId: string;
};

function getRepresentativeSelectors(violation: Result) {
  return violation.nodes
    .flatMap((node) =>
      node.target.map((selector) => (typeof selector === "string" ? selector : selector.join(" ")))
    )
    .map((selector) => selector.trim())
    .filter((selector) => selector.length > 0)
    .slice(0, 5);
}

export function normalizeAxeResults(results: AxeResults): NormalizedAxeViolation[] {
  return results.violations.map((violation) => ({
    ruleId: violation.id,
    impact: violation.impact ?? null,
    help: violation.help,
    helpUrl: violation.helpUrl,
    description: violation.description,
    nodeCount: violation.nodes.length,
    representativeSelectors: getRepresentativeSelectors(violation)
  }));
}
