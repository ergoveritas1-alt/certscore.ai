/** Presentation groups only: canonical product identities and classifications remain intact. */
export function serviceIntegrationGroup(identity: {entity?: string; vendor?: string; product?: string} | null) {
  if (!identity) return {key:"unclassified", name:"Unclassified resources"};
  const {entity, vendor, product} = identity;
  let name: string | undefined;
  if (entity === "Google LLC") {
    if (["Google Maps embed", "Google Maps JavaScript API"].includes(product ?? "")) name = "Google Maps";
    if (["YouTube Image CDN", "YouTube Embedded Player", "YouTube Player Runtime Library"].includes(product ?? "")) name = "YouTube";
  }
  if (entity === "Meta Platforms, Inc." && ["Meta Pixel", "Facebook Page Plugin", "Facebook Static Assets"].includes(product ?? "")) name = "Facebook";
  return name ? {key:JSON.stringify(["integration",entity,name]), name} : {key:JSON.stringify([entity,vendor,product]), name:product ?? vendor ?? "Unclassified resources"};
}
export function groupedOrigin(origin: {key:string;name:string}) {
  try {
    const [entity,vendor,product] = JSON.parse(origin.key);
    if (typeof entity !== "string" || typeof vendor !== "string" || typeof product !== "string") return origin;
    return serviceIntegrationGroup({entity,vendor,product});
  } catch { return origin; }
}
