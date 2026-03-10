export function normalizeUrl(input: string): string {
  const trimmedInput = input.trim();
  const url = new URL(trimmedInput.startsWith("http") ? trimmedInput : `https://${trimmedInput}`);

  if (!url.hostname || !url.hostname.includes(".")) {
    throw new Error("Invalid hostname");
  }

  url.hostname = url.hostname.toLowerCase();
  url.protocol = url.protocol === "http:" || url.protocol === "https:" ? url.protocol : "https:";
  url.pathname = "/";
  url.search = "";
  url.hash = "";

  return url.toString();
}

export function extractHostname(input: string): string {
  return new URL(input).hostname.toLowerCase();
}
