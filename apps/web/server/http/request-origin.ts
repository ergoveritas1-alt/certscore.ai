function getFirstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function isBindableHost(host: string) {
  const hostname = host.split(":")[0]?.trim().toLowerCase();
  return hostname === "0.0.0.0" || hostname === "::" || hostname === "[::]";
}

export function getRequestOrigin(request: Request) {
  const forwardedHost = getFirstHeaderValue(request.headers.get("x-forwarded-host"));
  const headerHost = request.headers.get("host")?.trim() || "";
  const requestUrlHost = new URL(request.url).host;
  const hostCandidates = [forwardedHost, headerHost, requestUrlHost].filter(Boolean);
  const host = hostCandidates.find((candidate) => !isBindableHost(candidate)) ?? hostCandidates[0];

  if (!host) {
    return new URL(request.url).origin;
  }

  const forwardedProto = getFirstHeaderValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProto || (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${host}`;
}
