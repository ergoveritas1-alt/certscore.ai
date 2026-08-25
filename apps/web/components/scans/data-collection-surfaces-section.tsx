import type { CollectionSurfaceAssessment } from "@certscore/contracts";
import React from "react";
import { CollapsibleSectionCard } from "./collapsible-section-card";

type DataCollectionSurfacesSectionProps = {
  assessment: CollectionSurfaceAssessment | null;
};

type CollectionSurfaceSummary = {
  badgeLabel: string;
  defaultOpen: boolean;
  fieldCount: number;
  formCount: number;
};

const SURFACE_TYPE_LABELS: Record<CollectionSurfaceAssessment["forms"][number]["surfaceType"], string> = {
  account: "Account form",
  checkout: "Checkout form",
  contact: "Contact form",
  generic_form: "Form",
  newsletter: "Newsletter form",
  search: "Search form",
  unknown: "Form",
};

const SEMANTIC_CATEGORY_LABELS: Record<CollectionSurfaceAssessment["forms"][number]["fields"][number]["semanticCategory"], string> = {
  address: "Address",
  bank_account: "Bank account",
  boolean_choice: "Choice",
  date_of_birth: "Date of birth",
  email: "Email",
  file_upload: "File upload",
  free_text: "Free text",
  geolocation: "Location",
  government_id: "Government ID",
  health: "Health",
  name: "Name",
  password: "Password",
  payment_card: "Payment card",
  phone: "Phone",
  search: "Search",
  selection: "Selection",
  social_security_number: "Social security number",
  unknown: "Unclassified",
};

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function relationshipLabel(
  relationship: CollectionSurfaceAssessment["forms"][number]["actionRelationship"]
) {
  switch (relationship) {
    case "same_site":
      return "Same-site action";
    case "third_party":
      return "Third-party action";
    case "self":
      return "Current page action";
    case "none":
      return "No action retained";
    default:
      return "Action unknown";
  }
}

function assessmentNote(assessment: CollectionSurfaceAssessment) {
  switch (assessment.assessmentStatus) {
    case "observed":
      return "Read-only main-document inventory. Field values are never retained.";
    case "not_observed":
      return "The completed main-document inventory retained no forms or input surfaces.";
    case "limited":
      return "The retained inventory is shown below, but collection-surface coverage was limited. Missing forms or fields remain unknown.";
    case "not_testable":
      return "Collection-surface evidence was not testable for this scan. No absence conclusion was created.";
  }
}

export function getCollectionSurfaceSummary(
  assessment: CollectionSurfaceAssessment
): CollectionSurfaceSummary {
  const formCount = assessment.forms.length;
  const fieldCount = assessment.forms.reduce((total, form) => total + form.fields.length, 0);

  return {
    badgeLabel:
      formCount === 0
        ? "No forms found"
        : `${countLabel(formCount, "form", "forms")} · ${countLabel(fieldCount, "field", "fields")}`,
    defaultOpen: formCount > 0,
    fieldCount,
    formCount,
  };
}

export function DataCollectionSurfacesSection({
  assessment,
}: DataCollectionSurfacesSectionProps) {
  if (!assessment) {
    return null;
  }

  const summary = getCollectionSurfaceSummary(assessment);

  return (
    <CollapsibleSectionCard
      className="overflow-hidden rounded-[1.45rem]"
      contentClassName="border-t border-slate-100 pt-5"
      defaultOpen={summary.defaultOpen}
      summaryClassName="items-center"
      title={
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Data collection surfaces
          </span>
          <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
            {summary.badgeLabel}
          </span>
        </div>
      }
    >
      <p className="mb-4 text-sm leading-6 text-slate-600">{assessmentNote(assessment)}</p>

      {summary.formCount === 0 ? null : (
        <div className="space-y-4">
          {assessment.forms.map((form, formIndex) => (
            <article
              className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60"
              key={form.formRef}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">
                    {form.title ?? `${SURFACE_TYPE_LABELS[form.surfaceType]} ${formIndex + 1}`}
                  </h3>
                  <p className="mt-1 break-all text-xs text-slate-500">{form.pageUrl}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 uppercase">
                    {form.method}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    {relationshipLabel(form.actionRelationship)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    {countLabel(form.fields.length, "field", "fields")}
                  </span>
                </div>
              </div>

              {form.fields.length === 0 ? (
                <p className="px-4 py-4 text-sm text-slate-500 sm:px-5">
                  No field details were retained for this form.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 sm:px-5">Field</th>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5">Category</th>
                        <th className="px-4 py-2.5">Required</th>
                        <th className="px-4 py-2.5 sm:pr-5">State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                      {form.fields.map((field) => (
                        <tr key={field.fieldRef}>
                          <td className="max-w-[18rem] px-4 py-3 font-medium text-slate-900 sm:px-5">
                            {field.label ?? SEMANTIC_CATEGORY_LABELS[field.semanticCategory]}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{field.inputType}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {SEMANTIC_CATEGORY_LABELS[field.semanticCategory]}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{field.required ? "Yes" : "No"}</td>
                          <td className="whitespace-nowrap px-4 py-3 sm:pr-5">
                            {field.disabled ? "Disabled" : field.readOnly ? "Read-only" : "Available"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {form.fieldsTruncated ? (
                <p className="border-t border-slate-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 sm:px-5">
                  {countLabel(form.candidateFieldCount - form.retainedFieldCount, "additional field", "additional fields")} omitted by the bounded evidence contract.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </CollapsibleSectionCard>
  );
}
