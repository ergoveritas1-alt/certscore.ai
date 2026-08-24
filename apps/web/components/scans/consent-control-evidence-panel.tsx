import { consentControlAssessmentSchema } from "@certscore/contracts";
import React from "react";

type ControlState = "observed" | "not_observed" | "unknown";

function stateLabel(state: ControlState) {
  if (state === "observed") return "Observed";
  if (state === "not_observed") return "Not observed";
  return "Unknown / review";
}

function statePresentation(state: ControlState) {
  if (state === "observed") {
    return {
      cardClass: "border-emerald-200 bg-emerald-50/70",
      iconClass: "bg-emerald-600 text-white ring-emerald-200",
      icon: "✓",
      valueClass: "text-emerald-950"
    };
  }
  if (state === "not_observed") {
    return {
      cardClass: "border-amber-200 bg-amber-50/70",
      iconClass: "bg-white text-amber-700 ring-amber-200",
      icon: "–",
      valueClass: "text-amber-950"
    };
  }
  return {
    cardClass: "border-slate-200 bg-slate-50/80",
    iconClass: "bg-white text-slate-600 ring-slate-200",
    icon: "?",
    valueClass: "text-slate-950"
  };
}

export function ConsentControlEvidencePanel({ assessment: candidate }: { assessment: unknown }) {
  const parsed = consentControlAssessmentSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const assessment = parsed.data;
  const necessaryOnlyEvidence = assessment.evidence.some((evidence) =>
    evidence.intent === "reject" && (
      evidence.classifier?.reasonCodes.includes("save_preferences_with_all_optional_defaults_off") ||
      evidence.classifier?.reasonCodes.includes("save_preferences_with_necessary_selection_observed")
    )
  );
  const inventoryComplete = assessment.assessmentStatus === "complete" && assessment.coverage.status === "complete";
  const controls = [
    ["Accept", assessment.controls.accept],
    ["Reject / necessary only", assessment.controls.reject],
    ["Options", assessment.controls.options]
  ] as const;

  return (
    <section className="overflow-hidden rounded-[1.55rem] border border-slate-200/80 bg-white/92 shadow-[0_16px_44px_-26px_rgba(15,23,42,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50/50 p-5">
        <div>
          <p className="text-base font-semibold tracking-tight text-slate-950">Consent controls observations</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Canonical first-layer availability assessment from the retained pre-interaction evidence packet.
          </p>
        </div>
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${inventoryComplete ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700"}`}>
          <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${inventoryComplete ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"}`}>
            {inventoryComplete ? "✓" : "!"}
          </span>
          {inventoryComplete ? "First-layer inventory complete" : "Limited first-layer evidence"}
        </div>
      </div>
      <div className="p-5">
        <p className="text-xs leading-5 text-slate-500">
          {inventoryComplete
            ? "Complete means Accept, Reject / necessary-only, and Options were each assessed. It does not mean those controls were present."
            : "One or more first-layer control types could not be assessed from the retained evidence."}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {controls.map(([label, control]) => {
            const presentation = statePresentation(control.state);
            return (
              <div key={label} className={`relative overflow-hidden rounded-[1.2rem] border px-4 py-4 ${presentation.cardClass}`}>
                <span className="absolute inset-x-0 top-0 h-1 bg-current opacity-20" />
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-semibold ring-4 ${presentation.iconClass}`}>
                    {presentation.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</p>
                    <p className={`mt-1 text-base font-semibold ${presentation.valueClass}`}>{stateLabel(control.state)}</p>
                    {control.firstObservedAtMs !== null ? (
                      <p className="mt-1 text-xs text-slate-500">First observed at {(control.firstObservedAtMs / 1_000).toFixed(1)}s</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {necessaryOnlyEvidence ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900">
            The retained default-state evidence shows that saving the displayed selection leaves optional purposes off, so this is projected as a necessary-only rejection path.
          </p>
        ) : null}
        {assessment.limitations.length > 0 ? (
          <div className="mt-4 space-y-1 text-xs leading-5 text-slate-500">
            {assessment.limitations.slice(0, 3).map((limitation) => (
              <p key={limitation.code}>Limitation: {limitation.detail ?? limitation.code.replaceAll("_", " ")}</p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
