"use client";

import { formatCount } from "@/lib/format";
import type { EnrichedMailboxStat } from "@/lib/mail/sync-status";
import type { MailboxSyncResult } from "@/lib/mail/sync-all";

export function SyncResultBanner({
  mode,
  newSynced,
  mailboxes,
  coverage,
  errors,
}: {
  mode: "quick" | "full";
  newSynced: number;
  mailboxes: MailboxSyncResult[];
  coverage: EnrichedMailboxStat[];
  errors?: number;
}) {
  return (
    <div
      className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900"
      role="status"
    >
      <p className="font-medium">
        {mode === "full" ? "Full sync complete" : "Quick sync complete"}
      </p>
      <p className="mt-1">
        {mode === "quick"
          ? newSynced === 0
            ? "No new mail found."
            : `${newSynced} new message${newSynced === 1 ? "" : "s"} added.`
          : `${formatCount(newSynced)} messages processed.`}
        {errors ? ` ${errors} error${errors === 1 ? "" : "s"}.` : ""}
      </p>

      <ul className="mt-3 space-y-2 border-t border-indigo-200 pt-3">
        {mailboxes.map((mb) => {
          const cov = coverage.find(
            (c) => c.email.toLowerCase() === mb.email.toLowerCase()
          );
          return (
            <li key={mb.email} className="text-xs">
              <span className="font-medium">{mb.email}</span>
              {mb.skipped ? (
                <span className="text-indigo-700"> — {mb.skipped}</span>
              ) : mode === "quick" ? (
                <span className="text-indigo-700">
                  {" "}
                  — +{mb.newSynced} new
                  {cov && cov.notSyncedMessages != null && cov.notSyncedMessages > 0
                    ? ` · ${formatCount(cov.notSyncedMessages)} older messages not synced`
                    : cov?.coverageStatus === "complete"
                      ? " · fully synced"
                      : ""}
                </span>
              ) : (
                <span className="text-indigo-700">
                  {" "}
                  — {cov ? formatCount(cov.syncedMessages) : mb.newSynced} synced
                  {cov?.messagesTotal != null
                    ? ` of ${formatCount(cov.messagesTotal)} (${cov.syncPercent ?? 0}%)`
                    : ""}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {mode === "quick" &&
        coverage.some((c) => c.coverageStatus === "partial") && (
          <p className="mt-3 text-xs text-indigo-800">
            Older mail is not synced in quick mode. Use{" "}
            <strong>Full sync</strong> to pull entire Gmail + Zoho history.
          </p>
        )}
    </div>
  );
}
