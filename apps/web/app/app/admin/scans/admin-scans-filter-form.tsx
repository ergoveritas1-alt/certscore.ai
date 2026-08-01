"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useTransition } from "react";

type AdminScansFilterFormProps = {
  basePath?: string;
  children: ReactNode;
  clearHref?: string;
  hasFilters: boolean;
};

export function AdminScansFilterForm({ basePath = "/app/admin/scans", children, clearHref, hasFilters }: AdminScansFilterFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();

    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string" && value.length > 0) {
        params.set(key, value);
      }
    });

    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${basePath}?${query}` : basePath);
    });
  }

  return (
    <form
      aria-busy={isPending}
      className="flex flex-nowrap gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-2"
      method="get"
      onSubmit={handleSubmit}
    >
      {children}
      <button
        aria-label={isPending ? "Applying scan filters" : "Apply scan filters"}
        className="app-raised-button app-raised-button-dark inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        translate="no"
        type="submit"
      >
        <span
          aria-hidden="true"
          className={`inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white ${isPending ? "animate-spin" : "hidden"}`}
        />
        <span className={isPending ? "hidden" : undefined}>Filter</span>
        <span className={isPending ? undefined : "hidden"}>Filtering…</span>
      </button>
      {hasFilters ? <Link className="app-raised-button inline-flex h-10 shrink-0 items-center rounded-lg px-4 text-sm font-semibold text-slate-700" href={clearHref ?? basePath} prefetch={false}>Clear</Link> : null}
    </form>
  );
}
