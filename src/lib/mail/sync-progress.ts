import { createAdminClient } from "@/lib/supabase/admin";
import type { MailConnection } from "@/types/mail";

export type ConnectionSyncStatus = "idle" | "running" | "error";

function isMissingColumnError(message: string): boolean {
  return (
    message.includes("sync_status") ||
    message.includes("sync_page_token") ||
    message.includes("sync_progress_synced") ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

export async function setConnectionsSyncStatus(
  connectionIds: string[],
  status: ConnectionSyncStatus
): Promise<void> {
  if (connectionIds.length === 0) return;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mail_connections")
    .update({
      sync_status: status,
      updated_at: new Date().toISOString(),
    })
    .in("id", connectionIds);

  if (error && !isMissingColumnError(error.message)) {
    console.error("setConnectionsSyncStatus:", error.message);
  }
}

/** Mark never-started mailboxes as running (does not wipe saved scan position). */
export async function startGapFillScan(
  connectionIds: string[]
): Promise<void> {
  if (connectionIds.length === 0) return;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("mail_connections")
    .update({
      sync_status: "running",
      updated_at: new Date().toISOString(),
    })
    .in("id", connectionIds);

  if (error) {
    console.error("startGapFillScan:", error.message);
  }
}

export async function resetFullSyncCursors(
  connectionIds: string[]
): Promise<void> {
  if (connectionIds.length === 0) return;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("mail_connections")
    .update({
      sync_page_token: null,
      sync_list_query: null,
      sync_status: "running",
      sync_progress_synced: 0,
      updated_at: new Date().toISOString(),
    })
    .in("id", connectionIds);

  if (error) {
    console.error("resetFullSyncCursors:", error.message);
    if (isMissingColumnError(error.message)) {
      await supabase
        .from("mail_connections")
        .update({ updated_at: new Date().toISOString() })
        .in("id", connectionIds);
    }
  }
}

export async function updateConnectionSyncProgress(
  connectionId: string,
  payload: {
    sync_page_token?: string | null;
    sync_list_query?: string | null;
    sync_status?: ConnectionSyncStatus;
    sync_progress_synced?: number;
    sync_cursor?: string | null;
  }
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mail_connections")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  if (error) {
    console.error("updateConnectionSyncProgress:", error.message);
  }
}

export async function isOrgSyncRunning(
  organizationId: string
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mail_connections")
    .select("id, sync_status, sync_page_token")
    .eq("organization_id", organizationId);

  return (data ?? []).some(
    (c) =>
      c.sync_status === "running" || Boolean(c.sync_page_token)
  );
}

export async function isUserSyncRunning(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mail_connections")
    .select("id, sync_status, sync_page_token")
    .eq("user_id", userId)
    .is("organization_id", null);

  return (data ?? []).some(
    (c) =>
      c.sync_status === "running" || Boolean(c.sync_page_token)
  );
}

export function shouldRunFullSyncBatch(
  conn: {
    sync_status?: string | null;
    sync_page_token?: string | null;
    sync_progress_synced?: number | null;
  },
  options?: { reset?: boolean }
): boolean {
  if (options?.reset) return true;
  if (conn.sync_status === "running") return true;
  if (conn.sync_page_token) return true;
  return false;
}

export function isFullSyncPending(conn: MailConnection): boolean {
  if (conn.provider !== "google") return false;
  return shouldRunFullSyncBatch(conn);
}

/** Fair round-robin: one mailbox batch per API request (avoids timeouts with 2+ mailboxes). */
export function pickNextFullSyncMailbox(
  connections: MailConnection[],
  options?: { reset?: boolean }
): MailConnection | null {
  const pending = connections.filter(
    (c) => c.provider === "google" && shouldRunFullSyncBatch(c, options)
  );
  if (pending.length === 0) return null;

  return pending.sort((a, b) => {
    const aToken = a.sync_page_token ? 0 : 1;
    const bToken = b.sync_page_token ? 0 : 1;
    if (aToken !== bToken) return aToken - bToken;
    const ta = new Date(a.updated_at ?? 0).getTime();
    const tb = new Date(b.updated_at ?? 0).getTime();
    return ta - tb;
  })[0];
}

export function hasAnyFullSyncPending(
  connections: MailConnection[],
  options?: { reset?: boolean }
): boolean {
  return connections.some(
    (c) => c.provider === "google" && shouldRunFullSyncBatch(c, options)
  );
}
