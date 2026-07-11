"use client";

import { useEffect, useState } from "react";

const FALLBACK_TIME_ZONE = "America/Los_Angeles";

type ViewerTimestampProps = {
  value: string | Date | null;
  fallback?: string;
};

function formatViewerTimestampValue(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(date);
}

function formatViewerTimestampFallback(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: FALLBACK_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

export function ViewerTimestamp({ value, fallback = "Not available" }: ViewerTimestampProps) {
  const [timeZone, setTimeZone] = useState<string | null>(null);

  useEffect(() => {
    const resolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolvedTimeZone) {
      setTimeZone(resolvedTimeZone);
    }
  }, []);

  if (!value) {
    return <>{fallback}</>;
  }

  const formatted = timeZone ? formatViewerTimestampValue(value, timeZone) : formatViewerTimestampFallback(value);

  if (!formatted) {
    return <>{fallback}</>;
  }

  return <span suppressHydrationWarning title={timeZone ?? "Viewer local time"}>{formatted}</span>;
}
