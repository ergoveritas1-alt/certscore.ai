"use client";

import React, { useEffect, useMemo, useState } from "react";

const MAX_ACTIVITY_LINE_LENGTH = 200;
const ACTIVITY_ROTATION_MS = 1800;

function truncateActivityLine(line: string) {
  if (line.length <= MAX_ACTIVITY_LINE_LENGTH) {
    return line;
  }

  return `${line.slice(0, MAX_ACTIVITY_LINE_LENGTH - 1)}…`;
}

export function useRotatingActivityLine(input: {
  fallbackLines: string[];
  lines: string[];
  running: boolean;
}) {
  const [activityOffset, setActivityOffset] = useState(0);

  const normalizedFeed = useMemo(() => {
    if (input.lines.length === 0) {
      return input.fallbackLines;
    }

    if (input.lines.length === 1) {
      return [input.lines[0], ...input.fallbackLines.slice(1, 2)];
    }

    return input.lines;
  }, [input.fallbackLines, input.lines]);

  useEffect(() => {
    setActivityOffset(0);
  }, [normalizedFeed.length]);

  useEffect(() => {
    if (normalizedFeed.length <= 1 || !input.running) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActivityOffset((current) => (current + 1) % normalizedFeed.length);
    }, ACTIVITY_ROTATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [input.running, normalizedFeed.length]);

  const activeLine = truncateActivityLine(normalizedFeed[activityOffset] ?? input.fallbackLines[0] ?? "");

  return {
    activeLine
  };
}

export function LiveActivityLine({ line }: { line: string }) {
  return (
    <p className="flex max-w-full items-center gap-2 truncate whitespace-nowrap leading-5" title={line}>
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border border-slate-300 border-t-slate-700"
      />
      <span className="status-sheen-label shrink-0" data-text="Scanning...">
        Scanning...
      </span>
      <span className="truncate">{line}</span>
    </p>
  );
}
