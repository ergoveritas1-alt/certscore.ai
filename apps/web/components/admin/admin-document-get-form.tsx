"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

export function adminGetFormHref(form: HTMLFormElement, action: string) {
  const params = new URLSearchParams();
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string" && value.length > 0) params.set(key, value);
  });
  const query = params.toString();
  return query ? `${action}?${query}` : action;
}

export function useAdminDocumentNavigation() {
  const requested = useRef(false);
  const submittedForm = useRef<HTMLFormElement | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    function restore(event: PageTransitionEvent) {
      if (!event.persisted) return;
      submittedForm.current?.reset();
      requested.current = false;
      setIsPending(false);
    }
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  function navigate(href: string, form: HTMLFormElement) {
    if (requested.current) return;
    requested.current = true;
    submittedForm.current = form;
    setIsPending(true);
    window.location.assign(href);
  }

  return { isPending, navigate };
}

export function AdminDocumentGetForm({ action, children, className }: {
  action: string;
  children: ReactNode;
  className?: string;
  method?: "get";
}) {
  const { isPending, navigate } = useAdminDocumentNavigation();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(adminGetFormHref(event.currentTarget, action), event.currentTarget);
  }

  return <form action={action} aria-busy={isPending} className={className} data-admin-table-form={action} method="get" onSubmit={submit}>
    <fieldset className="contents" disabled={isPending}>{children}</fieldset>
    {isPending ? <span className="text-xs font-semibold text-sky-800" role="status">Applying filters…</span> : null}
  </form>;
}
