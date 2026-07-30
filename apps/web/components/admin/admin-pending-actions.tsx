"use client";

import { useEffect, type ReactNode } from "react";

export function AdminPendingActions({ children }: { children: ReactNode }) {
  useEffect(() => {
    function handleSubmit(event: SubmitEvent) {
      const submitter = event.submitter;
      if (!(submitter instanceof HTMLButtonElement) || submitter.disabled) {
        return;
      }

      submitter.disabled = true;
      submitter.setAttribute("aria-busy", "true");
      submitter.dataset.adminOriginalLabel = submitter.textContent ?? "";
      submitter.textContent = "Working…";

      window.setTimeout(() => {
        if (submitter.isConnected) {
          submitter.disabled = false;
          submitter.removeAttribute("aria-busy");
          submitter.textContent = submitter.dataset.adminOriginalLabel ?? submitter.textContent;
        }
      }, 15_000);
    }

    document.addEventListener("submit", handleSubmit, true);
    return () => document.removeEventListener("submit", handleSubmit, true);
  }, []);

  return children;
}
