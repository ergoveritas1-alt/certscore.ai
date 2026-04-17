import "server-only";

import {
  findBetterAuthCredentialAccount,
  findBetterAuthUserByEmail,
  findBetterAuthUserById
} from "../users/repository";

type BetterAuthUserRow = {
  email: string;
  email_verified: boolean;
};

type BetterAuthAccountRow = {
  id: string;
};

export async function getBetterAuthVerificationStatus(userId: string) {
  const data = await findBetterAuthUserById(userId);

  if (!data) {
    return null;
  }

  return {
    email: String((data as BetterAuthUserRow).email),
    isVerified: Boolean((data as BetterAuthUserRow).email_verified),
    verifiedAt: null
  };
}

export async function hasBetterAuthPasswordAccount(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const userRow = await findBetterAuthUserByEmail(normalizedEmail);

  if (!userRow?.id) {
    return false;
  }

  const accountRow = await findBetterAuthCredentialAccount(String(userRow.id));

  return Boolean((accountRow as BetterAuthAccountRow | null)?.id);
}
