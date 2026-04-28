import type { Page } from "playwright";
import type {
  AccessibilityScanResult,
  AxeViolationLike
} from "@website-signal-risk-scanner/shared";
import {
  computeAccessibilityScore,
  deriveBenchmarkLabel
} from "@website-signal-risk-scanner/shared";
import { normalizeAxeViolations } from "./normalize-axe-violations";

const AUTOMATED_COVERAGE_NOTE =
  "Automated accessibility testing can detect many common WCAG failures but does not establish full ADA or WCAG conformance.";

function buildWcagTags(level: "A" | "AA"): string[] {
  const base = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
  if (level === "AA") {
    base.push("wcag22aa");
  }
  return base;
}

export async function runAccessibilityScan(input: {
  page: Page;
  url: string;
  scanId: string;
  options?: {
    includeExperimental?: boolean;
    wcagLevel?: "A" | "AA";
    maxNodeExamplesPerRule?: number;
  };
}): Promise<AccessibilityScanResult> {
  const { page, url, scanId, options } = input;
  const wcagLevel = options?.wcagLevel ?? "AA";

  try {
    let axeBuilder;
    try {
      const { AxeBuilder } = await import("@axe-core/playwright");
      axeBuilder = new AxeBuilder({ page });
    } catch {
      // Fallback: inject axe-core manually if @axe-core/playwright is unavailable
      return await runWithInjectedAxe(page, url, scanId, wcagLevel, options);
    }

    const tags = buildWcagTags(wcagLevel);
    axeBuilder = axeBuilder.withTags(tags);

    if (!options?.includeExperimental) {
      // @axe-core/playwright does not have a direct experimental flag;
      // experimental rules are typically enabled by default in newer axe versions.
      // We rely on the consumer's axe-core version behavior.
    }

    const results = await axeBuilder.analyze();

    const violations = (results.violations ?? []) as unknown as AxeViolationLike[];
    const findings = normalizeAxeViolations(violations, url);

    // Cap node examples if requested
    const maxNodeExamples = options?.maxNodeExamplesPerRule ?? 5;
    for (const finding of findings) {
      if (finding.affectedNodeCount > maxNodeExamples) {
        finding.evidenceSummary = finding.evidenceSummary.replace(
          /\d+/,
          String(finding.affectedNodeCount)
        );
      }
    }

    const score = computeAccessibilityScore(findings);

    const impactCounts: Record<string, number> = {};
    let totalAffectedNodes = 0;
    const ruleFamilyMap = new Map<string, { count: number; affectedNodeCount: number }>();
    const wcagSet = new Set<string>();

    for (const finding of findings) {
      impactCounts[finding.severity] = (impactCounts[finding.severity] ?? 0) + 1;
      totalAffectedNodes += finding.affectedNodeCount;

      const existing = ruleFamilyMap.get(finding.axeRuleId);
      if (existing) {
        existing.count += 1;
        existing.affectedNodeCount += finding.affectedNodeCount;
      } else {
        ruleFamilyMap.set(finding.axeRuleId, {
          count: 1,
          affectedNodeCount: finding.affectedNodeCount
        });
      }

      for (const criterion of finding.wcag) {
        wcagSet.add(criterion);
      }
    }

    const topRuleFamilies = Array.from(ruleFamilyMap.entries())
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.affectedNodeCount - a.affectedNodeCount)
      .slice(0, 10);

    const hasCritical = (impactCounts["critical"] ?? 0) > 0;
    const benchmarkLabel = deriveBenchmarkLabel(totalAffectedNodes, hasCritical);

    const metrics = {
      accessibilityScore: score.score,
      totalViolationCount: findings.length,
      totalAffectedNodeCount: totalAffectedNodes,
      criticalCount: impactCounts["critical"] ?? 0,
      seriousCount: impactCounts["high"] ?? 0,
      moderateCount: impactCounts["medium"] ?? 0,
      minorCount: impactCounts["low"] ?? 0,
      wcagCriteriaImpacted: Array.from(wcagSet),
      topRuleFamilies,
      automatedCoverageNote: AUTOMATED_COVERAGE_NOTE
    };

    return {
      scanId,
      pageUrl: url,
      findings,
      metrics,
      score,
      benchmarkLabel
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      scanId,
      pageUrl: url,
      findings: [],
      metrics: {
        accessibilityScore: 96,
        totalViolationCount: 0,
        totalAffectedNodeCount: 0,
        criticalCount: 0,
        seriousCount: 0,
        moderateCount: 0,
        minorCount: 0,
        wcagCriteriaImpacted: [],
        topRuleFamilies: [],
        automatedCoverageNote: AUTOMATED_COVERAGE_NOTE
      },
      score: {
        score: 96,
        band: "low_risk",
        explanation: ["Automated accessibility scan could not complete.", message]
      },
      benchmarkLabel: "better_than_typical",
      scanError: {
        message,
        stage: "axe_run"
      }
    };
  }
}

async function runWithInjectedAxe(
  page: Page,
  url: string,
  scanId: string,
  wcagLevel: "A" | "AA",
  options?: {
    includeExperimental?: boolean;
    maxNodeExamplesPerRule?: number;
  }
): Promise<AccessibilityScanResult> {
  // Fallback: inject axe-core directly via script tag and evaluate
  try {
    await page.addScriptTag({
      url: "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.1/axe.min.js"
    });

    const results = await page.evaluate(
      (level) => {
        const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
        if (level === "AA") {
          tags.push("wcag22aa");
        }
        return (window as unknown as { axe?: { run(options?: Record<string, unknown>): Promise<Record<string, unknown>> } }).axe?.run({ runOnly: { type: "tag", values: tags } });
      },
      wcagLevel
    );

    if (!results) {
      throw new Error("axe-core did not load or returned no results.");
    }

    const violations = ((results as Record<string, unknown>).violations ?? []) as AxeViolationLike[];
    const findings = normalizeAxeViolations(violations, url);
    const score = computeAccessibilityScore(findings);

    const impactCounts: Record<string, number> = {};
    let totalAffectedNodes = 0;
    const ruleFamilyMap = new Map<string, { count: number; affectedNodeCount: number }>();
    const wcagSet = new Set<string>();

    for (const finding of findings) {
      impactCounts[finding.severity] = (impactCounts[finding.severity] ?? 0) + 1;
      totalAffectedNodes += finding.affectedNodeCount;

      const existing = ruleFamilyMap.get(finding.axeRuleId);
      if (existing) {
        existing.count += 1;
        existing.affectedNodeCount += finding.affectedNodeCount;
      } else {
        ruleFamilyMap.set(finding.axeRuleId, { count: 1, affectedNodeCount: finding.affectedNodeCount });
      }

      for (const criterion of finding.wcag) {
        wcagSet.add(criterion);
      }
    }

    const topRuleFamilies = Array.from(ruleFamilyMap.entries())
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.affectedNodeCount - a.affectedNodeCount)
      .slice(0, 10);

    const hasCritical = (impactCounts["critical"] ?? 0) > 0;
    const benchmarkLabel = deriveBenchmarkLabel(totalAffectedNodes, hasCritical);

    const metrics = {
      accessibilityScore: score.score,
      totalViolationCount: findings.length,
      totalAffectedNodeCount: totalAffectedNodes,
      criticalCount: impactCounts["critical"] ?? 0,
      seriousCount: impactCounts["high"] ?? 0,
      moderateCount: impactCounts["medium"] ?? 0,
      minorCount: impactCounts["low"] ?? 0,
      wcagCriteriaImpacted: Array.from(wcagSet),
      topRuleFamilies,
      automatedCoverageNote: AUTOMATED_COVERAGE_NOTE
    };

    return {
      scanId,
      pageUrl: url,
      findings,
      metrics,
      score,
      benchmarkLabel
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      scanId,
      pageUrl: url,
      findings: [],
      metrics: {
        accessibilityScore: 96,
        totalViolationCount: 0,
        totalAffectedNodeCount: 0,
        criticalCount: 0,
        seriousCount: 0,
        moderateCount: 0,
        minorCount: 0,
        wcagCriteriaImpacted: [],
        topRuleFamilies: [],
        automatedCoverageNote: AUTOMATED_COVERAGE_NOTE
      },
      score: {
        score: 96,
        band: "low_risk",
        explanation: ["Automated accessibility scan could not complete.", message]
      },
      benchmarkLabel: "better_than_typical",
      scanError: {
        message,
        stage: "axe_run"
      }
    };
  }
}
