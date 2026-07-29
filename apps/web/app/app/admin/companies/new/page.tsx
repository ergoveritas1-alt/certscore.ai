import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { requirePlatformAdminContext } from "../../../../../server/admin/platform-admin";
import { createCompanyFormAction } from "../../../../../server/company/actions";

export default async function NewCompanyPage() {
  await requirePlatformAdminContext();
  return (
    <div className="max-w-2xl space-y-4">
      <Link className="text-sm font-semibold text-sky-700" href="/app/admin/companies">← Back to workspaces</Link>
      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Create workspace</CardTitle><p className="text-sm text-slate-600">Create the workspace first, then add its first user. The first user receives advanced access automatically.</p></CardHeader>
        <CardContent>
          <form action={createCompanyFormAction} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Workspace name<input className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3" name="name" required /></label>
            <p className="text-xs text-slate-500">A stable workspace slug will be generated automatically.</p>
            <button className="app-raised-button app-raised-button-dark rounded-lg px-4 py-2 text-sm font-semibold text-white" type="submit">Create workspace</button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
