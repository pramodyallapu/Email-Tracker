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

        const sessionStartSynced = new Map(
          coverage.map((m) => [m.connectionId, m.syncedMessages])
        );

        // Never wipe scan position when mail is already partially synced.
        let reset = coverage.every(
          (m) => m.syncedMessages === 0 && m.syncStatus !== "running"
        );

        let hasMore = true;
        let totalSynced = 0;
        let lastMailboxes: MailboxSyncResult[] = [];
        let lastErrors = 0;
        let lastCoverage = coverage;

        if (!reset) {
          setStatusMessage(
            "Resuming full sync from last position (not from the beginning)…"
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
            const coverageNow: EnrichedMailboxStat[] =
              data.coverage ?? lastCoverage;
            const running = coverageNow.filter(
              (m: EnrichedMailboxStat) => m.syncStatus === "running"
            );
            const progress = coverageNow
              .filter(
                (m: EnrichedMailboxStat) =>
                  m.syncStatus === "running" ||
                  (m.messagesTotal != null &&
                    m.syncedMessages < m.messagesTotal - 5)
              )
              .map((m: EnrichedMailboxStat) => {
                const start = sessionStartSynced.get(m.connectionId) ?? 0;
                const added = Math.max(0, m.syncedMessages - start);
                const pct =
                  m.messagesTotal && m.messagesTotal > 0
                    ? Math.round((m.syncedMessages / m.messagesTotal) * 100)
                    : null;
                const base = m.messagesTotal
                  ? `${m.email.split("@")[0]}: ${formatCount(m.syncedMessages)}/${formatCount(m.messagesTotal)}${pct != null ? ` (${pct}%)` : ""}`
                  : `${m.email.split("@")[0]}: ${formatCount(m.syncedMessages)}`;
                return added > 0 ? `${base} +${formatCount(added)}` : base;
              })
              .join(" · ");
            setStatusMessage(
              progress
                ? `Full sync… ${progress}`
                : `Full sync in progress… ${formatCount(totalSynced)} new messages`
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
