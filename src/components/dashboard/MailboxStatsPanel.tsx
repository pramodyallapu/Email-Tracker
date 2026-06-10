import { SyncStatusPanel } from "@/components/settings/SyncStatusPanel";
import type { EnrichedMailboxStat } from "@/lib/mail/sync-status";

export function MailboxStatsPanel({
  stats,
}: {
  stats: EnrichedMailboxStat[];
}) {
  if (stats.length === 0) return null;

  return <SyncStatusPanel mailboxes={stats} />;
}
