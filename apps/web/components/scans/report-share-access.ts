"use client";

import type { MouseEvent } from "react";
import { authorizeReportShareAction } from "../../server/scans/report-share-access";

export async function authorizeCurrentReportShare() {
  await authorizeReportShareAction(`${window.location.pathname}${window.location.search}${window.location.hash}`);
}

export async function openAuthorizedReportShareMenu(event: MouseEvent<HTMLElement>) {
  const menu = event.currentTarget.parentElement;
  if (!(menu instanceof HTMLDetailsElement) || menu.open) return;
  event.preventDefault();
  await authorizeCurrentReportShare();
  menu.open = true;
}

export async function followAuthorizedReportShareLink(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const href = event.currentTarget.href;
  await authorizeCurrentReportShare();
  window.location.assign(href);
}
