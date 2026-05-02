import type { Page, Request, Route } from "playwright";

const BLOCKED_RESOURCE_TYPES = new Set(["media"]);
const BLOCKED_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".m3u8"
]);

export type RequestBlockingMode = "off" | "light" | "full";

export type RequestBlockingStats = {
  blockedCount: number;
  blockedByExtensionCount: number;
  blockedByResourceTypeCount: number;
  blockedByType: Record<string, number>;
  estimatedBytesSaved: number | null;
};

export type RequestBlockingController = {
  getStats: () => RequestBlockingStats;
  stop: () => Promise<void>;
};

export function createRequestBlockingStats(): RequestBlockingStats {
  return {
    blockedCount: 0,
    blockedByExtensionCount: 0,
    blockedByResourceTypeCount: 0,
    blockedByType: {},
    estimatedBytesSaved: null
  };
}

export function shouldBlockHeavyAssetRequest(request: Request, mode: RequestBlockingMode = "full") {
  if (mode === "off") {
    return { block: false, reason: null as "resource_type" | "extension" | null };
  }

  const resourceType = request.resourceType();
  if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
    return { block: true, reason: "resource_type" as const };
  }

  if (mode === "full" && hasBlockedExtension(request.url())) {
    return { block: true, reason: "extension" as const };
  }

  return { block: false, reason: null as "resource_type" | "extension" | null };
}

export function recordBlockedHeavyAssetRequest(
  stats: RequestBlockingStats,
  request: Request,
  reason: "resource_type" | "extension"
) {
  const resourceType = request.resourceType() || "other";
  stats.blockedCount += 1;
  stats.blockedByType[resourceType] = (stats.blockedByType[resourceType] ?? 0) + 1;

  if (reason === "resource_type") {
    stats.blockedByResourceTypeCount += 1;
  } else {
    stats.blockedByExtensionCount += 1;
  }
}

export async function setupRequestBlocking(
  page: Page,
  options: {
    mode?: RequestBlockingMode;
    stats?: RequestBlockingStats;
  } = {}
): Promise<RequestBlockingController> {
  const mode = options.mode ?? "full";
  const stats = options.stats ?? createRequestBlockingStats();

  const handler = async (route: Route) => {
    const request = route.request();
    const decision = shouldBlockHeavyAssetRequest(request, mode);

    if (decision.block && decision.reason) {
      recordBlockedHeavyAssetRequest(stats, request, decision.reason);
      await abortRoute(route);
      return;
    }

    await continueRoute(route);
  };

  await page.route("**/*", handler);

  return {
    getStats: () => ({ ...stats, blockedByType: { ...stats.blockedByType } }),
    stop: async () => {
      await page.unroute("**/*", handler).catch(() => undefined);
    }
  };
}

async function abortRoute(route: Route) {
  try {
    await route.abort("blockedbyclient");
  } catch (error) {
    if (!isIgnorableRouteError(error)) {
      throw error;
    }
  }
}

async function continueRoute(route: Route) {
  try {
    await route.continue();
  } catch (error) {
    if (!isIgnorableRouteError(error)) {
      throw error;
    }
  }
}

function isIgnorableRouteError(error: unknown) {
  return error instanceof Error && /Target page, context or browser has been closed|Route is already handled|route\.(continue|abort)/i.test(error.message);
}

function hasBlockedExtension(rawUrl: string) {
  try {
    const pathname = new URL(rawUrl).pathname.toLowerCase();
    return BLOCKED_EXTENSIONS.has(pathname.slice(pathname.lastIndexOf(".")));
  } catch {
    const path = rawUrl.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
    return BLOCKED_EXTENSIONS.has(path.slice(path.lastIndexOf(".")));
  }
}
