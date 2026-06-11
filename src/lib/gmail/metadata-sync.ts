import type { gmail_v1 } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMessage } from "@/lib/gmail/parser";
import { toEmailInsert } from "@/lib/mail/parser";
import { emailUpsertConflict, type MailScope } from "@/lib/mail/scope";
import type { ParsedEmail } from "@/types/email";

/** Headers only — no body or attachments (Gmail format=metadata). */
export const GMAIL_METADATA_HEADERS = [
  "From",
  "To",
  "Subject",
  "Date",
  "References",
  "In-Reply-To",
];

export const GMAIL_FETCH_CONCURRENCY = 20;
export const DB_UPSERT_CHUNK = 100;

export async function fetchGmailMetadata(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<gmail_v1.Schema$Message | null> {
  const detail = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: GMAIL_METADATA_HEADERS,
  });
  return detail.data;
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/** Fetch metadata for many messages in parallel (no body/attachments). */
export async function fetchGmailMetadataBatch(
  gmail: gmail_v1.Gmail,
  messageIds: string[],
  mailboxEmails: string[],
  concurrency = GMAIL_FETCH_CONCURRENCY
): Promise<{ parsed: ParsedEmail[]; errors: number }> {
  const raw = await mapConcurrent(messageIds, concurrency, async (id) => {
    try {
      return await fetchGmailMetadata(gmail, id);
    } catch {
      return null;
    }
  });

  const parsed: ParsedEmail[] = [];
  let errors = 0;

  for (const msg of raw) {
    if (!msg) {
      errors += 1;
      continue;
    }
    const row = parseMessage(msg, mailboxEmails);
    if (!row) {
      errors += 1;
      continue;
    }
    parsed.push(row);
  }

  return { parsed, errors };
}

export async function bulkUpsertParsedEmails(
  scope: MailScope,
  connectionId: string,
  parsed: ParsedEmail[]
): Promise<{ synced: number; errors: number; firstError: string | null }> {
  if (parsed.length === 0) {
    return { synced: 0, errors: 0, firstError: null };
  }

  const supabase = createAdminClient();
  const conflict = emailUpsertConflict(scope);
  let synced = 0;
  let errors = 0;
  let firstError: string | null = null;

  for (let i = 0; i < parsed.length; i += DB_UPSERT_CHUNK) {
    const chunk = parsed.slice(i, i + DB_UPSERT_CHUNK);
    const rows = chunk.map((p) =>
      toEmailInsert(p, scope, "google", connectionId)
    );

    const { error } = await supabase.from("emails").upsert(rows, {
      onConflict: conflict,
    });

    if (error) {
      errors += chunk.length;
      if (!firstError) firstError = error.message;
    } else {
      synced += chunk.length;
    }
  }

  return { synced, errors, firstError };
}
