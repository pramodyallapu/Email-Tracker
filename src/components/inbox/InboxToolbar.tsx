"use client";

import { Button } from "@/components/ui/Button";
import { SyncResultBanner } from "@/components/settings/SyncResultBanner";
import { formatCount } from "@/lib/format";
import { useMailSync } from "@/lib/hooks/useMailSync";
import type { EnrichedMailboxStat } from "@/lib/mail/sync-status";
import { useEffect, useRef } from "react";

export function InboxToolbar({
  totalThreads,
  emailCount,
  mailboxStats,
}: {
  totalThreads: number;
  emailCount: number;
  mailboxStats: EnrichedMailboxStat[];
}) {
  const autoSynced = useRef(false);
  const {
    syncing,
    statusMessage,
    syncResult,
    coverage,
    runSync,
  } = useMailSync(mailboxStats);

  const partial = coverage.filter((m) => m.coverageStatus === "partial");
  const notSyncedTotal = partial.reduce(
    (sum, m) => sum + (m.notSyncedMessages ?? 0),
    0
  );
  const anyRunning = coverage.some((m) => m.syncStatus === "running");

  useEffect(() => {
    if (autoSynced.current) return;
    autoSynced.current = true;
    void runSync("quick");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-500">
          <p>
            {totalThreads} thread{totalThreads === 1 ? "" : "s"} tracked
            {emailCount > 0 ? ` · ${formatCount(emailCount)} messages synced` : ""}
          </p>
          {anyRunning && (
            <p className="mt-1 text-xs font-medium text-blue-700">
              Sync in progress — counts updating live…
            </p>
          )}
          {!anyRunning && notSyncedTotal > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              {formatCount(notSyncedTotal)} older messages not synced — use
              Full sync for complete history
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => runSync("quick")}
            loading={syncing}
          >
            Quick sync
          </Button>
          <Button size="sm" onClick={() => runSync("full")} loading={syncing}>
            Full sync
          </Button>
        </div>
      </div>

      {statusMessage && (
        <p className="text-sm text-blue-700" role="status">
          {statusMessage}
        </p>
      )}

      {syncResult && (
        <SyncResultBanner
          mode={syncResult.mode}
          newSynced={syncResult.synced}
          mailboxes={syncResult.mailboxes}
          coverage={syncResult.coverage}
          errors={syncResult.errors}
        />
      )}
    </div>
  );
}
