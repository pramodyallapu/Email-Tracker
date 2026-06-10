import { cache } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMailboxEmails } from "@/lib/mail/mailboxes";
import { resolveIsSent } from "@/lib/mail/sent";
import {
  resolveMailScope,
  scopeEmailsFilter,
  scopeMetricsFilter,
  scopeThreadsFilter,
  type MailScope,
} from "@/lib/mail/scope";
import {
  getThreadKeysForConnection,
  threadKey,
} from "@/lib/mail/mailbox-filter";
import { fetchEmailsPaginated } from "@/lib/metrics/emails-query";
import type { DailyMetrics, KpiSummary, Trend } from "@/types/email";

export type MetricsOptions = {
  mailConnectionId?: string;
  mailboxEmail?: string;
};
import {
  getReportTimezone,
  reportDateRange,
  reportDayBoundsUtc,
  toReportDate,
} from "@/lib/metrics/report-date";
import { format, subDays } from "date-fns";

function emptyMetrics(date: string): DailyMetrics {
  return {
    date,
    totalReceived: 0,
    totalSent: 0,
    replyRate: 0,
    avgReplyTimeSecs: null,
    threadsReplied: 0,
    threadsNotReplied: 0,
  };
}

function rowToMetrics(row: {
  date: string;
  total_received: number;
  total_sent: number;
  reply_rate: number;
  avg_reply_time_sec: number | null;
  threads_replied: number;
  threads_not_replied: number;
}): DailyMetrics {
  return {
    date: row.date,
    totalReceived: row.total_received,
    totalSent: row.total_sent,
    replyRate: Number(row.reply_rate),
    avgReplyTimeSecs: row.avg_reply_time_sec,
    threadsReplied: row.threads_replied,
    threadsNotReplied: row.threads_not_replied,
  };
}

function computeTrend(today: DailyMetrics, weekAvg: DailyMetrics): Trend {
  if (today.replyRate > weekAvg.replyRate + 2) return "up";
  if (today.replyRate < weekAvg.replyRate - 2) return "down";
  return "flat";
}

async function computeLiveMetrics(
  scope: MailScope,
  dateStr: string,
  options?: MetricsOptions
): Promise<DailyMetrics> {
  const supabase = createAdminClient();
  const tz = getReportTimezone();
  const { start, end } = reportDayBoundsUtc(dateStr, tz);

  const mailboxEmails = options?.mailboxEmail
    ? [options.mailboxEmail.toLowerCase()]
    : await getMailboxEmails(scope);

  let dayEmailsQuery = supabase
    .from("emails")
    .select("is_sent, from_address, labels, received_at")
    .gte("received_at", start)
    .lte("received_at", end);
  dayEmailsQuery = scopeEmailsFilter(dayEmailsQuery, scope);
  if (options?.mailConnectionId) {
    dayEmailsQuery = dayEmailsQuery.eq(
      "mail_connection_id",
      options.mailConnectionId
    );
  }
  const { data: dayEmails } = await dayEmailsQuery;

  const emailsInDay = (dayEmails ?? []).filter(
    (e) => toReportDate(e.received_at, tz) === dateStr
  );

  let totalReceived = 0;
  let totalSent = 0;
  for (const e of emailsInDay) {
    if (resolveIsSent(e, mailboxEmails)) totalSent += 1;
    else totalReceived += 1;
  }

  let threadsQuery = supabase
    .from("threads")
    .select("is_replied, reply_time_seconds, provider, gmail_thread_id");
  threadsQuery = scopeThreadsFilter(threadsQuery, scope);
  const { data: threadsRaw } = await threadsQuery;

  let threads = threadsRaw ?? [];
  if (options?.mailConnectionId) {
    const keys = await getThreadKeysForConnection(
      scope,
      options.mailConnectionId
    );
    threads = threads.filter((t) =>
      keys.has(threadKey(t.provider, t.gmail_thread_id))
    );
  }

  const threadsReplied = threads.filter((t) => t.is_replied).length;
  const threadsNotReplied = threads.filter((t) => !t.is_replied).length;
  const totalThreads = threadsReplied + threadsNotReplied;
  const replyRate =
    totalThreads > 0
      ? Math.round((threadsReplied / totalThreads) * 10000) / 100
      : 0;

  const replyTimes = threads
    .map((t) => t.reply_time_seconds)
    .filter((t): t is number => t != null);
  const avgReplyTimeSecs =
    replyTimes.length > 0
      ? Math.round(replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length)
      : null;

  return {
    date: dateStr,
    totalReceived,
    totalSent,
    replyRate,
    avgReplyTimeSecs,
    threadsReplied,
    threadsNotReplied,
  };
}

function hasMetricsData(m: DailyMetrics): boolean {
  return (
    m.totalReceived > 0 ||
    m.totalSent > 0 ||
    m.threadsReplied > 0 ||
    m.threadsNotReplied > 0
  );
}

function averageMetrics(rows: DailyMetrics[]): DailyMetrics {
  if (rows.length === 0) return emptyMetrics(format(new Date(), "yyyy-MM-dd"));

  const sum = rows.reduce(
    (acc, r) => ({
      totalReceived: acc.totalReceived + r.totalReceived,
      totalSent: acc.totalSent + r.totalSent,
      replyRate: acc.replyRate + r.replyRate,
      avgReplyTimeSecs: acc.avgReplyTimeSecs + (r.avgReplyTimeSecs ?? 0),
      threadsReplied: acc.threadsReplied + r.threadsReplied,
      threadsNotReplied: acc.threadsNotReplied + r.threadsNotReplied,
    }),
    {
      totalReceived: 0,
      totalSent: 0,
      replyRate: 0,
      avgReplyTimeSecs: 0,
      threadsReplied: 0,
      threadsNotReplied: 0,
    }
  );

  const n = rows.length;
  const withAvg = rows.filter((r) => r.avgReplyTimeSecs != null);

  return {
    date: "week-avg",
    totalReceived: Math.round(sum.totalReceived / n),
    totalSent: Math.round(sum.totalSent / n),
    replyRate: Math.round((sum.replyRate / n) * 100) / 100,
    avgReplyTimeSecs:
      withAvg.length > 0
        ? Math.round(sum.avgReplyTimeSecs / withAvg.length)
        : null,
    threadsReplied: Math.round(sum.threadsReplied / n),
    threadsNotReplied: Math.round(sum.threadsNotReplied / n),
  };
}

export const getKpiSummary = cache(
  async (
    userId: string,
    options?: MetricsOptions
  ): Promise<KpiSummary> => {
    noStore();
    const scope = await resolveMailScope(userId);
    const supabase = createAdminClient();
    const todayStr = toReportDate(new Date(), getReportTimezone());
    const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

    let metricsQuery = supabase
      .from("metrics_daily")
      .select("*")
      .gte("date", weekAgo)
      .order("date", { ascending: false });
    metricsQuery = scopeMetricsFilter(metricsQuery, scope);
    const { data: rows } = await metricsQuery;

    const metrics = (rows ?? []).map(rowToMetrics);
    const today = await computeLiveMetrics(scope, todayStr, options);

    let weekRows = metrics.filter((m) => m.date !== todayStr);
    if (weekRows.length === 0 || !weekRows.some(hasMetricsData)) {
      const tz = getReportTimezone();
      const recent = reportDateRange(8, tz);
      const liveWeek: DailyMetrics[] = [];
      for (const d of recent.slice(0, -1).reverse()) {
        liveWeek.push(await computeLiveMetrics(scope, d, options));
      }
      weekRows = liveWeek;
    }

    const weekAvg = averageMetrics(weekRows);

    return {
      today,
      weekAvg,
      trend: computeTrend(today, weekAvg),
    };
  }
);

export const getReplyTimeSeries = cache(
  async (
    userId: string,
    days: number,
    options?: MetricsOptions
  ): Promise<{ date: string; avgSecs: number; replyRate: number }[]> => {
    const scope = await resolveMailScope(userId);
    const supabase = createAdminClient();
    const since = format(subDays(new Date(), days), "yyyy-MM-dd");

    let seriesQuery = supabase
      .from("metrics_daily")
      .select("date, avg_reply_time_sec, reply_rate")
      .gte("date", since)
      .order("date", { ascending: true });
    seriesQuery = scopeMetricsFilter(seriesQuery, scope);
    const { data: rows } = await seriesQuery;

    if (rows?.length) {
      return rows.map((r) => ({
        date: r.date,
        avgSecs: r.avg_reply_time_sec ?? 0,
        replyRate: Number(r.reply_rate),
      }));
    }

    const series: { date: string; avgSecs: number; replyRate: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      const live = await computeLiveMetrics(scope, d, options);
      series.push({
        date: d,
        avgSecs: live.avgReplyTimeSecs ?? 0,
        replyRate: live.replyRate,
      });
    }
    return series;
  }
);

export async function getVolumeSeries(
  userId: string,
  days: number,
  options?: MetricsOptions
): Promise<{ date: string; received: number; sent: number }[]> {
  noStore();

  const scope = await resolveMailScope(userId);
  const mailboxEmails = options?.mailboxEmail
    ? [options.mailboxEmail.toLowerCase()]
    : await getMailboxEmails(scope);
  const tz = getReportTimezone();
  const dateKeys = reportDateRange(days, tz);
  const oldest = dateKeys[0];
  const { start } = reportDayBoundsUtc(oldest, tz);

  const buckets = new Map<string, { received: number; sent: number }>();
  for (const d of dateKeys) {
    buckets.set(d, { received: 0, sent: 0 });
  }

  const emails = await fetchEmailsPaginated(scope, {
    since: start,
    select: "is_sent, from_address, labels, received_at",
    extraFilters: options?.mailConnectionId
      ? (q) => q.eq("mail_connection_id", options.mailConnectionId!)
      : undefined,
  });

  for (const raw of emails) {
    const email = raw as {
      is_sent: boolean;
      from_address: string;
      labels: string[] | null;
      received_at: string;
    };
    const day = toReportDate(email.received_at, tz);
    const bucket = buckets.get(day);
    if (!bucket) continue;

    if (resolveIsSent(email, mailboxEmails)) bucket.sent += 1;
    else bucket.received += 1;
  }

  return dateKeys.map((date) => {
    const counts = buckets.get(date)!;
    return {
      date,
      received: counts.received,
      sent: counts.sent,
    };
  });
}

export const getTopSenders = cache(
  async (
    userId: string,
    limit: number
  ): Promise<
    { email: string; name: string | null; count: number; avgReplySecs: number | null }[]
  > => {
    const scope = await resolveMailScope(userId);
    const supabase = createAdminClient();

    let sendersQuery = supabase
      .from("emails")
      .select("from_address, from_name, gmail_thread_id")
      .eq("is_sent", false)
      .order("received_at", { ascending: false })
      .limit(5000);
    sendersQuery = scopeEmailsFilter(sendersQuery, scope);
    const { data: emails } = await sendersQuery;

    if (!emails?.length) return [];

    const counts = new Map<
      string,
      { name: string | null; count: number; threads: Set<string> }
    >();

    for (const e of emails) {
      const existing = counts.get(e.from_address) ?? {
        name: e.from_name,
        count: 0,
        threads: new Set<string>(),
      };
      existing.count += 1;
      existing.threads.add(e.gmail_thread_id);
      counts.set(e.from_address, existing);
    }

    let threadReplyQuery = supabase
      .from("threads")
      .select("gmail_thread_id, reply_time_seconds");
    threadReplyQuery = scopeThreadsFilter(threadReplyQuery, scope);
    const { data: threads } = await threadReplyQuery;

    const threadReplyMap = new Map(
      (threads ?? []).map((t) => [t.gmail_thread_id, t.reply_time_seconds])
    );

    const results = Array.from(counts.entries()).map(([email, info]) => {
      const replyTimes = Array.from(info.threads)
        .map((tid) => threadReplyMap.get(tid))
        .filter((t): t is number => t != null);
      const avgReplySecs =
        replyTimes.length > 0
          ? Math.round(
              replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length
            )
          : null;

      return {
        email,
        name: info.name,
        count: info.count,
        avgReplySecs,
      };
    });

    return results.sort((a, b) => b.count - a.count).slice(0, limit);
  }
);

export type HeatmapCell = { hour: number; dow: number; count: number };

export type HeatmapBreakdown = {
  hour: number;
  dow: number;
  count: number;
  topSenders: { email: string; name: string | null; count: number }[];
  recentEmails: {
    from_address: string;
    from_name: string | null;
    subject: string | null;
    received_at: string;
    provider: string | null;
  }[];
};

export const getHourlyHeatmap = cache(
  async (userId: string): Promise<HeatmapCell[]> => {
    const scope = await resolveMailScope(userId);
    const since = subDays(new Date(), 90).toISOString();
    const emails = await fetchEmailsPaginated(scope, {
      since,
      select: "received_at",
      extraFilters: (q) => q.eq("is_sent", false),
    });

    const grid = new Map<string, number>();

    for (const e of emails) {
      const d = new Date((e as { received_at: string }).received_at);
      const hour = d.getUTCHours();
      const dow = d.getUTCDay();
      const key = `${hour}-${dow}`;
      grid.set(key, (grid.get(key) ?? 0) + 1);
    }

    const result: { hour: number; dow: number; count: number }[] = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let dow = 0; dow < 7; dow++) {
        result.push({
          hour,
          dow,
          count: grid.get(`${hour}-${dow}`) ?? 0,
        });
      }
    }
    return result;
  }
);

export async function getHeatmapBreakdown(
  userId: string,
  hour: number,
  dow: number
): Promise<HeatmapBreakdown> {
  const scope = await resolveMailScope(userId);
  const since = subDays(new Date(), 90).toISOString();

  const emails = await fetchEmailsPaginated(scope, {
    since,
    select: "from_address, from_name, subject, received_at, provider",
    extraFilters: (q) => q.eq("is_sent", false),
    orderAsc: false,
  });

  const filtered = emails.filter((e) => {
    const row = e as { received_at: string };
    const d = new Date(row.received_at);
    return d.getUTCHours() === hour && d.getUTCDay() === dow;
  });

  const senderCounts = new Map<string, { name: string | null; count: number }>();
  for (const raw of filtered) {
    const e = raw as {
      from_address: string;
      from_name: string | null;
    };
    const existing = senderCounts.get(e.from_address);
    if (existing) {
      existing.count++;
    } else {
      senderCounts.set(e.from_address, { name: e.from_name, count: 1 });
    }
  }

  const topSenders = Array.from(senderCounts.entries())
    .map(([email, info]) => ({
      email,
      name: info.name,
      count: info.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    hour,
    dow,
    count: filtered.length,
    topSenders,
    recentEmails: filtered.slice(0, 25).map((raw) => {
      const e = raw as {
        from_address: string;
        from_name: string | null;
        subject: string | null;
        received_at: string;
        provider: string | null;
      };
      return {
        from_address: e.from_address,
        from_name: e.from_name,
        subject: e.subject,
        received_at: e.received_at,
        provider: e.provider ?? null,
      };
    }),
  };
}

export const getPendingThreads = cache(
  async (userId: string, limit = 5, options?: MetricsOptions) => {
    const scope = await resolveMailScope(userId);
    const supabase = createAdminClient();
    let pendingQuery = supabase
      .from("threads")
      .select("*")
      .eq("is_replied", false)
      .eq("is_archived", false)
      .order("last_message_at", { ascending: true });
    pendingQuery = scopeThreadsFilter(pendingQuery, scope);
    const { data } = await pendingQuery;

    let rows = data ?? [];
    if (options?.mailConnectionId) {
      const keys = await getThreadKeysForConnection(
        scope,
        options.mailConnectionId
      );
      rows = rows.filter((t) =>
        keys.has(threadKey(t.provider, t.gmail_thread_id))
      );
    }

    return rows.slice(0, limit);
  }
);
