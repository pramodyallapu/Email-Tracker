import { AudienceStatsPanel } from "@/components/dashboard/AudienceStats";
import { MailboxStatsPanel } from "@/components/dashboard/MailboxStatsPanel";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { MailboxFilter } from "@/components/settings/MailboxFilter";
import { getMailboxEmails } from "@/lib/mail/mailboxes";
import {
  getMailboxOptions,
  resolveMailboxConnection,
} from "@/lib/mail/mailbox-filter";
import { getOrgMailConnections } from "@/lib/mail/connections";
import { resolveMailScope } from "@/lib/mail/scope";
import { getActiveSlaConfig } from "@/lib/mail/sla";
import { requireOrganization } from "@/lib/org/require-org";
import { counterpartyLabel } from "@/lib/mail/rebuild-threads";
import { ReplyTimeChart } from "@/components/dashboard/ReplyTimeChart";
import { VolumeChart } from "@/components/dashboard/VolumeChart";
import { auth } from "@/lib/auth";
import {
  getKpiSummary,
  getPendingThreads,
  getReplyTimeSeries,
  getVolumeSeries,
} from "@/lib/metrics/aggregator";
import { getEnrichedMailboxStats } from "@/lib/mail/mailbox-stats";
import { getAudienceStats } from "@/lib/metrics/audience";
import { threadRowToSummary } from "@/lib/metrics/reply-time";
import { formatReplyTime } from "@/lib/metrics/reply-time";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mailbox?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const userId = session.user.id;
  await requireOrganization(userId);
  const scope = await resolveMailScope(userId);
  const params = await searchParams;

  const orgConnections =
    scope.mode === "organization"
      ? await getOrgMailConnections(scope.organizationId)
      : [];
  const mailboxConn = resolveMailboxConnection(
    orgConnections,
    params.mailbox
  );
  const metricsOptions = mailboxConn
    ? {
        mailConnectionId: mailboxConn.id,
        mailboxEmail: mailboxConn.mailbox_email,
      }
    : undefined;

  const mailboxOptions = await getMailboxOptions(scope);
  const userEmails = mailboxConn
    ? [mailboxConn.mailbox_email]
    : await getMailboxEmails(scope);

  const kpi = await getKpiSummary(userId, metricsOptions);
  const series = await getReplyTimeSeries(userId, 30, metricsOptions);
  const pending = await getPendingThreads(userId, 5, metricsOptions);
  const volumeData = await getVolumeSeries(userId, 14, metricsOptions);

  const slaConfig = await getActiveSlaConfig(userId);
  const [audienceStats, mailboxStats] = await Promise.all([
    getAudienceStats(userId, slaConfig?.threshold_hours ?? 24),
    getEnrichedMailboxStats(userId),
  ]);

  const emailsToday = kpi.today.totalReceived + kpi.today.totalSent;
  const trendLabel =
    kpi.trend === "up"
      ? "↑ vs week avg"
      : kpi.trend === "down"
        ? "↓ vs week avg"
        : "— flat";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500">
            {mailboxConn
              ? `Metrics for ${mailboxConn.mailbox_email}`
              : "Combined metrics for all connected mailboxes"}
          </p>
        </div>
        <Suspense fallback={null}>
          <MailboxFilter
            mailboxes={mailboxOptions}
            basePath="/dashboard"
          />
        </Suspense>
      </div>

      <MailboxStatsPanel stats={mailboxStats} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Emails today"
          value={emailsToday}
          trend={kpi.trend}
          trendLabel={trendLabel}
          subtitle="Received + sent"
        />
        <KpiCard
          title="Reply rate"
          value={`${kpi.today.replyRate}%`}
          trend={kpi.trend}
          trendLabel={trendLabel}
        />
        <KpiCard
          title="Avg reply time"
          value={
            kpi.today.avgReplyTimeSecs != null
              ? formatReplyTime(kpi.today.avgReplyTimeSecs)
              : "—"
          }
          trend={kpi.trend}
          trendLabel={trendLabel}
        />
        <KpiCard
          title="Pending threads"
          value={kpi.today.threadsNotReplied}
          subtitle="Awaiting reply"
        />
      </div>

      <AudienceStatsPanel stats={audienceStats} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ReplyTimeChart data={series} />
        <VolumeChart data={volumeData} />
      </div>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-gray-900">
          Needs reply
        </h3>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-gray-500">
            Your inbox is clear!
          </p>
        ) : (
          <ul className="divide-y rounded-lg border border-gray-200 bg-white">
            {pending.map((row) => {
              const t = threadRowToSummary(row);
              return (
                <li key={row.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{t.subject}</p>
                    <p className="text-xs text-gray-500">
                      {counterpartyLabel(t.participants, userEmails)}
                    </p>
                  </div>
                  <Link
                    href="/dashboard/inbox"
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    View
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
