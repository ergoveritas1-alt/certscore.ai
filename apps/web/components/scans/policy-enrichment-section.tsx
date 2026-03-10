import { CollapsibleSectionCard } from "./collapsible-section-card";
import { InfoTip } from "./info-tip";

function getField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return null;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "[]";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "Not observed";
  }

  return String(value);
}

function formatConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Not observed";
  }

  return `${Math.round(value * 100)}%`;
}

export function PolicyEnrichmentSection(input: {
  enrichments: Array<Record<string, unknown>>;
  reviewQueue: Array<Record<string, unknown>>;
}) {
  const visibleEnrichments = input.enrichments.filter((enrichment) => {
    const pageUrl = getField(enrichment, "pageUrl", "page_url");
    const summary = getField(enrichment, "policySummaryShort", "policy_summary_short");
    const mentions = getField(enrichment, "policyMentions", "policy_mentions");

    return Boolean(pageUrl || summary || (Array.isArray(mentions) && mentions.length > 0));
  });

  if (visibleEnrichments.length === 0) {
    return (
      <CollapsibleSectionCard
        title={
          <span className="flex items-center gap-1.5">
            <span>Policy enrichment</span>
            <InfoTip text="Structured extraction derived from detected legal pages. It stores normalized outputs and short evidence snippets, not raw policy bodies." />
          </span>
        }
        contentClassName="text-sm text-slate-600"
      >
          No structured policy-enrichment record is available for this scan yet.
      </CollapsibleSectionCard>
    );
  }

  const latestReviewByEnrichmentId = new Map(
    input.reviewQueue.map((row) => [String(row.policyEnrichmentId ?? row.policy_enrichment_id ?? ""), row])
  );

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>Policy enrichment</span>
          <InfoTip text="Structured extraction derived from detected legal pages. It stores normalized outputs and short evidence snippets, not raw policy bodies." />
        </span>
      }
      contentClassName="space-y-4"
    >
        <p className="max-w-3xl text-sm text-slate-600">
          Structured policy extraction is derived from detected legal pages using deterministic rules first and model-assisted
          extraction only when needed. Raw policy bodies are not stored.
        </p>
        <div className="space-y-4">
          {visibleEnrichments.map((enrichment, index) => {
            const enrichmentId = String(enrichment.id ?? "");
            const review = latestReviewByEnrichmentId.get(enrichmentId) ?? null;
            const enrichmentKey =
              enrichmentId ||
              [
                String(enrichment.pageType ?? enrichment.page_type ?? "unknown"),
                String(enrichment.pageUrl ?? enrichment.page_url ?? "unknown"),
                String(enrichment.normalizedPolicyHash ?? enrichment.normalized_policy_hash ?? "nohash"),
                String(index)
              ].join(":");

            return (
              <details key={enrichmentKey} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4" open>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900">{formatValue(getField(enrichment, "pageUrl", "page_url"))}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Semantic confidence {formatConfidence(getField(enrichment, "policySemanticConfidence", "policy_semantic_confidence"))} · DSAR{" "}
                      {formatValue(getField(enrichment, "policyDsarMechanism", "policy_dsar_mechanism"))} · Do not sell{" "}
                      {formatValue(getField(enrichment, "policyDoNotSell", "policy_do_not_sell"))}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    ambiguity {formatValue(getField(enrichment, "policyAmbiguityScore", "policy_ambiguity_score"))}
                  </span>
                </summary>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3 text-sm text-slate-600">
                    <p>{formatValue(getField(enrichment, "policySummaryShort", "policy_summary_short"))}</p>
                    <p>Data categories: {formatValue(getField(enrichment, "policyDataCategories", "policy_data_categories"))}</p>
                    <p>Children reference: {formatValue(getField(enrichment, "policyChildrenReference", "policy_children_reference"))}</p>
                    <p>
                      Transfer mechanisms:{" "}
                      {formatValue(
                        ((getField(enrichment, "policyTransferMechanisms", "policy_transfer_mechanisms") as Array<Record<string, unknown>> | null) ?? []).map(
                          (item) => item.mechanism
                        )
                      )}
                    </p>
                    <p>Actionable flags: {formatValue(getField(enrichment, "policyActionableFlags", "policy_actionable_flags"))}</p>
                  </div>
                  <div className="space-y-3 text-sm text-slate-600">
                    <p>
                      Policy mentions:{" "}
                      {formatValue(
                        ((getField(enrichment, "policyMentions", "policy_mentions") as Array<Record<string, unknown>> | null) ?? []).map(
                          (item) => item.topic
                        )
                      )}
                    </p>
                    <p>
                      Retention periods:{" "}
                      {formatValue(
                        ((getField(enrichment, "policyRetentionPeriods", "policy_retention_periods") as Array<Record<string, unknown>> | null) ?? []).map(
                          (item) => item.periodText
                        )
                      )}
                    </p>
                    <p>Model: {formatValue(getField(enrichment, "policyAiModel", "policy_ai_model"))}</p>
                    <p>Prompt version: {formatValue(getField(enrichment, "policyAiPromptVersion", "policy_ai_prompt_version"))}</p>
                    <p>
                      Review queue:{" "}
                      {review
                        ? `${formatValue(review.reviewStatus ?? review.review_status)} · ${formatValue(review.reason)}`
                        : "No review item queued"}
                    </p>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
    </CollapsibleSectionCard>
  );
}
