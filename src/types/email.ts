export interface ParsedEmail {
  id: string;
  gmailMessageId: string;
  threadId: string;
  from: { address: string; name?: string };
  to: string[];
  cc: string[];
  subject: string;
  receivedAt: string;
  isSent: boolean;
  isReply: boolean;
  labels: string[];
}

export type SlaStatus = "ok" | "warning" | "breach";

export interface ThreadSummary {
  id: string;
  provider: "google" | "zoho";
  gmailThreadId: string;
  subject: string;
  participants: string[];
  isReplied: boolean;
  replyTimeSecs: number | null;
  messageCount: number;
  lastMessageAt: string;
  firstReceivedAt: string | null;
  firstRepliedAt: string | null;
  slaStatus: SlaStatus;
}

export interface DailyMetrics {
  date: string;
  totalReceived: number;
  totalSent: number;
  replyRate: number;
  avgReplyTimeSecs: number | null;
  threadsReplied: number;
  threadsNotReplied: number;
}

export type Trend = "up" | "down" | "flat";

export interface KpiSummary {
  today: DailyMetrics;
  weekAvg: DailyMetrics;
  trend: Trend;
}

export interface TeamMemberStats {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  avgReplyTimeSecs: number | null;
  replyRate: number;
  emailsToday: number;
  streak: number;
  rank: number;
}
