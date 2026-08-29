import {
  assertPublicTargetHostname,
  classifyPublicTargetAddress,
  isLocalOnlyTargetHostname
} from "../network/public-target-policy";

export function normalizeUrl(input: string): string {
  const trimmedInput = input.trim().replace(/^htps:\/\//i, "https://").replace(/^htp:\/\//i, "http://");

  if (!trimmedInput || /\s/.test(trimmedInput) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedInput)) {
    throw new Error("Invalid URL");
  }

  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedInput) ? trimmedInput : `https://${trimmedInput}`);

  if (url.username || url.password || !url.hostname) {
    throw new Error("Invalid hostname");
  }

  url.hostname = url.hostname.toLowerCase();
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid protocol");
  }

  const literal = classifyPublicTargetAddress(url.hostname);
  if (literal.family === 6 || (literal.family === 4 && !literal.public)) {
    throw new Error("Invalid hostname");
  }
  if (
    (literal.family === null && !url.hostname.includes(".")) ||
    isLocalOnlyTargetHostname(url.hostname) ||
    (literal.family === null && url.hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))
  ) {
    throw new Error("Invalid hostname");
  }
  assertPublicTargetHostname(url.hostname);

  const withoutProtocol = trimmedInput.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const preservePath = withoutProtocol.includes("/") || withoutProtocol.includes("?") || withoutProtocol.includes("#");

  if (!preservePath) {
    url.pathname = "/";
    url.search = "";
  }
  url.hash = "";

  return url.toString();
}

export function extractHostname(input: string): string {
  return new URL(input).hostname.toLowerCase();
}
