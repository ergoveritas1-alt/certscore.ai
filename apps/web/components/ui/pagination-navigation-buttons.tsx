"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@website-signal-risk-scanner/ui";
import type { MouseEvent } from "react";
import { useState, useTransition } from "react";

export function PaginationNavigationButtons({
  nextHref,
  previousHref
}: {
  nextHref: string | null;
  previousHref: string | null;
}) {
  const router = useRouter();
  const [isPageNavigationPending, startPageNavigation] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  function handlePageNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    if (isPageNavigationPending) {
      return;
    }

    setPendingHref(href);
    startPageNavigation(() => {
      router.push(href);
    });
  }

  return <>
    <Button asChild disabled={previousHref === null || isPageNavigationPending} size="sm" variant="secondary">
      {previousHref === null ? (
        <span className="cursor-not-allowed text-slate-400">Previous</span>
      ) : (
        <Link
          aria-busy={isPageNavigationPending && pendingHref === previousHref}
          aria-disabled={isPageNavigationPending}
          className={isPageNavigationPending ? "cursor-wait text-slate-500" : undefined}
          href={previousHref}
          onClick={(event) => handlePageNavigation(event, previousHref)}
          prefetch={false}
          tabIndex={isPageNavigationPending ? -1 : undefined}
        >
          {isPageNavigationPending && pendingHref === previousHref ? "Loading…" : "Previous"}
        </Link>
      )}
    </Button>
    <Button asChild disabled={nextHref === null || isPageNavigationPending} size="sm" variant="secondary">
      {nextHref === null ? (
        <span className="cursor-not-allowed text-slate-400">Next</span>
      ) : (
        <Link
          aria-busy={isPageNavigationPending && pendingHref === nextHref}
          aria-disabled={isPageNavigationPending}
          className={isPageNavigationPending ? "cursor-wait text-slate-500" : undefined}
          href={nextHref}
          onClick={(event) => handlePageNavigation(event, nextHref)}
          prefetch={false}
          tabIndex={isPageNavigationPending ? -1 : undefined}
        >
          {isPageNavigationPending && pendingHref === nextHref ? "Loading…" : "Next"}
        </Link>
      )}
    </Button>
  </>;
}
