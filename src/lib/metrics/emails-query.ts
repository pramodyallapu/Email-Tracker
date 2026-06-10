import { createAdminClient } from "@/lib/supabase/admin";
import {
  scopeEmailsFilter,
  scopeThreadsFilter,
  type MailScope,
} from "@/lib/mail/scope";

const PAGE_SIZE = 1000;

type EmailRow = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmailQuery = any;

/** Supabase returns max 1000 rows per request — paginate to load all. */
export async function fetchEmailsPaginated(
  scope: MailScope,
  options: {
    since?: string;
    select: string;
    extraFilters?: (query: EmailQuery) => EmailQuery;
    orderAsc?: boolean;
  }
): Promise<EmailRow[]> {
  const supabase = createAdminClient();
  const all: EmailRow[] = [];
  let from = 0;

  while (true) {
    let query = supabase.from("emails").select(options.select);
    query = scopeEmailsFilter(query, scope);

    if (options.since) {
      query = query.gte("received_at", options.since);
    }

    if (options.extraFilters) {
      query = options.extraFilters(query) as typeof query;
    }

    query = query
      .order("received_at", { ascending: options.orderAsc ?? true })
      .range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) {
      console.error("fetchEmailsPaginated:", error.message);
      break;
    }

    const batch = (data ?? []) as unknown as EmailRow[];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

/** Load every email in one thread (paginated for very long threads). */
export async function fetchThreadEmails(
  scope: MailScope,
  provider: string,
  gmailThreadId: string,
  select: string
): Promise<EmailRow[]> {
  return fetchEmailsPaginated(scope, {
    select,
    extraFilters: (query) =>
      query
        .eq("provider", provider)
        .eq("gmail_thread_id", gmailThreadId),
    orderAsc: true,
  });
}

/** Supabase caps rows per request — paginate to load all threads. */
export async function fetchThreadsPaginated(
  scope: MailScope,
  options: {
    select: string;
    archived?: boolean;
  }
): Promise<EmailRow[]> {
  const supabase = createAdminClient();
  const all: EmailRow[] = [];
  let from = 0;

  while (true) {
    let query = supabase.from("threads").select(options.select);
    query = scopeThreadsFilter(query, scope);

    if (options.archived === false) {
      query = query.eq("is_archived", false);
    }

    query = query
      .order("last_message_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) {
      console.error("fetchThreadsPaginated:", error.message);
      break;
    }

    const batch = (data ?? []) as unknown as EmailRow[];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}
