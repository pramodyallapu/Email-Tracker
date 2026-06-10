import { createAdminClient } from "@/lib/supabase/admin";
import type { MailConnection, MailProvider } from "@/types/mail";

export async function getOrgMailConnections(
  organizationId: string
): Promise<MailConnection[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mail_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .order("mailbox_email", { ascending: true });

  return (data ?? []) as MailConnection[];
}

export async function getMailConnections(
  userId: string
): Promise<MailConnection[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mail_connections")
    .select("*")
    .eq("user_id", userId);

  return (data ?? []) as MailConnection[];
}

export async function getMailConnectionByMailbox(
  mailboxEmail: string
): Promise<MailConnection | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mail_connections")
    .select("*")
    .ilike("mailbox_email", mailboxEmail)
    .maybeSingle();

  return (data as MailConnection | null) ?? null;
}

export async function upsertOrgMailConnection(
  organizationId: string,
  connectedByUserId: string,
  provider: MailProvider,
  payload: {
    mailbox_email: string;
    access_token: string | null;
    refresh_token: string | null;
    token_expiry: string | null;
    sync_cursor?: string | null;
    zoho_account_id?: string | null;
    zoho_dc?: string | null;
  }
): Promise<{ connection: MailConnection | null; error?: string }> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("mail_connections")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("mailbox_email", payload.mailbox_email)
    .maybeSingle();

  const row = {
    organization_id: organizationId,
    connected_by_user_id: connectedByUserId,
    user_id: null,
    provider,
    ...payload,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("mail_connections")
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      console.error("upsertOrgMailConnection update:", error.message);
      return { connection: null, error: error.message };
    }
    return { connection: data as MailConnection };
  }

  const { data, error } = await supabase
    .from("mail_connections")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.error("upsertOrgMailConnection insert:", error.message);
    return { connection: null, error: error.message };
  }

  return { connection: data as MailConnection };
}

/** Legacy personal mailbox connect (non-org users). */
export async function upsertMailConnection(
  userId: string,
  provider: MailProvider,
  payload: {
    mailbox_email: string;
    access_token: string | null;
    refresh_token: string | null;
    token_expiry: string | null;
    sync_cursor?: string | null;
    zoho_account_id?: string | null;
    zoho_dc?: string | null;
  }
): Promise<MailConnection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("mail_connections")
    .upsert(
      {
        user_id: userId,
        organization_id: null,
        provider,
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("upsertMailConnection:", error.message);
    return null;
  }

  return data as MailConnection;
}

/** Migrate legacy Gmail tokens from users table into mail_connections */
export async function ensureGoogleConnectionFromUser(
  userId: string
): Promise<MailConnection | null> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("mail_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .is("organization_id", null)
    .maybeSingle();

  if (existing?.access_token) return existing as MailConnection;

  const { data: user } = await supabase
    .from("users")
    .select("email, gmail_access_token, gmail_refresh_token, gmail_token_expiry, gmail_history_id")
    .eq("id", userId)
    .single();

  if (!user?.gmail_access_token) return (existing as MailConnection | null) ?? null;

  return upsertMailConnection(userId, "google", {
    mailbox_email: user.email,
    access_token: user.gmail_access_token,
    refresh_token: user.gmail_refresh_token,
    token_expiry: user.gmail_token_expiry,
    sync_cursor: user.gmail_history_id,
  });
}

export async function getOrgMailConnectionByProvider(
  organizationId: string,
  provider: MailProvider
): Promise<MailConnection | null> {
  const connections = await getOrgMailConnections(organizationId);
  return connections.find((c) => c.provider === provider) ?? null;
}

export async function deleteOrgMailConnection(
  organizationId: string,
  connectionId: string
): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mail_connections")
    .delete()
    .eq("id", connectionId)
    .eq("organization_id", organizationId);

  return !error;
}
