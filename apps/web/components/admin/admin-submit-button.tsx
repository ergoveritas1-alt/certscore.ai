"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type AdminSubmitButtonProps = {
  className?: string;
  idleContent: ReactNode;
  pendingContent?: ReactNode;
  disabled?: boolean;
};

export function AdminSubmitButton({
  className,
  idleContent,
  pendingContent = "Working…",
  disabled = false
}: AdminSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending}
      className={[className, pending ? "cursor-wait opacity-60" : null].filter(Boolean).join(" ")}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? pendingContent : idleContent}
    </button>
  );
}
