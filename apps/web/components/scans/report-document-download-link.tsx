"use client";

import React, { useEffect, useState, type ComponentProps } from "react";

export function reportDocumentDownloadHref(href: string, timeZone: string | null) {
  if (!timeZone) return href;
  const url = new URL(href, "https://certscore.ai");
  url.searchParams.set("timeZone", timeZone);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function ReportDocumentDownloadLink({ href, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  const [timeZone, setTimeZone] = useState<string | null>(null);
  useEffect(() => {
    try { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null); }
    catch { setTimeZone(null); }
  }, []);
  return <a {...props} href={reportDocumentDownloadHref(href, timeZone)} />;
}
