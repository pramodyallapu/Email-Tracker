import { revalidatePath } from "next/cache";
import { getAppBaseUrl } from "@/lib/app-url";
import { auth } from "@/lib/auth";
import {
  canConnectMailboxes,
  getOrgMembership,
} from "@/lib/org/context";
import { upsertMailConnection, upsertOrgMailConnection } from "@/lib/mail/connections";
import { syncAllForScope, syncAllForUser } from "@/lib/mail/sync-all";
import { resolveMailScope } from "@/lib/mail/scope";
import { getZohoDc, zohoAccountsHost } from "@/lib/zoho/config";
import type { MailProvider } from "@/types/mail";
import { NextRequest, NextResponse } from "next/server";

function isProvider(p: string): p is MailProvider {
  return p === "google" || p === "zoho";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  const membership = await getOrgMembership(session.user.id);
  const code = request.nextUrl.searchParams.get("code");
  const baseUrl = getAppBaseUrl(request);

  if (!code) {
    if (membership && !canConnectMailboxes(membership.role)) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=forbidden", request.url)
      );
    }

    const state = Buffer.from(
      JSON.stringify({
        userId: session.user.id,
        provider,
        organizationId: membership?.organizationId ?? null,
      })
    ).toString("base64url");

    const redirectUri = `${baseUrl}/api/mail/connect/${provider}`;

    if (provider === "zoho") {
      const dc = getZohoDc();
      const url = new URL(`${zohoAccountsHost(dc)}/oauth/v2/auth`);
      url.searchParams.set("client_id", process.env.ZOHO_CLIENT_ID!);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set(
        "scope",
        "ZohoMail.messages.READ,ZohoMail.folders.READ,ZohoMail.accounts.READ,AaaServer.profile.READ"
      );
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("state", state);
      return NextResponse.redirect(url);
    }

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set(
      "scope",
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ].join(" ")
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return NextResponse.redirect(url);
  }

  const redirectUri = `${baseUrl}/api/mail/connect/${provider}`;
  let tokenRes: Response;

  if (provider === "zoho") {
    tokenRes = await fetch(`${zohoAccountsHost()}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
  } else {
    tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
  }

  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!tokenRes.ok || !tokens.access_token) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=${encodeURIComponent(tokens.error ?? "connect_failed")}`,
        request.url
      )
    );
  }

  const expiresAt = new Date(
    Date.now() + (tokens.expires_in ?? 3600) * 1000
  ).toISOString();

  let mailboxEmail = session.user.email ?? "unknown";
  if (provider === "google") {
    const info = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).then((r) => r.json() as Promise<{ email?: string }>);
    mailboxEmail = info.email ?? mailboxEmail;
  }

  const currentMembership = await getOrgMembership(session.user.id);

  if (currentMembership) {
    if (!canConnectMailboxes(currentMembership.role)) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=forbidden", request.url)
      );
    }

    const {
      connection: conn,
      error: saveError,
      isNew,
    } = await upsertOrgMailConnection(
      currentMembership.organizationId,
      session.user.id,
      provider,
      {
        mailbox_email: mailboxEmail.toLowerCase(),
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expiry: expiresAt,
        zoho_dc: provider === "zoho" ? getZohoDc() : null,
      }
    );

    if (!conn) {
      const hint =
        saveError?.includes("user_id") || saveError?.includes("null value")
          ? "Run sql/fix-org-mailbox-connect.sql in Supabase SQL Editor, then try Add Gmail again."
          : saveError?.includes("organization_id")
            ? "Run sql/organizations.sql in Supabase SQL Editor, then try again."
            : "Run sql/fix-org-mailbox-connect.sql in Supabase, then try again.";
      const message = saveError
        ? `${saveError} — ${hint}`
        : `Could not save mailbox. ${hint}`;
      return NextResponse.redirect(
        new URL(
          "/dashboard/settings?error=" + encodeURIComponent(message),
          request.url
        )
      );
    }

    const scope = await resolveMailScope(session.user.id);
    void syncAllForScope(scope, "bootstrap", { connectionIds: [conn.id] });
    if (isNew) {
      console.log(
        `[connect] New mailbox ${conn.mailbox_email} queued for full sync`
      );
    }
  } else {
    const conn = await upsertMailConnection(session.user.id, provider, {
      mailbox_email: mailboxEmail.toLowerCase(),
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expiry: expiresAt,
      zoho_dc: provider === "zoho" ? getZohoDc() : null,
    });

    if (!conn) {
      return NextResponse.redirect(
        new URL(
          "/dashboard/settings?error=" +
            encodeURIComponent("Could not save mailbox connection"),
          request.url
        )
      );
    }

    void syncAllForUser(session.user.id, "bootstrap", {
      connectionIds: [conn.id],
    });
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/organization");

  const successUrl = new URL("/dashboard/settings", request.url);
  successUrl.searchParams.set("connected", provider);
  successUrl.searchParams.set("mailbox", mailboxEmail.toLowerCase());
  return NextResponse.redirect(successUrl);
}
