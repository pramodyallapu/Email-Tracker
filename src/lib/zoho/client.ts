import { createAdminClient } from "@/lib/supabase/admin";
import type { MailConnection } from "@/types/mail";
import { getZohoDc, zohoAccountsHost, zohoMailHost } from "@/lib/zoho/config";

export async function refreshZohoToken(
  connection: MailConnection
): Promise<string> {
  if (!connection.refresh_token) {
    throw new Error("No Zoho refresh token");
  }

  const dc = connection.zoho_dc ?? getZohoDc();
  const expiry = connection.token_expiry
    ? new Date(connection.token_expiry).getTime()
    : 0;

  if (connection.access_token && expiry > Date.now() + 60_000) {
    return connection.access_token;
  }

  const response = await fetch(`${zohoAccountsHost(dc)}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: connection.refresh_token,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error ?? "Zoho token refresh failed");
  }

  const expiresAt = new Date(
    Date.now() + (data.expires_in ?? 3600) * 1000
  ).toISOString();

  const supabase = createAdminClient();
  await supabase
    .from("mail_connections")
    .update({
      access_token: data.access_token,
      token_expiry: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return data.access_token;
}

export async function zohoApiGet<T>(
  connection: MailConnection,
  path: string
): Promise<T> {
  const token = await refreshZohoToken(connection);
  const dc = connection.zoho_dc ?? getZohoDc();
  const res = await fetch(`${zohoMailHost(dc)}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Zoho-oauthtoken ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function getZohoAccountId(
  connection: MailConnection
): Promise<string> {
  if (connection.zoho_account_id) return connection.zoho_account_id;

  const data = await zohoApiGet<{
    data?: { accountId?: string; emailAddress?: string }[];
  }>(connection, "/api/accounts");

  const account = data.data?.[0];
  if (!account?.accountId) {
    throw new Error("No Zoho Mail account found");
  }

  const supabase = createAdminClient();
  await supabase
    .from("mail_connections")
    .update({
      zoho_account_id: account.accountId,
      mailbox_email: account.emailAddress ?? connection.mailbox_email,
    })
    .eq("id", connection.id);

  return account.accountId;
}

export interface ZohoFolder {
  folderId: string;
  folderName: string;
  folderType?: string;
}

const SKIP_ZOHO_FOLDERS = new Set(["Drafts", "Templates", "Outbox"]);

export async function getZohoFolders(
  connection: MailConnection
): Promise<ZohoFolder[]> {
  const accountId = await getZohoAccountId(connection);
  const data = await zohoApiGet<{ data?: ZohoFolder[] }>(
    connection,
    `/api/accounts/${accountId}/folders`
  );

  return (data.data ?? []).filter(
    (f) => f.folderId && !SKIP_ZOHO_FOLDERS.has(f.folderName)
  );
}
