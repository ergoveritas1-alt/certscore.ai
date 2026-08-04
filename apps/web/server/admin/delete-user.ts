"use server";

import { query, queryOne, withWriteTransaction } from "@website-signal-risk-scanner/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isPlatformAdminEmail, requirePlatformAdminContext } from "./platform-admin";

const schema = z.object({
  userId: z.string().uuid("Invalid user.")
});

type AdminUserDeletionRow = {
  email: string;
  id: string;
  membership_role: string | null;
  organization_id: string | null;
  advanced_member_count: number | null;
};

export async function deleteAdminUserFormAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdminContext();
  const { userId } = schema.parse({ userId: formData.get("userId") });

  if (userId === user.id) {
    throw new Error("You cannot delete your own account here. Use Account settings instead.");
  }

  const target = await queryOne<AdminUserDeletionRow>(
    `select u.id,
            u.email,
            om.organization_id,
            om.role as membership_role,
            (
              select count(*)::int
                from organization_members advanced_members
               where advanced_members.organization_id = om.organization_id
                 and advanced_members.role in ('advanced', 'admin')
            ) as advanced_member_count
       from users u
       left join organization_members om on om.user_id = u.id
      where u.id = $1`,
    [userId],
    { readOnly: true }
  );

  if (!target) {
    throw new Error("The user could not be found.");
  }

  if (isPlatformAdminEmail(target.email)) {
    throw new Error("Platform admin accounts cannot be deleted from this page.");
  }

  if (
    target.organization_id &&
    ["advanced", "admin"].includes(target.membership_role ?? "") &&
    Number(target.advanced_member_count ?? 0) <= 1
  ) {
    throw new Error("Ensure there is at least one advanced workspace user before deleting this user.");
  }

  const deletionStartedAt = performance.now();
  try {
    // Better Auth owns the login, session, and account records. Keep auth and
    // public-profile cleanup atomic so a timeout cannot leave a half-deleted user.
    await withWriteTransaction(async (client) => {
      await client.query(`delete from better_auth_verifications where lower(identifier) = lower($1)`, [target.email]);
      await client.query(`delete from better_auth_users where id = $1`, [target.id]);
      await client.query(`delete from users where id = $1`, [target.id]);
    });
    console.info(JSON.stringify({
      durationMs: Math.round(performance.now() - deletionStartedAt),
      event: "admin.user_delete.completed",
      userId: target.id
    }));
  } catch (error) {
    console.error(JSON.stringify({
      durationMs: Math.round(performance.now() - deletionStartedAt),
      error: error instanceof Error ? error.message : String(error),
      event: "admin.user_delete.failed",
      userId: target.id
    }));
    throw new Error("User deletion could not complete. No account records were changed; try again.");
  }

  revalidatePath("/app/admin/users");
  revalidatePath("/app/admin");
  redirect("/app/admin/users");
}
