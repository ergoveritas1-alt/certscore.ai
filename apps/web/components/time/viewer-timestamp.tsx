"use client";

import { useEffect, useState } from "react";

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

export function ViewerTimestamp({ value, fallback = "Not available" }: ViewerTimestampProps) {
  const [timeZone, setTimeZone] = useState("UTC");

  useEffect(() => {
    const resolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolvedTimeZone) {
      setTimeZone(resolvedTimeZone);
    }
  }, []);

  if (!value) {
    return <>{fallback}</>;
  }

  const formatted = formatViewerTimestampValue(value, timeZone);

  if (!formatted) {
    return <>{fallback}</>;
  }

  return <span title={timeZone}>{formatted}</span>;
}
