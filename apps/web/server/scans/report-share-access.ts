"use server";

import { requireReportUser } from "./report-access";

export async function authorizeReportShareAction(returnPath: string): Promise<void> {
  await requireReportUser(returnPath);
}
