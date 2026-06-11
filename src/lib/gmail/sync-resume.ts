import { createAdminClient } from "@/lib/supabase/admin";
import { scopeEmailsFilter, type MailScope } from "@/lib/mail/scope";
import type { MailConnection } from "@/types/mail";

export const DEFAULT_GMAIL_LIST_QUERY = "in:anywhere";

/** Gmail search date: yyyy/m/d (UTC). */
export function gmailBeforeDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}/${m}/${day}`;
}

export async function getOldestSyncedReceivedAt(
  scope: MailScope,
  connectionId: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("emails")
    .select("received_at")
    .eq("provider", "google")
    .eq("mail_connection_id", connectionId)
    .order("received_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getOldestSyncedReceivedAt:", error.message);
    return null;
  }

  return data?.received_at ?? null;
}

export function buildFrontierListQuery(oldestReceivedAt: string): string {
  return `${DEFAULT_GMAIL_LIST_QUERY} before:${gmailBeforeDate(oldestReceivedAt)}`;
}

export type GmailListResume = {
  listQuery: string;
  pageToken: string | undefined;
  resumedFrom: "page_token" | "frontier" | "start";
};

/**
 * Resume Gmail list scan from last saved page, or jump to mail older than
 * the oldest synced message — never re-walk from the newest mail.
 */
export async function resolveGmailListResume(
  scope: MailScope,
  connection: MailConnection,
  options: { syncedInDb: number; messagesTotal: number }
): Promise<GmailListResume> {
  const savedQuery = connection.sync_list_query ?? DEFAULT_GMAIL_LIST_QUERY;
  const savedToken = connection.sync_page_token ?? undefined;

  if (savedToken) {
    return {
      listQuery: savedQuery,
      pageToken: savedToken,
      resumedFrom: "page_token",
    };
  }

  const incomplete =
    options.messagesTotal > 0 &&
    options.syncedInDb > 0 &&
    options.syncedInDb < options.messagesTotal - 5;

  if (incomplete) {
    const oldest = await getOldestSyncedReceivedAt(scope, connection.id);
    if (oldest) {
      const frontierQuery = buildFrontierListQuery(oldest);
      return {
        listQuery: frontierQuery,
        pageToken: undefined,
        resumedFrom: "frontier",
      };
    }
  }

  return {
    listQuery: DEFAULT_GMAIL_LIST_QUERY,
    pageToken: undefined,
    resumedFrom: "start",
  };
}
