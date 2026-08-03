"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import type { MouseEvent } from "react";
import { useState } from "react";

export function PaginationNavigationButtons({
  nextHref,
  previousHref
}: {
  nextHref: string | null;
  previousHref: string | null;
}) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const isPageNavigationPending = pendingHref !== null;

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

    if (isPageNavigationPending) {
      event.preventDefault();
      return;
    }

    setPendingHref(href);
  }

  return <>
    <Button asChild disabled={previousHref === null || isPageNavigationPending} size="sm" variant="secondary">
      {previousHref === null ? (
        <span className="cursor-not-allowed text-slate-400">Previous</span>
      ) : (
        <a
          aria-busy={isPageNavigationPending && pendingHref === previousHref}
          aria-disabled={isPageNavigationPending}
          className={isPageNavigationPending ? "cursor-wait text-slate-500" : undefined}
          href={previousHref}
          onClick={(event) => handlePageNavigation(event, previousHref)}
          tabIndex={isPageNavigationPending ? -1 : undefined}
        >
          {isPageNavigationPending && pendingHref === previousHref ? "Loading…" : "Previous"}
        </a>
      )}
    </Button>
    <Button asChild disabled={nextHref === null || isPageNavigationPending} size="sm" variant="secondary">
      {nextHref === null ? (
        <span className="cursor-not-allowed text-slate-400">Next</span>
      ) : (
        <a
          aria-busy={isPageNavigationPending && pendingHref === nextHref}
          aria-disabled={isPageNavigationPending}
          className={isPageNavigationPending ? "cursor-wait text-slate-500" : undefined}
          href={nextHref}
          onClick={(event) => handlePageNavigation(event, nextHref)}
          tabIndex={isPageNavigationPending ? -1 : undefined}
        >
          {isPageNavigationPending && pendingHref === nextHref ? "Loading…" : "Next"}
        </a>
      )}
    </Button>
  </>;
}
