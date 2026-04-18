export type AuthenticatedAppUser = {
  authProvider: string;
  email: string;
  fullName: string | null;
  id: string;
};

export type AuthMode = "sign_in" | "create_account";
