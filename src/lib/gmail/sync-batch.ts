import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailClient, refreshConnectionToken } from "@/lib/gmail/client";
import {
  bulkUpsertParsedEmails,
  fetchGmailMetadataBatch,
} from "@/lib/gmail/metadata-sync";
import {
  buildFrontierListQuery,
  DEFAULT_GMAIL_LIST_QUERY,
  getOldestSyncedReceivedAt,
  resolveGmailListResume,
} from "@/lib/gmail/sync-resume";
import { scopeEmailsFilter, type MailScope } from "@/lib/mail/scope";
import {
  finalizeFullSyncComplete,
  syncCompleteTolerance,
  updateConnectionSyncProgress,
} from "@/lib/mail/sync-progress";
import type { MailConnection } from "@/types/mail";

/** Max Gmail metadata fetches per API request (metadata only — no body). */
export const GMAIL_FETCH_BATCH_SIZE = 200;

/** Max IDs to scan when skipping already-synced mail on the same list page. */
export const GMAIL_FAST_SCAN_BATCH_SIZE = 3000;

/** Max IDs to scan before stopping once we have metadata to fetch. */
export const GMAIL_SCAN_BATCH_SIZE = 2000;

async function countSyncedForConnection(
  connectionId: string
): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("emails")
    .select("*", { count: "exact", head: true })
    .eq("mail_connection_id", connectionId);

  if (error) {
    console.error("countSyncedForConnection:", error.message);
    return 0;
  }
  return count ?? 0;
}

async function existingMessageIds(
  scope: MailScope,
  connectionId: string,
  gmailMessageIds: string[],
  multiMailboxOrg: boolean
): Promise<Set<string>> {
  if (gmailMessageIds.length === 0) return new Set();

  const supabase = createAdminClient();
  let query = supabase
    .from("emails")
    .select("gmail_message_id")
    .eq("provider", "google")
    .in("gmail_message_id", gmailMessageIds);
  query = scopeEmailsFilter(query, scope);

  if (multiMailboxOrg) {
    query = query.eq("mail_connection_id", connectionId);
  } else {
    query = query.or(
      `mail_connection_id.eq.${connectionId},mail_connection_id.is.null`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("existingMessageIds:", error.message);
    return new Set();
  }

  return new Set((data ?? []).map((r) => r.gmail_message_id));
}

export async function fullGmailSyncBatch(
  scope: MailScope,
  connection: MailConnection
): Promise<{
  synced: number;
  scanned: number;
  errors: number;
  hasMore: boolean;
  total: number;
}> {
  await refreshConnectionToken(connection);
  const gmail = await getGmailClient(connection);
  const mailboxEmails = [connection.mailbox_email.toLowerCase()];

  const profileRes = await gmail.users.getProfile({ userId: "me" });
  const historyId = profileRes.data.historyId ?? undefined;
  const messagesTotal = profileRes.data.messagesTotal ?? 0;

  const syncedBefore = await countSyncedForConnection(connection.id);
  let multiMailboxOrg = false;
  if (scope.mode === "organization") {
    const { count } = await createAdminClient()
      .from("mail_connections")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", scope.organizationId)
      .eq("provider", "google");
    multiMailboxOrg = (count ?? 0) > 1;
  }
  const resume = await resolveGmailListResume(scope, connection, {
    syncedInDb: syncedBefore,
    messagesTotal,
  });

  const listQuery = resume.listQuery;
  let pageToken: string | undefined = resume.pageToken;

  if (resume.resumedFrom === "page_token") {
    console.log(
      `[sync:${connection.mailbox_email}] resume=page_token query="${listQuery}"`
    );
  } else if (resume.resumedFrom === "frontier") {
    console.log(
      `[sync:${connection.mailbox_email}] resume=frontier query="${listQuery}" (older than last synced mail)`
    );
  }

  let synced = 0;
  let errors = 0;
  let scanned = 0;
  let lastUpsertError: string | null = null;
  const toFetch: string[] = [];
  const scanLimit = () =>
    resume.resumedFrom === "page_token"
      ? GMAIL_SCAN_BATCH_SIZE
      : toFetch.length > 0
        ? GMAIL_SCAN_BATCH_SIZE
        : GMAIL_FAST_SCAN_BATCH_SIZE;

  while (scanned < scanLimit() && toFetch.length < GMAIL_FETCH_BATCH_SIZE) {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: Math.min(100, scanLimit() - scanned),
      pageToken,
      includeSpamTrash: true,
      q: listQuery,
    });

    const messageIds = listRes.data.messages ?? [];
    pageToken = listRes.data.nextPageToken ?? undefined;

    if (messageIds.length === 0) break;

    const ids = messageIds
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id));
    const alreadySynced = await existingMessageIds(
      scope,
      connection.id,
      ids,
      multiMailboxOrg
    );

    for (const msgId of ids) {
      if (scanned >= scanLimit()) break;
      if (toFetch.length >= GMAIL_FETCH_BATCH_SIZE) break;

      scanned += 1;
      if (!alreadySynced.has(msgId)) {
        toFetch.push(msgId);
      }
    }

    if (!pageToken) break;
    if (toFetch.length >= GMAIL_FETCH_BATCH_SIZE) break;
  }

  if (toFetch.length > 0) {
    const { parsed, errors: fetchErrors } = await fetchGmailMetadataBatch(
      gmail,
      toFetch,
      mailboxEmails
    );
    errors += fetchErrors;

    const upsert = await bulkUpsertParsedEmails(
      scope,
      connection.id,
      parsed
    );
    synced = upsert.synced;
    errors += upsert.errors;
    lastUpsertError = upsert.firstError;

    if (upsert.firstError) {
      console.error(
        `Gmail upsert failed for ${connection.mailbox_email}:`,
        upsert.firstError
      );
    }
  }

  const totalInDb = await countSyncedForConnection(connection.id);
  const tolerance = syncCompleteTolerance(messagesTotal);
  const listHasMore = Boolean(pageToken);
  const countComplete =
    messagesTotal > 0 && totalInDb >= messagesTotal - tolerance;
  const countIncomplete =
    messagesTotal > 0 && totalInDb < messagesTotal - tolerance;
  const frontierExhausted =
    listQuery.includes("before:") &&
    toFetch.length === 0 &&
    scanned > 0 &&
    !listHasMore;
  const hasMore = countComplete
    ? false
    : listHasMore || countIncomplete;
  const effectivelyComplete = countComplete || !hasMore;

  let nextListQuery: string | null = listQuery;
  let nextPageToken: string | null = null;

  if (countComplete) {
    await finalizeFullSyncComplete(connection.id, messagesTotal);
    nextListQuery = null;
    nextPageToken = null;
  } else if (frontierExhausted) {
    const gap = messagesTotal - totalInDb;
    if (gap <= tolerance) {
      console.log(
        `[sync:${connection.mailbox_email}] frontier exhausted gap=${gap} — marking complete`
      );
      await finalizeFullSyncComplete(connection.id, messagesTotal);
      nextListQuery = null;
      nextPageToken = null;
    } else {
      console.log(
        `[sync:${connection.mailbox_email}] frontier exhausted gap=${gap} — gap-fill from newest`
      );
      nextListQuery = DEFAULT_GMAIL_LIST_QUERY;
      nextPageToken = null;
    }
  } else if (effectivelyComplete) {
    nextListQuery = null;
    nextPageToken = null;
  } else if (listHasMore) {
    nextListQuery = listQuery;
    nextPageToken = pageToken!;
  } else if (countIncomplete) {
    const oldest = await getOldestSyncedReceivedAt(scope, connection.id);
    if (oldest) {
      nextListQuery = buildFrontierListQuery(oldest);
      nextPageToken = null;
    } else {
      nextListQuery = DEFAULT_GMAIL_LIST_QUERY;
      nextPageToken = null;
    }
  }

  const finalizedThisBatch =
    countComplete ||
    (frontierExhausted && messagesTotal - totalInDb <= tolerance);

  if (!finalizedThisBatch) {
    await updateConnectionSyncProgress(connection.id, {
      sync_page_token: nextPageToken,
      sync_list_query: nextListQuery,
      sync_cursor:
        effectivelyComplete && historyId ? historyId : connection.sync_cursor,
      sync_status: hasMore ? "running" : "idle",
      sync_progress_synced: totalInDb,
      sync_gmail_total: messagesTotal,
    });
  }

  if (synced === 0 && errors > 0 && lastUpsertError) {
    console.error(
      `Batch for ${connection.mailbox_email}: 0 synced, ${errors} errors. First error: ${lastUpsertError}`
    );
  }

  if (synced > 0) {
    console.log(
      `[sync:${connection.mailbox_email}] new=${synced} scanned=${scanned} db=${totalInDb} gmail=${messagesTotal} hasMore=${hasMore}`
    );
  }

  return {
    synced,
    scanned,
    errors,
    hasMore,
    total: totalInDb,
  };
}

/** True if this connection still has pages left from a full sync. */
export function connectionNeedsFullSyncBatch(
  connection: MailConnection
): boolean {
  return Boolean(connection.sync_page_token);
}
