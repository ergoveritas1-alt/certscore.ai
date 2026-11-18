"use client";

import { useCallback, useRef, useState } from "react";

export function AdminScansRefreshButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshRequested = useRef(false);
  const refresh = useCallback(() => {
    if (refreshRequested.current) return;
    refreshRequested.current = true;
    setIsRefreshing(true);
    // A soft RSC refresh can remain pending after the server has finished.
    // Reload the current URL once so both panels receive the same live snapshot.
    window.location.reload();
  }, []);
  return (
    <button
      className="app-raised-button rounded-full px-3 py-1.5 text-sm font-semibold text-slate-700"
      disabled={isRefreshing}
      onClick={refresh}
      type="button"
    >
      {isRefreshing ? "Refreshing…" : "Refresh chart and table"}
    </button>
  );
}
