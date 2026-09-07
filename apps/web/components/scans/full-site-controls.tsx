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
    "Between page starts",
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
    concurrency: "4",
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
      onChange?.({ fullSite: true, crawlOptions: options });
      setErrors({
        [(error as { field?: string }).field ?? "fullSite"]: (error as Error)
          .message,
      });
    }
  }
  if (!policy) return null;
  return (
    <fieldset className="border-b border-slate-100 bg-white px-3 py-2 text-left text-slate-900">
      <label
        className="flex cursor-pointer items-center justify-between gap-3 font-semibold"
        htmlFor={`${id}-enabled`}
      >
        Full site
        <span className="relative inline-flex">
          <input
            id={`${id}-enabled`}
            className="peer sr-only"
            type="checkbox"
            role="switch"
            value="true"
            checked={selected}
            onChange={(event) => update(event.target.checked)}
          />
          <span aria-hidden="true" className={`h-5 w-9 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500 peer-focus-visible:ring-offset-2 ${selected ? "bg-sky-500" : "bg-slate-200"}`} />
          <span aria-hidden="true" className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${selected ? "translate-x-4" : "translate-x-0"}`} />
        </span>
      </label>
      {selected ? (
        <div className="mt-3 grid gap-2">
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                id={`${id}-${key}`}

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
