"use client";

import { formatCount } from "@/lib/format";
import type { EnrichedMailboxStat } from "@/lib/mail/sync-status";
import type { MailboxSyncResult } from "@/lib/mail/sync-all";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export type MailSyncResult = {
  mode: "quick" | "full";
  synced: number;
  errors?: number;
  mailboxes: MailboxSyncResult[];
  coverage: EnrichedMailboxStat[];
};

const POLL_MS = 2000;

export function useMailSync(initialCoverage: EnrichedMailboxStat[]) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<MailSyncResult | null>(null);
  const [coverage, setCoverage] = useState(initialCoverage);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshCoverage = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/sync-status", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        coverage?: EnrichedMailboxStat[];
      };
      if (data.coverage) setCoverage(data.coverage);
    } catch {
      /* ignore poll errors */
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    void refreshCoverage();
    pollRef.current = setInterval(() => {
      void refreshCoverage();
    }, POLL_MS);
  }, [refreshCoverage, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const runSync = useCallback(
    async (mode: "quick" | "full") => {
      setSyncing(true);
      setSyncResult(null);
      setStatusMessage(
        mode === "full"
          ? "Full sync started — counts update every few seconds…"
          : "Quick sync — checking for new mail…"
      );
      startPolling();

      try {
        if (mode === "quick") {
          const res = await fetch("/api/gmail/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "quick" }),
          });
          const data = await res.json();
          if (res.ok) {
            if (data.coverage) setCoverage(data.coverage);
            setSyncResult({
              mode: "quick",
              synced: data.synced ?? 0,
              errors: data.errors,
              mailboxes: data.mailboxes ?? [],
              coverage: data.coverage ?? coverage,
            });
            setStatusMessage(null);
          } else {
            setStatusMessage(data.error ?? "Sync failed.");
          }
          router.refresh();
          return;
        }

        const needsFullRescan = coverage.some((m) => {
          if (!m.messagesTotal || m.messagesTotal === 0) return true;
          const pct = (m.syncedMessages / m.messagesTotal) * 100;
          return pct < 90;
        });

        let reset = needsFullRescan;
        let hasMore = true;
        let totalSynced = 0;
        let lastMailboxes: MailboxSyncResult[] = [];
        let lastErrors = 0;
        let lastCoverage = coverage;

        if (!needsFullRescan) {
          setStatusMessage(
            "Almost fully synced — filling remaining messages only (fast)…"
          );
        }

        while (hasMore) {
          const res = await fetch("/api/gmail/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "full", reset }),
          });

          const data = await res.json();
          reset = false;

          if (!res.ok) {
            setStatusMessage(data.error ?? "Sync failed.");
            break;
          }

          totalSynced += data.synced ?? 0;
          lastErrors = data.errors ?? 0;
          lastMailboxes = data.mailboxes ?? [];
          if (data.coverage) {
            lastCoverage = data.coverage;
            setCoverage(data.coverage);
          }

          hasMore = Boolean(data.hasMore);

          if (totalSynced === 0 && lastErrors > 0 && !hasMore) {
            setStatusMessage(
              "Sync failed — check server logs. Run sql/sync-progress.sql and sql/organizations.sql in Supabase."
            );
            break;
          }

          if (hasMore) {
            setStatusMessage(
              `Full sync in progress… ${formatCount(totalSynced)} messages processed this session`
            );
          }
        }

        setSyncResult({
          mode: "full",
          synced: totalSynced,
          errors: lastErrors,
          mailboxes: lastMailboxes,
          coverage: lastCoverage,
        });
        setStatusMessage(null);
        router.refresh();
      } finally {
        stopPolling();
        setSyncing(false);
        void refreshCoverage();
      }
    },
    [coverage, refreshCoverage, router, startPolling, stopPolling]
  );

  return {
    syncing,
    statusMessage,
    syncResult,
    coverage,
    setCoverage,
    runSync,
    refreshCoverage,
  };
}
