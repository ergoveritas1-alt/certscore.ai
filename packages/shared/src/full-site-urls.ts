const trackingParameters =
  /^(utm_[a-z_]+|gclid|dclid|fbclid|msclkid|mc_cid|mc_eid)$/i;
const nonPage =
  /\.(pdf|zip|gz|tar|exe|dmg|mp[34]|wav|png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|xml|csv|ics|docx?|xlsx?|pptx?)(?:$|\/)/i;
const actionSegment =
  /^(logout|log-out|signout|sign-out|login|log-in|signin|sign-in|checkout|cart|basket|add-to-cart|delete|remove|unsubscribe|wp-admin|account|oauth|authorize|payment)$/i;

/** Targets keep meaningful query and hash-router state; evidence display never exposes query values. */
export function normalizeCrawlUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port))
    )
      return null;
    if (!url.hash.startsWith("#/") && !url.hash.startsWith("#!/"))
      url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (trackingParameters.test(key)) url.searchParams.delete(key);
    if (url.toString().length > 2000) return null;
    return url.toString();
  } catch {
    return null;
  }
}
export function crawlExclusion(
  url: string,
  allowedHosts: string[],
): string | null {
  const parsed = new URL(url);
  if (!allowedHosts.includes(parsed.hostname))
    return "outside_validated_hostname_scope";
  if (parsed.hash.startsWith("#/") || parsed.hash.startsWith("#!/")) {
    const route = new URL(parsed.hash.replace(/^#!?/, ""), parsed.origin);
    const exclusion = crawlExclusion(route.toString(), allowedHosts);
    if (exclusion) return exclusion;
  }
  if (nonPage.test(parsed.pathname)) return "non_page_download";
  const segments = decodeURIComponent(parsed.pathname).split("/");
  if (segments.some((segment) => actionSegment.test(segment)))
    return "action_or_authenticated_workflow";
  if (
    [...parsed.searchParams.keys()].some((key) =>
      /^(action|logout|add-to-cart|remove_item|delete|token|access_token|session|sessionid|password|auth)$/i.test(
        key,
      ),
    )
  )
    return "action_or_sensitive_query";
  if (parsed.searchParams.size > 8 || segments.length > 16)
    return "crawl_trap_depth";
  return null;
}
export function crawlSection(url: string) {
  const parsed = new URL(url);
  return parsed.pathname.split("/").filter(Boolean)[0] ?? "/";
}
export function crawlDisplayUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()])
      url.searchParams.set(key, "[redacted]");
    if (url.hash)
      url.hash =
        url.hash.startsWith("#/") || url.hash.startsWith("#!/")
          ? url.hash.split("?")[0]!
          : "";
    return url.toString().slice(0, 2000);
  } catch {
    return "[invalid URL]";
  }
}

export type RobotsPolicy = {
  byHost?: Record<string, RobotsPolicy>;
  rules: Array<{ allow: boolean; path: string }>;
  crawlDelaySeconds: number;
  sitemaps: string[];
};
export function parseCrawlRobots(
  content: string,
  productToken: string,
): RobotsPolicy {
  const groups: Array<{
    agents: string[];
    rules: RobotsPolicy["rules"];
    delay: number;
  }> = [];
  let group = {
    agents: [] as string[],
    rules: [] as RobotsPolicy["rules"],
    delay: 0,
  };
  let rulesStarted = false;
  const sitemaps: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).toLowerCase(),
      value = line.slice(separator + 1).trim();
    if (key === "sitemap") {
      if (sitemaps.length < 25) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (rulesStarted) {
        groups.push(group);
        group = { agents: [], rules: [], delay: 0 };
        rulesStarted = false;
      }
      if (value) group.agents.push(value.toLowerCase());
    } else if (group.agents.length) {
      rulesStarted = true;
      if ((key === "allow" || key === "disallow") && value) {
        if (group.rules.length >= 10000 || value.length > 2000)
          throw new Error("robots_policy_limit");
        group.rules.push({ allow: key === "allow", path: value });
      }
      if (
        key === "crawl-delay" &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0
      )
        group.delay = Number(value);
    }
  }
  groups.push(group);
  const token = productToken.toLowerCase();
  const specific = groups.filter((g) =>
    g.agents.some((agent) => agent !== "*" && token.includes(agent)),
  );
  const selected = specific.length
    ? specific
    : groups.filter((g) => g.agents.includes("*"));
  return {
    rules: selected.flatMap((g) => g.rules),
    crawlDelaySeconds: Math.max(0, ...selected.map((g) => g.delay)),
    sitemaps,
  };
}
export function robotsAllows(url: string, policy: RobotsPolicy): boolean {
  const parsed = new URL(url);
  if (policy.byHost) {
    const hostPolicy = policy.byHost[parsed.hostname];
    return !!hostPolicy && robotsAllows(url, hostPolicy);
  }
  const normalize = (value: string) =>
    value.replace(/%[0-9a-f]{2}/gi, (token) => {
      const c = String.fromCharCode(parseInt(token.slice(1), 16));
      return /[A-Za-z0-9._~-]/.test(c) ? c : token.toUpperCase();
    });
  const target = normalize(parsed.pathname + parsed.search);
  const matches = policy.rules
    .filter((rule) => {
      const anchored = rule.path.endsWith("$");
      const pattern =
        normalize(anchored ? rule.path.slice(0, -1) : rule.path) +
        (anchored ? "" : "*");
      // Greedy wildcard matching avoids attacker-controlled regular-expression backtracking.
      let i = 0,
        j = 0,
        star = -1,
        retry = 0;
      while (i < target.length) {
        if (pattern[j] === target[i]) {
          i++;
          j++;
        } else if (pattern[j] === "*") {
          star = j++;
          retry = i;
        } else if (star >= 0) {
          j = star + 1;
          i = ++retry;
        } else return false;
      }
      while (pattern[j] === "*") j++;
      return j === pattern.length;
    })
    .sort(
      (a, b) =>
        b.path.replace(/[*$]/g, "").length -
          a.path.replace(/[*$]/g, "").length ||
        Number(b.allow) - Number(a.allow),
    );
  return matches[0]?.allow ?? true;
}

/** Only claim a universal prohibition when no Allow exception can reopen a subset. */
export function robotsDisallowAll(policy: RobotsPolicy): boolean {
  if (policy.byHost)
    return (
      Object.keys(policy.byHost).length > 0 &&
      Object.values(policy.byHost).every(robotsDisallowAll)
    );
  return (
    !policy.rules.some((rule) => rule.allow) &&
    policy.rules.some(
      (rule) =>
        !rule.allow && (rule.path === "/" || /^\/?\*+\$?$/.test(rule.path)),
    )
  );
}
export function robotsRestrictCrawl(policy: RobotsPolicy): boolean {
  return policy.byHost
    ? Object.values(policy.byHost).some(robotsRestrictCrawl)
    : policy.rules.some((rule) => !rule.allow);
}
export function robotsRestrictionMessage(policy: RobotsPolicy): string | null {
  if (robotsDisallowAll(policy))
    return "robots.txt prohibits crawling this site. No additional pages were crawled; only the separate homepage audit is shown.";
  if (robotsRestrictCrawl(policy))
    return "robots.txt restricts crawl coverage. Only permitted URLs are eligible; disallowed paths are excluded. This inventory does not cover the whole site.";
  return null;
}
