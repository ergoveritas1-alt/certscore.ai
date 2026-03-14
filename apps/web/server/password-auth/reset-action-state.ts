export type PasswordResetRequestState = {
  error: string | null;
  fieldErrors: {
    email?: string;
  };
  message: string | null;
};

export const initialPasswordResetRequestState: PasswordResetRequestState = {
  error: null,
  fieldErrors: {},
  message: null
};

export type PasswordResetConfirmState = {
  error: string | null;
  fieldErrors: {
    password?: string;
    token?: string;
  };
  message: string | null;
};

export const initialPasswordResetConfirmState: PasswordResetConfirmState = {
  error: null,
  fieldErrors: {},
  message: null
};
