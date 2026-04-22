import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getWritePool } from "@website-signal-risk-scanner/db";
import { createGmailTransport, getGmailConfig } from "../email/gmail";
import { BETTER_AUTH_COOKIE_PREFIX, BETTER_AUTH_SESSION_COOKIE_NAME } from "./constants";
import { getBetterAuthBaseURLConfig, getBetterAuthEnv } from "./env";

function getGoogleProviderConfig(env: ReturnType<typeof getBetterAuthEnv>) {
  if (!env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return undefined;
  }

  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET
  };
}

function createAuth() {
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
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const gmailConfig = getGmailConfig();

        if (!gmailConfig) {
          return;
        }

        const transporter = createGmailTransport(gmailConfig);

        void transporter.sendMail({
          from: `"CertScore.ai" <${gmailConfig.fromEmail}>`,
          subject: "Reset your CertScore.ai password",
          text: [
            "We received a request to reset your CertScore.ai password.",
            "",
            "Use this secure link to choose a new password:",
            url,
            "",
            `If you did not request a reset for ${user.email}, you can ignore this email.`
          ].join("\n"),
          to: user.email
        });
      }
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        const gmailConfig = getGmailConfig();

        if (!gmailConfig) {
          return;
        }

        const transporter = createGmailTransport(gmailConfig);

        void transporter.sendMail({
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
    plugins: [nextCookies()],
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
  });
}

type BetterAuthInstance = ReturnType<typeof createAuth>;

let authSingleton: BetterAuthInstance | null = null;

export function getAuth(): BetterAuthInstance {
  if (authSingleton) {
    return authSingleton;
  }

  const auth = createAuth();
  authSingleton = auth;
  return auth;
}
