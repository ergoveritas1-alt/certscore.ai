import {
  createBrowserClient as createSupabaseBrowserClient,
  createServerClient as createSupabaseServerClient,
  type CookieMethodsBrowser,
  type CookieMethodsServer,
  type CookieOptionsWithName
} from "@supabase/ssr";
import { getSupabaseAdminEnv, getSupabasePublicEnv, type SupabasePublicEnv } from "./env";
import { createPostgrestCompatClient, type PostgrestCompatClient } from "./postgrest-compat";

type ServerClientOptions = {
  cookies: CookieMethodsServer;
  cookieOptions?: CookieOptionsWithName;
  cookieEncoding?: "raw" | "base64url";
};

type BrowserClientOptions = {
  cookies?: CookieMethodsBrowser;
  cookieOptions?: CookieOptionsWithName;
  cookieEncoding?: "raw" | "base64url";
  isSingleton?: boolean;
};

type PublicSupabaseValues = Pick<
  SupabasePublicEnv,
  "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
>;

export function createServerClient(options: ServerClientOptions, env: PublicSupabaseValues = getSupabasePublicEnv()) {
  const values = env;

  return createSupabaseServerClient(
    values.NEXT_PUBLIC_SUPABASE_URL,
    values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: options.cookies,
      cookieOptions: options.cookieOptions,
      cookieEncoding: options.cookieEncoding
    }
  );
}

export function createBrowserClient(
  options: BrowserClientOptions = {},
  env: PublicSupabaseValues = getSupabasePublicEnv()
) {
  const values = env;

  return createSupabaseBrowserClient(
    values.NEXT_PUBLIC_SUPABASE_URL,
    values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: options.cookies,
      cookieOptions: options.cookieOptions,
      cookieEncoding: options.cookieEncoding,
      isSingleton: options.isSingleton ?? true
    }
  );
}

export function createAdminClient(env: NodeJS.ProcessEnv = process.env): PostgrestCompatClient {
  if (env === process.env) {
    return createPostgrestCompatClient();
  }

  void getSupabaseAdminEnv;
  return createPostgrestCompatClient();
}

export type { CookieMethodsBrowser, CookieMethodsServer, CookieOptionsWithName };
export type { User } from "@supabase/supabase-js";
