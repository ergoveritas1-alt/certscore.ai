"use client";

import { useEffect, useRef } from "react";
import { ScanUpdatingIndicator } from "./scan-updating-indicator";

/** Highlight changed evidence counts without fading the text or animating initial data. */
export function ScanLiveValue({ value, active }: { value: string | number | null | undefined; active: boolean }) {
  const element = useRef<HTMLSpanElement>(null);
  const previous = useRef({ value, active });
  useEffect(() => {
    const before = previous.current;
    previous.current = { value, active };
    if (!active || !before.active || before.value == null || value == null || before.value === value
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = element.current?.animate(
      [{ backgroundColor: "rgba(56, 189, 248, 0.18)" }, { backgroundColor: "transparent" }],
      { duration: 750, easing: "ease-out" },
    );
    // A terminal scan update also cancels any highlight still in flight.
    return () => animation?.cancel();
  }, [value, active]);
  return <><span ref={element} className="rounded-sm">{typeof value === "number" ? value.toLocaleString() : value ?? "—"}</span><ScanUpdatingIndicator active={active} /></>;
}
