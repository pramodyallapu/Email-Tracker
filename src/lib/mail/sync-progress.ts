import { fetchGmailProfileStats } from "@/lib/gmail/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MailConnection } from "@/types/mail";

export type ConnectionSyncStatus = "idle" | "running" | "error";

const COMPLETE_TOLERANCE = 5;

function isMissingColumnError(message: string): boolean {
  return (
    message.includes("sync_status") ||
    message.includes("sync_page_token") ||
    message.includes("sync_progress_synced") ||
    message.includes("sync_gmail_total") ||
    message.includes("sync_list_query") ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

export function isMailboxFullSyncComplete(conn: MailConnection): boolean {
  const synced = conn.sync_progress_synced ?? 0;
  const total = conn.sync_gmail_total;
  if (total != null && total > 0) {
    return synced >= total - COMPLETE_TOLERANCE;
  }
  return false;
}

export function remainingSyncMessages(conn: MailConnection): number {
  if (isMailboxFullSyncComplete(conn)) return Number.MAX_SAFE_INTEGER;
  const total = conn.sync_gmail_total;
  const synced = conn.sync_progress_synced ?? 0;
  if (total != null && total > 0) {
    return Math.max(0, total - synced);
  }
  return synced === 0 ? 0 : Number.MAX_SAFE_INTEGER - 1;
}

/** New mailbox: queue for full sync with a clean scan cursor. */
export async function initializeMailboxForFullSync(
  connectionId: string
): Promise<void> {
  await updateConnectionSyncProgress(connectionId, {
    sync_page_token: null,
    sync_list_query: null,
    sync_status: "running",
    sync_progress_synced: 0,
    sync_gmail_total: null,
  });
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
      sync_gmail_total: null,
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

export async function finalizeFullSyncComplete(
  connectionId: string,
  messagesTotal: number
): Promise<void> {
  await updateConnectionSyncProgress(connectionId, {
    sync_page_token: null,
    sync_list_query: null,
    sync_status: "idle",
    sync_gmail_total: messagesTotal,
  });
}

/** Clear stuck page tokens when DB count already meets Gmail total. */
export async function reconcileFullSyncCompletion(
  connections: MailConnection[]
): Promise<void> {
  const supabase = createAdminClient();

  for (const conn of connections) {
    if (conn.provider !== "google") continue;
    if (!conn.sync_page_token && conn.sync_status !== "running") continue;

    let messagesTotal = conn.sync_gmail_total ?? null;
    let synced = conn.sync_progress_synced ?? 0;

    if (messagesTotal == null) {
      const profile = await fetchGmailProfileStats(conn);
      messagesTotal = profile?.messagesTotal ?? null;
    }

    if (synced === 0) {
      const { count } = await supabase
        .from("emails")
        .select("*", { count: "exact", head: true })
        .eq("mail_connection_id", conn.id);
      synced = count ?? 0;
    }

    if (
      messagesTotal != null &&
      messagesTotal > 0 &&
      synced >= messagesTotal - COMPLETE_TOLERANCE
    ) {
      console.log(
        `[sync:${conn.mailbox_email}] complete synced=${synced} gmail=${messagesTotal} — clearing scan cursor`
      );
      await finalizeFullSyncComplete(conn.id, messagesTotal);
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
    sync_gmail_total?: number | null;
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
  conn: MailConnection,
  options?: { reset?: boolean }
): boolean {
  if (options?.reset) return true;
  if (isMailboxFullSyncComplete(conn)) return false;
  if (conn.sync_status === "running") return true;
  if (conn.sync_page_token) return true;
  return false;
}

export function isFullSyncPending(conn: MailConnection): boolean {
  if (conn.provider !== "google") return false;
  return shouldRunFullSyncBatch(conn);
}

/** Finish small / nearly-done mailboxes first; then large backlogs. */
export function pickNextFullSyncMailbox(
  connections: MailConnection[],
  options?: { reset?: boolean }
): MailConnection | null {
  const pending = connections.filter(
    (c) => c.provider === "google" && shouldRunFullSyncBatch(c, options)
  );
  if (pending.length === 0) return null;

  return pending.sort((a, b) => {
    const aRem = remainingSyncMessages(a);
    const bRem = remainingSyncMessages(b);
    if (aRem !== bRem) return aRem - bRem;
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
