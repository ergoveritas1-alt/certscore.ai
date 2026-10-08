"use client";

import { useEffect, useState } from "react";

const FALLBACK_TIME_ZONE = "UTC";

type ViewerTimestampProps = {
  value: string | Date | null;
  fallback?: string;
  includeSeconds?: boolean;
};

function formatViewerTimestampValue(value: string | Date, timeZone: string, includeSeconds: boolean) {
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
    ...(includeSeconds ? { second: "2-digit" as const } : {}),
    hour12: true,
    timeZoneName: "short"
  }).format(date);
}

export function ViewerTimestamp({ value, fallback = "Not available", includeSeconds = false }: ViewerTimestampProps) {
  const [timeZone, setTimeZone] = useState<string | null>(null);

  useEffect(() => {
    try {
      const resolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolvedTimeZone) setTimeZone(resolvedTimeZone);
    } catch {
      // Keep the explicit UTC fallback when browser time-zone detection is unavailable.
    }
  }, []);

  if (!value) {
    return <>{fallback}</>;
  }

  const formatted = formatViewerTimestampValue(value, timeZone ?? FALLBACK_TIME_ZONE, includeSeconds);

  if (!formatted) {
    return <>{fallback}</>;
  }

  const dateTime = (value instanceof Date ? value : new Date(value)).toISOString();
  return <time dateTime={dateTime} title={timeZone ?? FALLBACK_TIME_ZONE}>{formatted}</time>;
}
