import Link from "next/link";
import { mcpClientHref } from "../../../../lib/admin/mcp-discovery";

export function McpNavigation({ active, traffic, client, surface, source, period }: {
  active: "usage" | "discovery" | "workflows"; traffic: string; client?: string | null;
  surface?: string | null; source?: string | null; period?: string;
}) {
  return <nav aria-label="MCP operations views" className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
    {([ ["usage", "Usage"], ["discovery", "Discovery & probes"], ["workflows", "Task intent & workflows"] ] as const).map(([tab, label]) => <Link
      aria-current={active === tab ? "page" : undefined}
      className={`rounded-lg px-4 py-2 text-sm font-semibold ${active === tab ? "bg-white text-sky-800 shadow-sm" : "text-slate-600 hover:bg-white"}`}
      href={mcpClientHref(tab, { traffic, clientName: client, surface, source, period })}
      key={tab} prefetch={false}
    >{label}</Link>)}
  </nav>;
}
