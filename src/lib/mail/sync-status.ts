import { formatCount } from "@/lib/format";
import type { MailboxLiveStat } from "@/lib/mail/mailbox-stats";

export type SyncCoverageStatus =
  | "complete"
  | "partial"
  | "not_synced"
  | "unknown";

export type EnrichedMailboxStat = MailboxLiveStat & {
  notSyncedMessages: number | null;
  syncPercent: number | null;
  coverageStatus: SyncCoverageStatus;
  coverageLabel: string;
};

export function enrichMailboxStat(stat: MailboxLiveStat): EnrichedMailboxStat {
  if (stat.provider === "zoho" && stat.messagesTotal == null) {
    const synced = stat.syncedMessages;
    return {
      ...stat,
      notSyncedMessages: null,
      syncPercent: synced > 0 ? null : 0,
      coverageStatus: synced > 0 ? "partial" : "not_synced",
      coverageLabel:
        synced > 0
          ? `${formatCount(synced)} Zoho messages synced — run Full sync for complete history`
          : "Not synced — run Full sync to import Zoho mail",
    };
  }

  if (stat.messagesTotal == null) {
    return {
      ...stat,
      notSyncedMessages: null,
      syncPercent: null,
      coverageStatus: "unknown",
      coverageLabel: "Could not read mailbox size from provider",
    };
  }

  const notSynced = Math.max(0, stat.messagesTotal - stat.syncedMessages);
  const syncPercent =
    stat.messagesTotal > 0
      ? Math.min(100, Math.round((stat.syncedMessages / stat.messagesTotal) * 100))
      : stat.syncedMessages > 0
        ? 100
        : 0;

  let coverageStatus: SyncCoverageStatus;
  let coverageLabel: string;

  if (stat.syncStatus === "running") {
    coverageStatus = "partial";
    coverageLabel =
      stat.messagesTotal != null
        ? `Syncing… ${formatCount(stat.syncedMessages)} of ${formatCount(stat.messagesTotal)} messages`
        : `Syncing… ${formatCount(stat.syncedMessages)} messages so far`;
  } else if (syncPercent >= 98) {
    coverageStatus = "complete";
    coverageLabel = "Fully synced";
  } else if (stat.syncedMessages === 0) {
    coverageStatus = "not_synced";
    coverageLabel = "Not synced yet — run Quick or Full sync";
  } else {
    coverageStatus = "partial";
    coverageLabel = `${formatCount(notSynced)} messages not synced yet (incremental mode)`;
  }

  return {
    ...stat,
    notSyncedMessages: notSynced,
    syncPercent,
    coverageStatus,
    coverageLabel,
  };
}

export type SyncApiMailboxResult = {
  email: string;
  provider: string;
  newSynced: number;
  errors: number;
};

export function formatQuickSyncSummary(
  newSynced: number,
  mailboxes: EnrichedMailboxStat[]
): string {
  const parts: string[] = [];

  if (newSynced === 0) {
    parts.push("No new mail found.");
  } else {
    parts.push(
      `${newSynced} new message${newSynced === 1 ? "" : "s"} synced.`
    );
  }

  const partial = mailboxes.filter((m) => m.coverageStatus === "partial");
  if (partial.length > 0) {
    const notSynced = partial.reduce(
      (sum, m) => sum + (m.notSyncedMessages ?? 0),
      0
    );
    parts.push(
      `${formatCount(notSynced)} older message${notSynced === 1 ? "" : "s"} not synced — use Full sync for complete Gmail + Zoho history.`
    );
  }

  return parts.join(" ");
}

export function formatFullSyncSummary(
  processed: number,
  mailboxes: EnrichedMailboxStat[]
): string {
  const complete = mailboxes.filter((m) => m.coverageStatus === "complete");
  const lines = [
    `Full sync processed ${formatCount(processed)} messages.`,
  ];

  if (complete.length === mailboxes.length && mailboxes.length > 0) {
    lines.push("All mailboxes are fully synced.");
  } else {
    for (const mb of mailboxes) {
      lines.push(
        `${mb.email}: ${formatCount(mb.syncedMessages)} synced` +
          (mb.messagesTotal != null
            ? ` of ${formatCount(mb.messagesTotal)} (${mb.syncPercent ?? 0}%)`
            : "")
      );
    }
  }

  return lines.join(" ");
}
