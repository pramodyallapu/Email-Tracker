import { MailboxFilter } from "@/components/settings/MailboxFilter";
import { InboxDateFilter } from "@/components/inbox/InboxDateFilter";
import {
  buildInboxHref,
  InboxPagination,
  INBOX_PAGE_SIZE,
} from "@/components/inbox/InboxPagination";
import { InboxToolbar } from "@/components/inbox/InboxToolbar";
import { ThreadTable } from "@/components/inbox/ThreadTable";
import { auth } from "@/lib/auth";
import { getOrgMailConnections } from "@/lib/mail/connections";
import { getMailboxEmails } from "@/lib/mail/mailboxes";
import {
  buildThreadMailboxMap,
  getMailboxOptions,
  getThreadKeysForConnection,
  resolveMailboxConnection,
  threadKey,
} from "@/lib/mail/mailbox-filter";
import { resolveMailScope, scopeEmailsFilter, scopeThreadsFilter } from "@/lib/mail/scope";
import { getEnrichedMailboxStats } from "@/lib/mail/mailbox-stats";
import { getActiveSlaConfig } from "@/lib/mail/sla";
import { getThreadAudienceMap } from "@/lib/metrics/audience";
import {
  describeReportDateRange,
  parseReportDateParam,
  resolveReportDateBounds,
} from "@/lib/metrics/report-date";
import { threadRowToSummary } from "@/lib/metrics/reply-time";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrganization } from "@/lib/org/require-org";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function applyDateBoundsToThreadQuery<T extends { gte: (col: string, val: string) => T; lte: (col: string, val: string) => T }>(
  query: T,
  bounds: { start?: string; end: string } | null
): T {
  if (!bounds) return query;
  if (bounds.start) query = query.gte("last_message_at", bounds.start);
  return query.lte("last_message_at", bounds.end);
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; from?: string; to?: string; mailbox?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");
  await requireOrganization(session.user.id);

  const params = await searchParams;
  const requestedPage = Math.max(1, Number(params.page) || 1);
  const startDate = parseReportDateParam(params.from);
  const endDate = parseReportDateParam(params.to);
  const bounds = resolveReportDateBounds({ startDate, endDate });
  const dateRange = describeReportDateRange({ startDate, endDate });

  const supabase = createAdminClient();
  const userId = session.user.id;
  const scope = await resolveMailScope(userId);
  const orgConnections =
    scope.mode === "organization"
      ? await getOrgMailConnections(scope.organizationId)
      : [];
  const mailboxConn = resolveMailboxConnection(
    orgConnections,
    params.mailbox
  );
  const mailboxOptions = await getMailboxOptions(scope);
  const mailboxThreadKeys = mailboxConn
    ? await getThreadKeysForConnection(scope, mailboxConn.id)
    : null;

  let threadsQuery = supabase
    .from("threads")
    .select("*")
    .eq("is_archived", false)
    .order("last_message_at", { ascending: false });
  threadsQuery = scopeThreadsFilter(threadsQuery, scope);
  threadsQuery = applyDateBoundsToThreadQuery(threadsQuery, bounds);

  const { data: allRows } = await threadsQuery;
  let filteredRows = allRows ?? [];
  if (mailboxThreadKeys) {
    filteredRows = filteredRows.filter((row) =>
      mailboxThreadKeys.has(threadKey(row.provider, row.gmail_thread_id))
    );
  }

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE));

  if (total > 0 && requestedPage > totalPages) {
    redirect(
      buildInboxHref(totalPages, {
        from: startDate,
        to: endDate,
        mailbox: params.mailbox,
      })
    );
  }

  const page = total > 0 ? Math.min(requestedPage, totalPages) : 1;
  const from = (page - 1) * INBOX_PAGE_SIZE;
  const rows = filteredRows.slice(from, from + INBOX_PAGE_SIZE);

  let emailCountQuery = scopeEmailsFilter(
    supabase.from("emails").select("*", { count: "exact", head: true }),
    scope
  );
  if (mailboxConn) {
    emailCountQuery = emailCountQuery.eq(
      "mail_connection_id",
      mailboxConn.id
    );
  }
  const { count: emailCount } = await emailCountQuery;

  const slaConfig = await getActiveSlaConfig(session.user.id);
  const threshold = slaConfig?.threshold_hours ?? 24;
  const userEmails = mailboxConn
    ? [mailboxConn.mailbox_email]
    : await getMailboxEmails(scope);
  const [audienceByThreadId, mailboxStats] = await Promise.all([
    getThreadAudienceMap(userId),
    getEnrichedMailboxStats(userId),
  ]);
  const filteredMailboxStats = mailboxConn
    ? mailboxStats.filter(
        (m) =>
          m.connectionId === mailboxConn.id ||
          m.email.toLowerCase() === mailboxConn.mailbox_email.toLowerCase()
      )
    : mailboxStats;
  const threads = rows.map((r) => threadRowToSummary(r, threshold));
  const mailboxByThreadId = await buildThreadMailboxMap(
    scope,
    orgConnections,
    rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      gmail_thread_id: r.gmail_thread_id,
    }))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
        <h2 className="text-2xl font-bold text-gray-900">Inbox</h2>
        <p className="text-gray-500">
          {mailboxConn
            ? `Threads for ${mailboxConn.mailbox_email}`
            : "All connected mailboxes"}
        </p>
        {dateRange && (
          <p className="mt-1 text-sm text-indigo-700">
            Filtered:{" "}
            {dateRange.startDate
              ? formatDisplayDate(dateRange.startDate)
              : "beginning"}{" "}
            →{" "}
            {dateRange.endDate
              ? formatDisplayDate(dateRange.endDate)
              : "today"}
          </p>
        )}
        </div>
        <Suspense fallback={null}>
          <MailboxFilter
            mailboxes={mailboxOptions}
            basePath="/dashboard/inbox"
          />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <InboxDateFilter startDate={startDate} endDate={endDate} />
      </Suspense>

      <InboxToolbar
        totalThreads={total}
        emailCount={emailCount ?? 0}
        mailboxStats={filteredMailboxStats}
      />

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-lg font-medium text-gray-700">
            {bounds ? "No threads in this date range" : "Syncing your inbox…"}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {bounds
              ? "Try a wider date range or clear the filter."
              : "Recent mail syncs automatically. Click Sync new mail above, or open a thread to load it."}
          </p>
        </div>
      ) : (
        <>
          <ThreadTable
            threads={threads}
            userEmails={userEmails}
            audienceByThreadId={audienceByThreadId}
            mailboxByThreadId={mailboxByThreadId}
            showMailboxColumn={mailboxOptions.length > 1}
          />
          <InboxPagination
            page={page}
            total={total}
            startDate={startDate}
            endDate={endDate}
            mailbox={params.mailbox}
          />
        </>
      )}
    </div>
  );
}
