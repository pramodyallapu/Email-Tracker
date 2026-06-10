import { formatCount } from "@/lib/format";
import type { EnrichedMailboxStat } from "@/lib/mail/sync-status";

function statusStyles(status: EnrichedMailboxStat["coverageStatus"]) {
  switch (status) {
    case "complete":
      return "bg-emerald-100 text-emerald-800";
    case "partial":
      return "bg-amber-100 text-amber-800";
    case "not_synced":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function statusShortLabel(
  mb: EnrichedMailboxStat
): string {
  if (mb.syncStatus === "running") return "Syncing…";
  switch (mb.coverageStatus) {
    case "complete":
      return "Fully synced";
    case "partial":
      return "Partially synced";
    case "not_synced":
      return "Not synced";
    default:
      return "Unknown";
  }
}

function statusBadgeClass(mb: EnrichedMailboxStat): string {
  if (mb.syncStatus === "running") return "bg-blue-100 text-blue-800";
  return statusStyles(mb.coverageStatus);
}

export function SyncStatusPanel({
  mailboxes,
  compact = false,
}: {
  mailboxes: EnrichedMailboxStat[];
  compact?: boolean;
}) {
  if (mailboxes.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Sync status</h3>
        {!compact && (
          <p className="mt-1 text-xs text-gray-500">
            Quick sync = new mail only. Full sync = entire Gmail + Zoho history.
          </p>
        )}
      </div>
      <ul className="space-y-3">
        {mailboxes.map((mb) => (
          <li
            key={mb.connectionId}
            className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {mb.email}
                </p>
                <p className="text-xs text-gray-500">
                  {mb.provider === "zoho" ? "Zoho Mail" : "Gmail"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(mb)}`}
              >
                {statusShortLabel(mb)}
              </span>
            </div>

            {mb.syncPercent != null && mb.messagesTotal != null && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-gray-600">
                  <span>
                    <strong className="text-indigo-700">
                      {formatCount(mb.syncedMessages)}
                    </strong>{" "}
                    synced
                  </span>
                  <span>
                    <strong className="text-gray-700">
                      {formatCount(mb.notSyncedMessages ?? 0)}
                    </strong>{" "}
                    not synced
                  </span>
                  <span>{mb.syncPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${
                      mb.syncStatus === "running"
                        ? "bg-blue-500 animate-pulse"
                        : mb.coverageStatus === "complete"
                          ? "bg-emerald-500"
                          : "bg-indigo-500"
                    }`}
                    style={{
                      width: `${Math.max(mb.syncPercent ?? 0, mb.syncStatus === "running" && mb.syncPercent === 0 ? 1 : 0)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {formatCount(mb.syncedMessages)} of{" "}
                  {formatCount(mb.messagesTotal)} messages in mailbox
                </p>
              </div>
            )}

            {mb.syncPercent == null && (
              <p className="mt-2 text-sm text-gray-700">
                <strong className="text-indigo-700">
                  {formatCount(mb.syncedMessages)}
                </strong>{" "}
                messages synced in app
              </p>
            )}

            <p className="mt-2 text-xs text-gray-500">{mb.coverageLabel}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
