"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  className?: string;
  disabled?: boolean;
  idleContent: ReactNode;
  pendingContent: ReactNode;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
};

export function PendingSubmitButton({
  className,
  disabled = false,
  idleContent,
  pendingContent,
  size = "md",
  variant = "primary"
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button className={className} disabled={disabled || pending} size={size} type="submit" variant={variant}>
      {pending ? pendingContent : idleContent}
    </Button>
  );
}
