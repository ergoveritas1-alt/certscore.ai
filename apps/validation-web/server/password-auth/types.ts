export type AuthenticatedAppUser = {
  authProvider: string;
  email: string;
  fullName: string | null;
  id: string;
};

export type AuthMode = "sign_in" | "create_account";

export type PasswordAuthUserRecord = {
  created_at: string;
  email: string;
  email_verified_at?: string | null;
  id: string;
  last_login_at: string | null;
  password_hash: string;
  updated_at: string;
};
