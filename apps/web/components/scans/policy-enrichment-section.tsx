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

function formatPageType(value: unknown) {
  const raw = formatValue(value);
  if (raw === "Not observed") {
    return raw;
  }

  return raw
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTopicList(value: unknown, field: "topic" | "mechanism" | "periodText") {
  const items = (value as Array<Record<string, unknown>> | null) ?? [];
  const picked = items
    .map((item) => item[field])
    .filter((item): item is string => typeof item === "string" && item.length > 0);

  return formatValue(picked);
}

function compactSummary(value: unknown, maxLength = 180) {
  const text = formatValue(value);
  if (text === "Not observed" || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function renderInlineFact(label: string, value: unknown) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="text-sm text-slate-800">{formatValue(value)}</p>
    </div>
  );
}

function renderPolicyRecord(
  enrichment: Record<string, unknown>,
  review: Record<string, unknown> | null,
  enrichmentKey: string,
) {
  const pageUrl = formatValue(getField(enrichment, "pageUrl", "page_url"));
  const pageType = formatPageType(getField(enrichment, "pageType", "page_type"));
  const confidence = formatConfidence(getField(enrichment, "policySemanticConfidence", "policy_semantic_confidence"));
  const summary = compactSummary(getField(enrichment, "policySummaryShort", "policy_summary_short"));
  const reviewState = review
    ? `${formatValue(review.reviewStatus ?? review.review_status)}${review.reason ? ` · ${formatValue(review.reason)}` : ""}`
    : "No review item queued";
  const model = formatValue(getField(enrichment, "policyAiModel", "policy_ai_model"));
  const promptVersion = formatValue(getField(enrichment, "policyAiPromptVersion", "policy_ai_prompt_version"));

  return (
    <details key={enrichmentKey} className="rounded-xl border border-slate-200 bg-white px-3 py-3" open>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-950">{pageType}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-700">
              confidence {confidence}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-700">
              <span>Clarity risk {formatValue(getField(enrichment, "policyAmbiguityScore", "policy_ambiguity_score"))}</span>
              <InfoTip
                align="start"
                text="Higher clarity-risk values mean the policy language appears more vague, non-specific, or harder to interpret cleanly. Lower values indicate clearer and more direct disclosure language."
              />
            </span>
            {review ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-800">
                review queued
              </span>
            ) : null}
          </div>
          <p className="break-all text-sm text-slate-600">{pageUrl}</p>
          <p className="text-sm text-slate-700">{summary}</p>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
        <div className="grid gap-3 md:grid-cols-2">
          {renderInlineFact("DSAR", getField(enrichment, "policyDsarMechanism", "policy_dsar_mechanism"))}
          {renderInlineFact("Rights signals", getField(enrichment, "policyRightsSignals", "policy_rights_signals"))}
          {renderInlineFact("Do not sell", getField(enrichment, "policyDoNotSell", "policy_do_not_sell"))}
          {renderInlineFact("Privacy contact", getField(enrichment, "privacyContactChannelType", "privacy_contact_channel_type"))}
          {renderInlineFact("Data categories", getField(enrichment, "policyDataCategories", "policy_data_categories"))}
          {renderInlineFact("Transfer mechanisms", formatTopicList(getField(enrichment, "policyTransferMechanisms", "policy_transfer_mechanisms"), "mechanism"))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {renderInlineFact("Arbitration", getField(enrichment, "policyArbitrationPresent", "policy_arbitration_present"))}
          {renderInlineFact("Notice contact", getField(enrichment, "policyNoticeContactPresent", "policy_notice_contact_present"))}
          {renderInlineFact("Actionable flags", getField(enrichment, "policyActionableFlags", "policy_actionable_flags"))}
          {renderInlineFact("Policy mentions", formatTopicList(getField(enrichment, "policyMentions", "policy_mentions"), "topic"))}
          {renderInlineFact("Retention periods", compactSummary(formatTopicList(getField(enrichment, "policyRetentionPeriods", "policy_retention_periods"), "periodText"), 120))}
          {renderInlineFact("Review queue", reviewState)}
        </div>

        {(model !== "Not observed" || promptVersion !== "Not observed") ? (
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            {model !== "Not observed" ? <span>Model: {model}</span> : null}
            {promptVersion !== "Not observed" ? <span>Prompt: {promptVersion}</span> : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function PolicyEnrichmentSection(input: {
  enrichments: Array<Record<string, unknown>>;
  reviewQueue: Array<Record<string, unknown>>;
  embedded?: boolean;
  pageTypes?: string[];
  title?: string;
}) {
  const allowedPageTypes = input.pageTypes?.length
    ? new Set(input.pageTypes)
    : null;
  const visibleEnrichments = input.enrichments.filter((enrichment) => {
    const pageType = getField(enrichment, "pageType", "page_type");
    if (allowedPageTypes && (typeof pageType !== "string" || !allowedPageTypes.has(pageType))) {
      return false;
    }

    const pageUrl = getField(enrichment, "pageUrl", "page_url");
    const summary = getField(enrichment, "policySummaryShort", "policy_summary_short");
    const mentions = getField(enrichment, "policyMentions", "policy_mentions");

    return Boolean(pageUrl || summary || (Array.isArray(mentions) && mentions.length > 0));
  });

  const sectionTitle = input.title ?? (input.embedded ? "Policy document analysis" : "Policy enrichment");

  if (visibleEnrichments.length === 0) {
    if (input.embedded) {
      return (
        <CollapsibleSectionCard
          title={
            <span className="flex items-center gap-1.5">
              <span>{sectionTitle}</span>
              <InfoTip text="Structured extraction derived from detected legal pages. It stores normalized outputs and short evidence snippets, not raw policy bodies." />
            </span>
          }
          defaultOpen
          contentClassName="space-y-4"
        >
          <p className="text-sm text-slate-600">No structured policy-enrichment record is available for this scan yet.</p>
        </CollapsibleSectionCard>
      );
    }

    return (
      <CollapsibleSectionCard
        title={
          <span className="flex items-center gap-1.5">
            <span>{sectionTitle}</span>
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

  if (input.embedded) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-slate-900">{sectionTitle}</p>
            <InfoTip text="Structured extraction derived from detected legal pages. It stores normalized outputs and short evidence snippets, not raw policy bodies." />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Analyzed policy pages</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{visibleEnrichments.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Review items</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{input.reviewQueue.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Model-backed rows</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {visibleEnrichments.filter((enrichment) => Boolean(getField(enrichment, "policyAiModel", "policy_ai_model"))).length}
            </p>
          </div>
        </div>
        <CollapsibleSectionCard title="Policy page records" defaultOpen={false} contentClassName="space-y-4">
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

              return renderPolicyRecord(enrichment, review, enrichmentKey);
            })}
          </div>
        </CollapsibleSectionCard>
      </div>
    );
  }

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>{sectionTitle}</span>
          <InfoTip text="Structured extraction derived from detected legal pages. It stores normalized outputs and short evidence snippets, not raw policy bodies." />
        </span>
      }
      contentClassName="space-y-4"
    >
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

            return renderPolicyRecord(enrichment, review, enrichmentKey);
          })}
        </div>
    </CollapsibleSectionCard>
  );
}
