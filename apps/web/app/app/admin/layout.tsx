import type { ReactNode } from "react";
import { requirePlatformAdminContext } from "../../../server/admin/platform-admin";
import { PendingLink } from "../../../components/ui/pending-link";
import { AdminPendingActions } from "../../../components/admin/admin-pending-actions";

type AdminLayoutProps = {
  children: ReactNode;
};

const navItems = [
  { href: "/app/admin", label: "Overview" },
  { href: "/app/admin/users?dir=desc&sort=lastScan", label: "Users" },
  { href: "/app/admin/companies", label: "Workspaces" },
  { href: "/app/admin/scans", label: "Scans" },
  { href: "/app/admin/pulse", label: "API activity" },
  { href: "/app/admin/monitor-requests", label: "Monitor Requests" }
] as const;

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requirePlatformAdminContext();

  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="max-w-3xl text-sm text-slate-600">Workspace operations, scan inspection, and API activity.</p>
      </div>

      <nav className="flex min-w-0 flex-wrap gap-2">
        {navItems.map((item) => (
          <PendingLink
            key={item.href}
            href={item.href}
            prefetch
            className="app-raised-button rounded-full px-3.5 py-1.5 text-sm text-slate-700 hover:text-slate-950"
            idleContent={item.label}
            pendingContent="Opening…"
          />
        ))}
      </nav>

      <AdminPendingActions>{children}</AdminPendingActions>
    </div>
  );
}
