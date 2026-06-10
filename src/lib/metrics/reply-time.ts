import type { ThreadSummary } from "@/types/email";
import type { SlaStatus } from "@/types/email";

export type ReplyAnchorEmail = { received_at: string };

/** Latest inbound → first outbound after it (per-thread reply window). */
export function computeThreadReplyStats(
  inbound: ReplyAnchorEmail[],
  outbound: ReplyAnchorEmail[]
): {
  anchorReceivedAt: string | null;
  replyAt: string | null;
  replyTimeSeconds: number | null;
  isReplied: boolean;
} {
  const lastInbound = inbound.length > 0 ? inbound[inbound.length - 1] : null;
  const replyOutbound = lastInbound
    ? (outbound.find(
        (o) =>
          new Date(o.received_at).getTime() >
          new Date(lastInbound.received_at).getTime()
      ) ?? null)
    : null;

  let replyTimeSeconds: number | null = null;
  if (lastInbound && replyOutbound) {
    replyTimeSeconds = Math.max(
      0,
      Math.round(
        (new Date(replyOutbound.received_at).getTime() -
          new Date(lastInbound.received_at).getTime()) /
          1000
      )
    );
  }

  return {
    anchorReceivedAt: lastInbound?.received_at ?? null,
    replyAt: replyOutbound?.received_at ?? null,
    replyTimeSeconds,
    isReplied: Boolean(lastInbound && replyOutbound),
  };
}

export function calculateReplyTime(thread: ThreadSummary): number | null {
  if (!thread.firstRepliedAt || !thread.firstReceivedAt) return null;
  const diff =
    new Date(thread.firstRepliedAt).getTime() -
    new Date(thread.firstReceivedAt).getTime();
  return Math.max(0, Math.round(diff / 1000));
}

export function formatReplyTime(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours} hours ${mins} min`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days} days ${hours} hours`;
}

export function getSlaStatus(
  thread: ThreadSummary,
  thresholdHours: number
): SlaStatus {
  if (thread.isReplied) return "ok";

  const received = thread.firstReceivedAt ?? thread.lastMessageAt;
  const ageHours =
    (Date.now() - new Date(received).getTime()) / (1000 * 60 * 60);

  if (ageHours > thresholdHours) return "breach";
  if (ageHours > thresholdHours * 0.75) return "warning";
  return "ok";
}

export function threadRowToSummary(
  row: {
    id: string;
    provider?: string;
    gmail_thread_id: string;
    subject: string | null;
    participants: string[];
    is_replied: boolean;
    reply_time_seconds: number | null;
    message_count: number;
    last_message_at: string | null;
    first_received_at: string | null;
    first_replied_at: string | null;
  },
  thresholdHours = 24
): ThreadSummary {
  const summary: ThreadSummary = {
    id: row.id,
    provider: (row.provider === "zoho" ? "zoho" : "google"),
    gmailThreadId: row.gmail_thread_id,
    subject: row.subject ?? "(no subject)",
    participants: row.participants,
    isReplied: row.is_replied,
    replyTimeSecs: row.reply_time_seconds,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at ?? new Date().toISOString(),
    firstReceivedAt: row.first_received_at,
    firstRepliedAt: row.first_replied_at,
    slaStatus: "ok",
  };
  summary.slaStatus = getSlaStatus(summary, thresholdHours);
  return summary;
}
