import type { Route } from "playwright";

const ONE_PIXEL_TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

const heavyResourceTypes = new Set(["image", "media", "font"]);
const consentResourcePattern = /(?:consent|privacy|cmp|gdpr|gpp|us[_-]?privacy|ccpa|optanon|onetrust|cookie|preference|choices?|do[-_]?not[-_]?sell|donotsell|opt[-_]?out|trustarc|didomi|sourcepoint|quantcast|usercentrics|cookiebot|fides|iab)/i;

export interface HeavyResourcePreserveOptions {
  protectedHostnames?: Iterable<string>;
  protectedUrlPrefixes?: Iterable<string>;
  protectedUrlSubstrings?: Iterable<string>;
}

export async function maybeFulfillHeavyResource(
  route: Route,
  preserveOptions?: HeavyResourcePreserveOptions,
): Promise<boolean> {
  const resourceType = route.request().resourceType();
  if (!heavyResourceTypes.has(resourceType)) {
    return false;
  }
  if (preserveOptions && shouldPreserveHeavyResource(route, preserveOptions)) {
    return false;
  }
  if (resourceType === "image") {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: ONE_PIXEL_TRANSPARENT_PNG,
      headers: {
        "cache-control": "no-store",
      },
    });
    return true;
  }
  if (resourceType === "media") {
    await route.fulfill({
      status: 204,
      contentType: "application/octet-stream",
      body: "",
      headers: {
        "cache-control": "no-store",
      },
    });
    return true;
  }
  if (resourceType === "font") {
    await route.fulfill({
      status: 204,
      contentType: "font/woff2",
      body: "",
      headers: {
        "cache-control": "no-store",
      },
    });
    return true;
  }
  return false;
}

function shouldPreserveHeavyResource(route: Route, options: HeavyResourcePreserveOptions): boolean {
  const request = route.request();
  const requestUrl = request.url();
  if (consentResourcePattern.test(requestUrl)) {
    return true;
  }

  const hostname = hostnameFromUrl(requestUrl);
  if (hostname && hostnameMatches(hostname, options.protectedHostnames)) {
    return true;
  }

  const normalizedUrl = requestUrl.toLowerCase();
  for (const prefix of options.protectedUrlPrefixes ?? []) {
    if (normalizedUrl.startsWith(prefix.toLowerCase())) {
      return true;
    }
  }
  for (const substring of options.protectedUrlSubstrings ?? []) {
    if (substring && normalizedUrl.includes(substring.toLowerCase())) {
      return true;
    }
  }

  return false;
}

function hostnameMatches(hostname: string, protectedHostnames: Iterable<string> | undefined): boolean {
  const normalizedHostname = hostname.toLowerCase();
  for (const protectedHostname of protectedHostnames ?? []) {
    const normalizedProtectedHostname = protectedHostname.toLowerCase();
    if (
      normalizedHostname === normalizedProtectedHostname ||
      normalizedHostname.endsWith(`.${normalizedProtectedHostname}`)
    ) {
      return true;
    }
  }
  return false;
}

function hostnameFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
