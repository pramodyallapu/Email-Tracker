import {
  ensureGoogleConnectionFromUser,
  getMailConnections,
  getOrgMailConnections,
} from "@/lib/mail/connections";
import { bootstrapGmailConnection } from "@/lib/gmail/bootstrap";
import { fullGmailSyncBatch } from "@/lib/gmail/sync-batch";
import { incrementalSync as incrementalGmailSync } from "@/lib/gmail/incremental";
import { syncRecentInbox } from "@/lib/gmail/recent-sync";
import { rebuildThreadStats } from "@/lib/mail/rebuild-threads";
import {
  hasAnyFullSyncPending,
  isMailboxFullSyncComplete,
  pickNextFullSyncMailbox,
  reconcileFullSyncCompletion,
  resetFullSyncCursors,
  setConnectionsSyncStatus,
  shouldRunFullSyncBatch,
  startGapFillScan,
} from "@/lib/mail/sync-progress";
import { getOrgOwnerUserId } from "@/lib/org/context";
import { resolveMailScope, type MailScope } from "@/lib/mail/scope";
import { fullZohoSync } from "@/lib/zoho/sync";

export type SyncMode = "bootstrap" | "quick" | "full";

export type MailboxSyncResult = {
  email: string;
  provider: string;
  newSynced: number;
  errors: number;
  hasMore?: boolean;
  skipped?: string;
};

export type SyncRunResult = {
  synced: number;
  errors: number;
  total: number;
  hasMore: boolean;
  mailboxes: MailboxSyncResult[];
};

export type SyncOptions = {
  reset?: boolean;
};

async function reloadConnections(
  scope: MailScope
): Promise<Awaited<ReturnType<typeof getOrgMailConnections>>> {
  if (scope.mode === "organization") {
    return getOrgMailConnections(scope.organizationId);
  }
  return getMailConnections(scope.userId);
}

async function syncConnections(
  scope: MailScope,
  connections: Awaited<ReturnType<typeof getOrgMailConnections>>,
  mode: SyncMode,
  options?: SyncOptions
): Promise<SyncRunResult> {
  let synced = 0;
  let errors = 0;
  let total = 0;
  let hasMore = false;
  const mailboxes: MailboxSyncResult[] = [];

  let active = connections.filter((c) => c.access_token || c.refresh_token);
  const activeIds = active.map((c) => c.id);

  if (mode === "full") {
    if (options?.reset) {
      await resetFullSyncCursors(activeIds);
    } else {
      const googleConns = active.filter((c) => c.provider === "google");
      await reconcileFullSyncCompletion(googleConns);

      const neverStarted = googleConns
        .filter(
          (c) =>
            (c.sync_progress_synced ?? 0) === 0 &&
            !isMailboxFullSyncComplete(c)
        )
        .map((c) => c.id);
      const resumeIds = googleConns
        .filter(
          (c) =>
            !isMailboxFullSyncComplete(c) &&
            (c.sync_progress_synced ?? 0) > 0 &&
            c.sync_status !== "running"
        )
        .map((c) => c.id);

      if (neverStarted.length > 0) {
        await startGapFillScan(neverStarted);
      }
      if (resumeIds.length > 0) {
        await setConnectionsSyncStatus(resumeIds, "running");
      }
    }
    active = (await reloadConnections(scope)).filter(
      (c) => c.access_token || c.refresh_token
    );
  }

  const nextFullSyncMailbox =
    mode === "full" ? pickNextFullSyncMailbox(active, options) : null;

  for (const conn of active) {
    let mailboxSynced = 0;
    let mailboxErrors = 0;
    let mailboxHasMore = false;
    let skipped: string | undefined;

    try {
      if (conn.provider === "google") {
        if (mode === "full") {
          if (!shouldRunFullSyncBatch(conn, options)) {
            skipped = "Gmail sync complete for this mailbox";
          } else if (conn.id !== nextFullSyncMailbox?.id) {
            skipped = "Queued — syncing other mailboxes in parallel rotation";
            mailboxHasMore = true;
            hasMore = true;
          } else {
            const result = await fullGmailSyncBatch(scope, conn);
            mailboxSynced = result.synced;
            mailboxErrors = result.errors;
            mailboxHasMore = result.hasMore;
            total += result.total;
            if (result.hasMore) hasMore = true;
          }
        } else if (mode === "bootstrap") {
          const result = await bootstrapGmailConnection(scope, conn);
          mailboxSynced = result.recentSynced;
          mailboxErrors = result.recentErrors;
          total += result.profile.messagesTotal;
        } else {
          const incremental = await incrementalGmailSync(scope, conn);
          const recent = await syncRecentInbox(scope, conn, {
            maxMessages: 50,
            newerThanDays: 14,
          });
          mailboxSynced = incremental.synced + recent.synced;
          mailboxErrors = recent.errors;
          total += mailboxSynced;
        }
      } else if (conn.provider === "zoho") {
        if (mode === "full" && !hasMore) {
          const result = await fullZohoSync(scope, conn);
          mailboxSynced = result.synced;
          mailboxErrors = result.errors;
          total += result.total;
          await setConnectionsSyncStatus([conn.id], "idle");
        } else if (mode === "full" && hasMore) {
          skipped = "Waiting for Gmail sync to finish…";
        } else {
          skipped = "Zoho syncs on Full sync only (entire Zoho history)";
        }
      }

      synced += mailboxSynced;
      errors += mailboxErrors;
      mailboxes.push({
        email: conn.mailbox_email,
        provider: conn.provider,
        newSynced: mailboxSynced,
        errors: mailboxErrors,
        hasMore: mailboxHasMore,
        skipped,
      });
    } catch (err) {
      console.error(`Sync failed for ${conn.mailbox_email}:`, err);
      errors += 1;
      await setConnectionsSyncStatus([conn.id], "error");
      mailboxes.push({
        email: conn.mailbox_email,
        provider: conn.provider,
        newSynced: 0,
        errors: 1,
        skipped: err instanceof Error ? err.message : "Sync failed",
      });
    }
  }

  if (mode === "full") {
    const reloaded = (await reloadConnections(scope)).filter(
      (c) => c.access_token || c.refresh_token
    );
    hasMore = hasAnyFullSyncPending(reloaded, { reset: false });

    const completeIds = reloaded
      .filter(
        (c) => c.provider === "google" && isMailboxFullSyncComplete(c)
      )
      .map((c) => c.id);

    if (completeIds.length > 0) {
      await setConnectionsSyncStatus(completeIds, "idle");
    }

    if (!hasMore) {
      await setConnectionsSyncStatus(
        reloaded.map((c) => c.id),
        "idle"
      );
    }
  }

  // Defer full thread rebuild until every mailbox finishes (146k+ rows).
  const shouldRebuildThreads =
    mode === "bootstrap" ||
    mode === "quick" ||
    (mode === "full" && !hasMore);

  if (shouldRebuildThreads) {
    await rebuildThreadStats(scope);
  }

  return { synced, errors, total, hasMore, mailboxes };
}

export async function syncAllForScope(
  scope: MailScope,
  mode: SyncMode = "quick",
  options?: SyncOptions
): Promise<SyncRunResult> {
  if (scope.mode === "organization") {
    const connections = await getOrgMailConnections(scope.organizationId);
    return syncConnections(scope, connections, mode, options);
  }

  await ensureGoogleConnectionFromUser(scope.userId);
  const connections = await getMailConnections(scope.userId);
  return syncConnections(scope, connections, mode, options);
}

export async function syncAllForUser(
  userId: string,
  mode: SyncMode = "quick",
  options?: SyncOptions
): Promise<SyncRunResult> {
  const scope = await resolveMailScope(userId);
  return syncAllForScope(scope, mode, options);
}

export async function syncAllOrganizations(
  mode: SyncMode = "quick"
): Promise<{ processed: number; synced: number; errors: string[] }> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const { data: orgConnections } = await supabase
    .from("mail_connections")
    .select("organization_id")
    .not("organization_id", "is", null)
    .not("refresh_token", "is", null);

  const orgIds = Array.from(
    new Set((orgConnections ?? []).map((c) => c.organization_id).filter(Boolean))
  ) as string[];

  const { data: personalConnections } = await supabase
    .from("mail_connections")
    .select("user_id")
    .is("organization_id", null)
    .not("refresh_token", "is", null);

  const userIds = Array.from(
    new Set((personalConnections ?? []).map((c) => c.user_id).filter(Boolean))
  ) as string[];

  let synced = 0;
  const errors: string[] = [];

  for (const organizationId of orgIds) {
    try {
      const connections = await getOrgMailConnections(organizationId);
      const actorUserId =
        connections.find((c) => c.connected_by_user_id)?.connected_by_user_id ??
        (await getOrgOwnerUserId(organizationId)) ??
        "";
      const scope: MailScope = {
        mode: "organization",
        organizationId,
        userId: actorUserId,
      };
      const result = await syncAllForScope(scope, mode);
      synced += result.synced;
    } catch (err) {
      errors.push(
        `org:${organizationId}: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  for (const userId of userIds) {
    try {
      const result = await syncAllForUser(userId, mode);
      synced += result.synced;
    } catch (err) {
      errors.push(
        `user:${userId}: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  return { processed: orgIds.length + userIds.length, synced, errors };
}
