export function normalizeUrl(input: string): string {
  const trimmedInput = input.trim().replace(/^htps:\/\//i, "https://").replace(/^htp:\/\//i, "http://");

  if (!trimmedInput || /\s/.test(trimmedInput) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedInput)) {
    throw new Error("Invalid URL");
  }

  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedInput) ? trimmedInput : `https://${trimmedInput}`);

  if (url.username || url.password || !url.hostname || !url.hostname.includes(".")) {
    throw new Error("Invalid hostname");
  }

  url.hostname = url.hostname.toLowerCase();
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid protocol");
  }

  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal") ||
    url.hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  ) {
    throw new Error("Invalid hostname");
  }

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
