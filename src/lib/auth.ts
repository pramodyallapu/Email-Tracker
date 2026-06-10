import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Zoho from "next-auth/providers/zoho";
import { createAdminClient } from "@/lib/supabase/admin";
import { authConfig } from "@/lib/auth.config";
import { resolveUserIdByEmail } from "@/lib/auth-user";
import { getOrgMembership } from "@/lib/org/context";
import { getZohoDc, zohoAccountsHost } from "@/lib/zoho/config";
import type { MailProvider } from "@/types/mail";
import type { JWT } from "next-auth/jwt";

async function refreshGoogleToken(token: JWT) {
  if (!token.refreshToken) {
    return { ...token, error: "RefreshAccessTokenError" as const };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
      }),
    });

    const refreshed = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!response.ok || !refreshed.access_token) {
      throw new Error(refreshed.error ?? "Token refresh failed");
    }

    const expiresAt = Date.now() + (refreshed.expires_in ?? 3600) * 1000;

    if (token.userId) {
      const supabase = createAdminClient();
      const { data: personalConn } = await supabase
        .from("mail_connections")
        .select("id")
        .eq("user_id", token.userId as string)
        .eq("provider", "google")
        .is("organization_id", null)
        .maybeSingle();

      if (personalConn?.id) {
        await supabase
          .from("mail_connections")
          .update({
            access_token: refreshed.access_token,
            token_expiry: new Date(expiresAt).toISOString(),
          })
          .eq("id", personalConn.id);
      }

      await supabase
        .from("users")
        .update({
          gmail_access_token: refreshed.access_token,
          gmail_token_expiry: new Date(expiresAt).toISOString(),
        })
        .eq("id", token.userId as string);
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: expiresAt,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" as const };
  }
}

async function refreshZohoAuthToken(token: JWT) {
  if (!token.refreshToken) {
    return { ...token, error: "RefreshAccessTokenError" as const };
  }

  const dc = getZohoDc();
  try {
    const response = await fetch(`${zohoAccountsHost(dc)}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: token.refreshToken as string,
        client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });

    const refreshed = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!response.ok || !refreshed.access_token) {
      throw new Error(refreshed.error ?? "Zoho refresh failed");
    }

    const expiresAt = Date.now() + (refreshed.expires_in ?? 3600) * 1000;

    if (token.userId) {
      const supabase = createAdminClient();
      await supabase
        .from("mail_connections")
        .update({
          access_token: refreshed.access_token,
          token_expiry: new Date(expiresAt).toISOString(),
        })
        .eq("user_id", token.userId as string)
        .eq("provider", "zoho");
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: expiresAt,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" as const };
  }
}

async function resolveZohoEmail(accessToken: string): Promise<string | null> {
  const dc = getZohoDc();
  try {
    const res = await fetch(`${zohoAccountsHost(dc)}/oauth/user/info`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    const info = (await res.json()) as { Email?: string; email?: string };
    return info.Email ?? info.email ?? null;
  } catch {
    return null;
  }
}

async function attachOrgToToken(token: JWT) {
  if (!token.userId) return token;
  const membership = await getOrgMembership(token.userId as string);
  if (membership) {
    token.organizationId = membership.organizationId;
    token.organizationName = membership.organizationName;
    token.orgRole = membership.role;
  } else {
    token.organizationId = undefined;
    token.organizationName = undefined;
    token.orgRole = undefined;
  }
  return token;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    ...(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET
      ? [
          Zoho({
            clientId: process.env.ZOHO_CLIENT_ID,
            clientSecret: process.env.ZOHO_CLIENT_SECRET,
            authorization: {
              url: `${zohoAccountsHost()}/oauth/v2/auth`,
              params: {
                scope:
                  "ZohoMail.messages.READ,ZohoMail.folders.READ,ZohoMail.accounts.READ,AaaServer.profile.READ",
                access_type: "offline",
                prompt: "consent",
              },
            },
            token: `${zohoAccountsHost()}/oauth/v2/token`,
            userinfo: `${zohoAccountsHost()}/oauth/user/info`,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (!account) {
        console.error("signIn: missing account");
        return false;
      }

      const provider = account.provider as MailProvider;
      if (provider !== "google" && provider !== "zoho") return false;

      let email = user.email;
      if (!email && provider === "zoho" && account.access_token) {
        email = await resolveZohoEmail(account.access_token);
      }
      if (!email) {
        console.error("signIn: could not resolve user email for", provider);
        return false;
      }

      const supabase = createAdminClient();
      const expiresAt = account.expires_at
        ? new Date(account.expires_at * 1000).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString();

      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      const userPayload = {
        email,
        name: user.name ?? null,
        avatar_url: user.image ?? null,
        updated_at: new Date().toISOString(),
        ...(provider === "google"
          ? {
              gmail_access_token: account.access_token ?? null,
              gmail_refresh_token: account.refresh_token ?? null,
              gmail_token_expiry: expiresAt,
            }
          : {}),
      };

      if (existing) {
        const { error } = await supabase
          .from("users")
          .update(userPayload)
          .eq("id", existing.id);
        if (error) {
          console.error("Supabase user update failed:", error.message);
          return false;
        }
      } else {
        const { error } = await supabase.from("users").insert(userPayload);
        if (error) {
          console.error("Supabase user insert failed:", error.message);
          return false;
        }
      }

      return true;
    },
    async jwt({ token, account, user }) {
      if (user?.email) token.email = user.email;

      if (account && user?.email) {
        token.userId =
          (await resolveUserIdByEmail(user.email)) ?? undefined;
        token.provider = account.provider as MailProvider;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;
        token.error = undefined;
        return attachOrgToToken(token);
      }

      if (!token.userId && token.email) {
        token.userId =
          (await resolveUserIdByEmail(token.email as string)) ?? undefined;
      }

      const expires = token.accessTokenExpires as number | undefined;
      if (expires && Date.now() < expires - 60_000) {
        return attachOrgToToken(token);
      }

      const refreshed =
        token.provider === "zoho"
          ? await refreshZohoAuthToken(token)
          : await refreshGoogleToken(token);
      return attachOrgToToken(refreshed);
    },
    async session({ session, token }) {
      let userId = token.userId as string | undefined;
      if (!userId && session.user?.email) {
        userId =
          (await resolveUserIdByEmail(session.user.email)) ?? undefined;
      }
      if (session.user && userId) session.user.id = userId;
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      session.provider = token.provider as MailProvider | undefined;
      session.organizationId = token.organizationId as string | undefined;
      session.organizationName = token.organizationName as string | undefined;
      session.orgRole = token.orgRole as typeof session.orgRole;
      return session;
    },
  },
});
