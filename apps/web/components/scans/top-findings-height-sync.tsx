"use client";

import React from "react";
import { useEffect, useRef } from "react";

export function TopFindingsHeightSync() {
  const markerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const marker = markerRef.current;
    const layout = marker?.closest<HTMLElement>("[data-executive-summary-layout]");
    const list = marker?.closest<HTMLElement>("[data-executive-top-findings-list]");
    const snapshot = layout?.querySelector<HTMLElement>("[data-executive-snapshot-pane]");

    if (!layout || !list || !snapshot) {
      return undefined;
    }

    let frame = 0;
    const syncHeight = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        list.style.maxHeight = "";
        list.style.overflowY = "";

        if (!window.matchMedia("(min-width: 1024px)").matches) {
          list.style.minHeight = "";
          return;
        }

        const listTop = list.getBoundingClientRect().top;
        const snapshotBottom = snapshot.getBoundingClientRect().bottom;
        const minHeight = Math.max(240, Math.floor(snapshotBottom - listTop));
        list.style.minHeight = `${minHeight}px`;
      });
    };

    const resizeObserver = new ResizeObserver(syncHeight);
    resizeObserver.observe(layout);
    resizeObserver.observe(list);
    resizeObserver.observe(snapshot);
    window.addEventListener("resize", syncHeight);
    syncHeight();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncHeight);
      list.style.maxHeight = "";
      list.style.minHeight = "";
      list.style.overflowY = "";
    };
  }, []);

  return <span ref={markerRef} aria-hidden="true" className="hidden" />;
}
