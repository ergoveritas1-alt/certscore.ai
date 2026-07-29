import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { requirePlatformAdminContext } from "../../../../../server/admin/platform-admin";
import { createCompanyFormAction } from "../../../../../server/company/actions";

export default async function NewCompanyPage() {
  await requirePlatformAdminContext();
  return (
    <div className="max-w-2xl space-y-4">
      <Link className="text-sm font-semibold text-sky-700" href="/app/admin/companies">← Back to companies</Link>
      <Card className="border-slate-200 bg-white">
        <CardHeader><CardTitle>Create company</CardTitle><p className="text-sm text-slate-600">Create the company first, then add its first user. The first user receives advanced access automatically.</p></CardHeader>
        <CardContent>
          <form action={createCompanyFormAction} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Company name<input className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3" name="name" required /></label>
            <label className="block text-sm font-medium text-slate-700">Slug<input className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3" name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /><span className="mt-1 block text-xs font-normal text-slate-500">Lowercase letters, numbers, and hyphens.</span></label>
            <button className="app-raised-button app-raised-button-dark rounded-lg px-4 py-2 text-sm font-semibold text-white" type="submit">Create company</button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
