import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyThreadAudience,
  getEmailsForThread,
  type ThreadEmail,
} from "@/lib/mail/classify-audience";
import type { AudienceType } from "@/lib/mail/internal";
import { getInternalDomains } from "@/lib/mail/internal-domains";
import { getMailboxEmails } from "@/lib/mail/mailboxes";
import {
  resolveMailScope,
  scopeEmailsFilter,
  scopeThreadsFilter,
} from "@/lib/mail/scope";
import type { ThreadSummary } from "@/types/email";
import { threadRowToSummary } from "@/lib/metrics/reply-time";

export type AudienceBucket = {
  replied: number;
  notReplied: number;
  delayed: number;
  total: number;
};

export type AudienceStats = {
  internal: AudienceBucket;
  external: AudienceBucket;
  domainsConfigured: number;
};

function emptyBucket(): AudienceBucket {
  return { replied: 0, notReplied: 0, delayed: 0, total: 0 };
}

function tallyThread(
  thread: ThreadSummary,
  audience: AudienceType,
  stats: AudienceStats
) {
  const bucket = stats[audience];
  bucket.total += 1;

  if (thread.isReplied) {
    bucket.replied += 1;
    return;
  }

  if (thread.slaStatus === "breach") {
    bucket.delayed += 1;
    return;
  }

  bucket.notReplied += 1;
}

function indexEmailsByThread(emails: ThreadEmail[]) {
  const byProviderKey = new Map<string, ThreadEmail[]>();
  for (const e of emails) {
    const key = `${e.provider ?? "google"}:${e.gmail_thread_id}`;
    const list = byProviderKey.get(key) ?? [];
    list.push(e);
    byProviderKey.set(key, list);
  }
  return byProviderKey;
}

async function loadAudienceContext(userId: string) {
  const scope = await resolveMailScope(userId);
  const supabase = createAdminClient();
  const [internalDomains, mailboxEmails] = await Promise.all([
    getInternalDomains(userId),
    getMailboxEmails(scope),
  ]);

  let threadsQuery = supabase
    .from("threads")
    .select("id, provider, gmail_thread_id, participants")
    .eq("is_archived", false);
  threadsQuery = scopeThreadsFilter(threadsQuery, scope);

  let emailsQuery = supabase.from("emails").select(
    "provider, gmail_thread_id, from_address, to_addresses, cc_addresses, is_sent, labels, received_at"
  );
  emailsQuery = scopeEmailsFilter(emailsQuery, scope);

  const [threadsRes, emailsRes] = await Promise.all([
    threadsQuery,
    emailsQuery,
  ]);

  const emails = (emailsRes.data ?? []) as ThreadEmail[];
  const byProviderKey = indexEmailsByThread(emails);

  return {
    internalDomains,
    mailboxEmails,
    threads: threadsRes.data ?? [],
    emails,
    byProviderKey,
  };
}

export async function getThreadAudienceMap(
  userId: string
): Promise<Record<string, AudienceType>> {
  const ctx = await loadAudienceContext(userId);
  const map: Record<string, AudienceType> = {};

  for (const row of ctx.threads) {
    const threadEmails = getEmailsForThread(row, ctx.emails, ctx.byProviderKey);
    map[row.id] = classifyThreadAudience(
      threadEmails,
      row.participants,
      ctx.mailboxEmails,
      ctx.internalDomains
    );
  }

  return map;
}

export const getAudienceStats = cache(
  async (userId: string, thresholdHours = 24): Promise<AudienceStats> => {
    const scope = await resolveMailScope(userId);
    const supabase = createAdminClient();
    const ctx = await loadAudienceContext(userId);

    const stats: AudienceStats = {
      internal: emptyBucket(),
      external: emptyBucket(),
      domainsConfigured: ctx.internalDomains.length,
    };

    let threadsQuery = supabase.from("threads").select("*").eq("is_archived", false);
    threadsQuery = scopeThreadsFilter(threadsQuery, scope);
    const { data: fullThreads } = await threadsQuery;

    for (const row of fullThreads ?? []) {
      const threadEmails = getEmailsForThread(
        row,
        ctx.emails,
        ctx.byProviderKey
      );
      const audience = classifyThreadAudience(
        threadEmails,
        row.participants,
        ctx.mailboxEmails,
        ctx.internalDomains
      );
      const summary = threadRowToSummary(row, thresholdHours);
      tallyThread(summary, audience, stats);
    }

    return stats;
  }
);
