import type { AuthMode } from "./types";

export type CredentialsActionState = {
  accountRecovery:
    | {
        email: string;
        hint: string;
        kind: "create_password";
      }
    | null;
  error: string | null;
  fieldErrors: {
    email?: string;
    password?: string;
  };
  mode: AuthMode;
};

export const initialCredentialsActionState: CredentialsActionState = {
  accountRecovery: null,
  error: null,
  fieldErrors: {},
  mode: "sign_in"
};
