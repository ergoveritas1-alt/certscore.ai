import { compare, hash, hashSync } from "bcryptjs";

const PASSWORD_HASH_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = hashSync("invalid-password-placeholder", PASSWORD_HASH_ROUNDS);

export async function hashPassword(password: string) {
  return hash(password, PASSWORD_HASH_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string | null) {
  return compare(password, passwordHash ?? DUMMY_PASSWORD_HASH);
}
