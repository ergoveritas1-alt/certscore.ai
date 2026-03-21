"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useState, useTransition } from "react";
import { Button } from "@website-signal-risk-scanner/ui";
import type { AnchorHTMLAttributes } from "react";

type PendingLinkSharedProps = {
  href: string;
  className?: string;
  pendingClassName?: string;
  onClick?: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"];
};

type PendingLinkProps = PendingLinkSharedProps & {
  idleContent: ReactNode;
  pendingContent: ReactNode;
  ariaLabel?: string;
  title?: string;
};

type PendingButtonLinkProps = PendingLinkSharedProps & {
  idleContent: ReactNode;
  pendingContent?: ReactNode;
  ariaLabel?: string;
  title?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
};

function usePendingNavigation(href: string, onClick?: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"]) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hasStartedNavigation, setHasStartedNavigation] = useState(false);
  const isNavigating = isPending || hasStartedNavigation;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (isNavigating) {
      event.preventDefault();
      return;
    }

    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    setHasStartedNavigation(true);
    startTransition(() => {
      router.push(href);
    });
  }

  return { handleClick, isNavigating };
}

export function PendingLink({
  href,
  className,
  pendingClassName,
  idleContent,
  pendingContent,
  ariaLabel,
  title,
  onClick
}: PendingLinkProps) {
  const { handleClick, isNavigating } = usePendingNavigation(href, onClick);

  return (
    <Link
      aria-disabled={isNavigating}
      aria-label={ariaLabel}
      className={[className, isNavigating ? pendingClassName : null].filter(Boolean).join(" ")}
      href={href}
      onClick={handleClick}
      tabIndex={isNavigating ? -1 : undefined}
      title={title}
    >
      {isNavigating ? pendingContent : idleContent}
    </Link>
  );
}

export function PendingButtonLink({
  href,
  className,
  pendingClassName,
  idleContent,
  pendingContent = "Opening...",
  ariaLabel,
  title,
  size = "md",
  variant = "primary",
  onClick
}: PendingButtonLinkProps) {
  const { handleClick, isNavigating } = usePendingNavigation(href, onClick);

  return (
    <Button
      aria-label={ariaLabel}
      asChild
      className={[className, isNavigating ? pendingClassName : null].filter(Boolean).join(" ")}
      size={size}
      variant={variant}
    >
      <Link
        aria-disabled={isNavigating}
        href={href}
        onClick={handleClick}
        tabIndex={isNavigating ? -1 : undefined}
        title={title}
      >
        {isNavigating ? pendingContent : idleContent}
      </Link>
    </Button>
  );
}
