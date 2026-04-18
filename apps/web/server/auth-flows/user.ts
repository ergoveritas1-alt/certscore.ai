import { findAppUserByEmailRecord } from "../users/repository";

type ProfileRow = {
  auth_provider?: string;
  email: string;
  full_name: string | null;
  id: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function findAppUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return (await findAppUserByEmailRecord(normalizedEmail)) as ProfileRow | null;
}
