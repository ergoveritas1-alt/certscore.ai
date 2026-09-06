"use client";
import { useEffect, useId, useState } from "react";
import {
  validateFullSiteRequest,
  type FullSitePolicy,
  type CrawlOptions,
} from "@website-signal-risk-scanner/shared/full-site-crawl";

export type FullSiteFormValue =
  | { fullSite: true; crawlOptions: CrawlOptions }
  | undefined;
const fields = [
  [
    "maxPages",
    "Max pages",
    "Includes the homepage. Additional pages receive resource-inventory-only scans.",
  ],
  [
    "concurrency",
    "Concurrency",
    "Maximum simultaneous page scans, subject to shared site safety limits.",
  ],
  [
    "waitSeconds",
    "Wait",
    "Minimum seconds between starting page scans. Running scans may overlap up to the concurrency limit.",
  ],
] as const;
export function FullSiteControls({
  onChange,
}: {
  onChange?: (value: FullSiteFormValue) => void;
}) {
  const id = useId();
  const [policy, setPolicy] = useState<FullSitePolicy | null>(null);
  const [selected, setSelected] = useState(false);
  const [values, setValues] = useState({
    maxPages: "10",
    concurrency: "1",
    waitSeconds: "5",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/full-scan/options", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.allowed) {
          setPolicy(data.policy);
          setValues(
            Object.fromEntries(
              fields.map(([key]) => [key, String(data.policy[key].default)]),
            ) as typeof values,
          );
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  function update(enabled: boolean, next = values) {
    setSelected(enabled);
    setValues(next);
    if (!enabled || !policy) {
      setErrors({});
      onChange?.(undefined);
      return;
    }
    const options = Object.fromEntries(
      fields.map(([key]) => [key, next[key].trim() ? Number(next[key]) : NaN]),
    ) as CrawlOptions;
    try {
      const valid = validateFullSiteRequest(
        { fullSite: true, crawlOptions: options },
        true,
        policy,
      );
      setErrors({});
      if (valid.fullSite) onChange?.(valid);
    } catch (error) {
      setErrors({
        [(error as { field?: string }).field ?? "fullSite"]: (error as Error)
          .message,
      });
    }
  }
  if (!policy) return null;
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-4 text-left text-slate-900">
      <label
        className="flex items-center gap-2 font-semibold"
        htmlFor={`${id}-enabled`}
      >
        <input
          id={`${id}-enabled`}
          type="checkbox"
          name="fullSite"
          value="true"
          checked={selected}
          onChange={(event) => update(event.target.checked)}
        />{" "}
        Full site
      </label>
      <p className="mt-1 text-sm text-slate-600">
        Run the full homepage audit and collect resource inventories from
        additional public pages.
      </p>
      {selected ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {fields.map(([key, label, helper]) => (
            <div key={key}>
              <label
                className="block text-sm font-medium"
                htmlFor={`${id}-${key}`}
              >
                {label}
                {key === "waitSeconds" ? " (seconds)" : ""}
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id={`${id}-${key}`}
                name={key}
                type="number"
                min={policy[key].min}
                max={policy[key].max}
                step={key === "waitSeconds" ? "any" : 1}
                required
                value={values[key]}
                aria-invalid={!!errors[key]}
                aria-describedby={`${id}-${key}-help`}
                onChange={(event) =>
                  update(true, { ...values, [key]: event.target.value })
                }
                onInvalid={(event) =>
                  setErrors((previous) => ({
                    ...previous,
                    [key]: event.currentTarget.validationMessage,
                  }))
                }
              />
              <p
                id={`${id}-${key}-help`}
                className="mt-1 text-xs text-slate-600"
              >
                {helper} Allowed: {policy[key].min}–{policy[key].max}.
              </p>
              {errors[key] ? (
                <p role="alert" className="text-xs text-red-700">
                  {errors[key]}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}
