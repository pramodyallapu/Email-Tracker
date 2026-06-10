import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MailConnection } from "@/types/mail";

export async function getGmailClient(connection: MailConnection) {
  if (!connection.access_token && !connection.refresh_token) {
    throw new Error("Gmail credentials not found for connection");
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2.setCredentials({
    access_token: connection.access_token ?? undefined,
    refresh_token: connection.refresh_token ?? undefined,
  });

  return google.gmail({ version: "v1", auth: oauth2 });
}

export async function refreshConnectionToken(
  connection: MailConnection
): Promise<string> {
  if (!connection.refresh_token) {
    throw new Error("No refresh token available");
  }

  const expiry = connection.token_expiry
    ? new Date(connection.token_expiry).getTime()
    : 0;

  if (connection.access_token && expiry > Date.now() + 60_000) {
    return connection.access_token;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    }),
  });

  const refreshed = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!refreshed.access_token) {
    throw new Error("Failed to refresh Gmail token");
  }

  const expiresAt = new Date(
    Date.now() + (refreshed.expires_in ?? 3600) * 1000
  ).toISOString();

  const supabase = createAdminClient();
  await supabase
    .from("mail_connections")
    .update({
      access_token: refreshed.access_token,
      token_expiry: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return refreshed.access_token;
}
