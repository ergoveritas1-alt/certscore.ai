import "server-only";

import { betterAuth, type Auth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { getWritePool } from "@website-signal-risk-scanner/db";
import { createGmailTransport, getGmailConfig } from "../email/gmail";
import {
  isAllowedAuthEmail,
  isPublicAccountCreationEnabled
} from "../access-control";
import { findBetterAuthUserById } from "../users/repository";
import { buildPasswordEmailContent } from "../auth-flows/password-email-content";
import { getPasswordEmailPurpose } from "../auth-flows/password-email-purpose";
import { BETTER_AUTH_COOKIE_PREFIX, BETTER_AUTH_SESSION_COOKIE_NAME } from "./constants";
import { getBetterAuthBaseURLConfig, getBetterAuthEnv } from "./env";

const PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS = 24 * 60 * 60;

function getGoogleProviderConfig(env: ReturnType<typeof getBetterAuthEnv>) {
  if (!env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return undefined;
  }

  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    disableSignUp: !isPublicAccountCreationEnabled()
  };
}

async function canCreateAuthUser(email: string | null | undefined) {
  // Public sign-up is enforced by emailAndPassword.disableSignUp. This hook
  // must also allow passwordless users created by an authenticated company
  // manager when public sign-up is paused.
  return isAllowedAuthEmail(email);
}

async function canCreateAuthSession(userId: string | null | undefined) {
  if (!userId) {
    return false;
  }

  try {
    const user = await findBetterAuthUserById(userId);
    return isAllowedAuthEmail(user?.email ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Better Auth session access check failed", { error: message, userId });
    return false;
  }
}

type BetterAuthInstance = Auth<any> & {
  api: Auth<any>["api"] & {
    createUser: (...args: any[]) => Promise<any>;
  };
};

function createAuth(): BetterAuthInstance {
  const env = getBetterAuthEnv();

  return betterAuth({
    account: {
      fields: {
        accessToken: "access_token",
        accessTokenExpiresAt: "access_token_expires_at",
        accountId: "account_id",
        createdAt: "created_at",
        idToken: "id_token",
        providerId: "provider_id",
        refreshToken: "refresh_token",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        updatedAt: "updated_at",
        userId: "user_id"
      },
      modelName: "better_auth_accounts"
    },
    advanced: {
      cookiePrefix: BETTER_AUTH_COOKIE_PREFIX,
      cookies: {
        session_token: {
          name: BETTER_AUTH_SESSION_COOKIE_NAME
        }
      },
      database: {
        generateId: () => crypto.randomUUID()
      },
      trustedProxyHeaders: true
    },
    baseURL: getBetterAuthBaseURLConfig(env),
    database: getWritePool(),
    databaseHooks: {
      session: {
        create: {
          before: async (session: { userId?: unknown }) => {
            return canCreateAuthSession(typeof session.userId === "string" ? session.userId : null);
          }
        }
      },
      user: {
        create: {
          before: async (user: { email?: unknown }) => {
            return canCreateAuthUser(typeof user.email === "string" ? user.email : null);
          }
        }
      }
    },
    emailAndPassword: {
      disableSignUp: !isPublicAccountCreationEnabled(),
      enabled: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS,
      sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        const gmailConfig = getGmailConfig();

        if (!gmailConfig) {
          throw new Error("Email delivery is not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.");
        }

        const transporter = createGmailTransport(gmailConfig);
        const purpose = getPasswordEmailPurpose();
        const content = buildPasswordEmailContent({
          email: user.email,
          purpose,
          url
        });

        const delivery = await transporter.sendMail({
          from: `"CertScore.ai" <${gmailConfig.fromEmail}>`,
          subject: content.subject,
          text: content.text,
          to: user.email
        });
        console.info("Password email sent", {
          accepted: delivery.accepted,
          email: user.email,
          messageId: delivery.messageId,
          purpose,
          rejected: delivery.rejected
        });
      }
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        const gmailConfig = getGmailConfig();

        if (!gmailConfig) {
          return;
        }

        const transporter = createGmailTransport(gmailConfig);

        await transporter.sendMail({
          from: `"CertScore.ai" <${gmailConfig.fromEmail}>`,
          subject: "Verify your CertScore.ai email",
          text: [
            "Thanks for creating your CertScore.ai account.",
            "",
            "Verify your email using this secure link:",
            url,
            "",
            `If you did not create an account for ${user.email}, you can ignore this email.`
          ].join("\n"),
          to: user.email
        });
      }
    },
    plugins: [nextCookies(), admin({ defaultRole: "user" })],
    secret: env.BETTER_AUTH_SECRET,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60
      },
      fields: {
        createdAt: "created_at",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        updatedAt: "updated_at",
        userAgent: "user_agent",
        userId: "user_id"
      },
      modelName: "better_auth_sessions"
    },
    socialProviders: {
      google: getGoogleProviderConfig(env)
    },
    user: {
      deleteUser: {
        enabled: true
      },
      fields: {
        createdAt: "created_at",
        emailVerified: "email_verified",
        updatedAt: "updated_at"
      },
      modelName: "better_auth_users"
    },
    verification: {
      fields: {
        createdAt: "created_at",
        expiresAt: "expires_at",
        updatedAt: "updated_at"
      },
      modelName: "better_auth_verifications"
    }
  }) as BetterAuthInstance;
}

let authSingleton: BetterAuthInstance | null = null;

export function getAuth(): BetterAuthInstance {
  if (authSingleton) {
    return authSingleton;
  }

  const auth = createAuth();
  authSingleton = auth;
  return auth;
}
