"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusBadge, type InboxStatus } from "@/components/inbox/StatusBadge";
import { counterpartyLabel } from "@/lib/mail/rebuild-threads";
import {
  buildMailMessageUrl,
  mailProviderLabel,
} from "@/lib/mail/message-links";
import type { ThreadSummary } from "@/types/email";
import { formatReplyTime } from "@/lib/metrics/reply-time";
import { format, formatDistanceToNow } from "date-fns";
import { ExternalLink } from "lucide-react";

type ThreadMessage = {
  gmail_message_id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  is_sent: boolean;
  received_at: string;
};

type SortKey = "newest" | "oldest" | "longest_wait";
type FilterKey =
  | "all"
  | "replied"
  | "pending"
  | "overdue"
  | "internal"
  | "external";

function statusFromThread(thread: ThreadSummary): InboxStatus {
  if (thread.isReplied) return "replied";
  if (thread.slaStatus === "breach") return "breach";
  return "pending";
}

function waitingSecs(thread: ThreadSummary): number {
  const start = thread.firstReceivedAt ?? thread.lastMessageAt;
  return Math.max(0, Math.round((Date.now() - new Date(start).getTime()) / 1000));
}

function messageSender(msg: ThreadMessage): string {
  return msg.from_name?.trim() || msg.from_address;
}

export function ThreadTable({
  threads,
  userEmails = [],
  audienceByThreadId = {},
  mailboxByThreadId = {},
  showMailboxColumn = false,
}: {
  threads: ThreadSummary[];
  userEmails?: string[];
  audienceByThreadId?: Record<string, "internal" | "external">;
  mailboxByThreadId?: Record<string, string>;
  showMailboxColumn?: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ThreadSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailCount, setDetailCount] = useState<number | null>(null);
  const [gmailCount, setGmailCount] = useState<number | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [zohoDc, setZohoDc] = useState<string | null>(null);

  const selectedId = selected?.id;
  const selectedMessageCount = selected?.messageCount;

  useEffect(() => {
    if (!selectedId) {
      setDetailLoading(false);
      setDetailError(null);
      setDetailCount(null);
      setGmailCount(null);
      setThreadMessages([]);
      setZohoDc(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetailCount(null);
    setGmailCount(null);
    setThreadMessages([]);
    setZohoDc(null);

    fetch(`/api/threads/${selectedId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load thread");
        }
        if (cancelled) return;
        setDetailCount(data.messageCount ?? selectedMessageCount);
        setGmailCount(
          typeof data.gmailTotal === "number" ? data.gmailTotal : null
        );
        setThreadMessages((data.messages as ThreadMessage[] | undefined) ?? []);
        setZohoDc(typeof data.zohoDc === "string" ? data.zohoDc : null);
        if (data.thread) {
          setSelected(data.thread as ThreadSummary);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setDetailError(err.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedMessageCount]);

  const filtered = useMemo(() => {
    let list = [...threads];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.participants.some((p) => p.toLowerCase().includes(q))
      );
    }

    if (filter === "replied") list = list.filter((t) => t.isReplied);
    if (filter === "pending") list = list.filter((t) => !t.isReplied);
    if (filter === "overdue")
      list = list.filter((t) => t.slaStatus === "breach" && !t.isReplied);
    if (filter === "internal")
      list = list.filter((t) => audienceByThreadId[t.id] === "internal");
    if (filter === "external")
      list = list.filter((t) => audienceByThreadId[t.id] === "external");

    list.sort((a, b) => {
      if (sort === "oldest")
        return (
          new Date(a.lastMessageAt).getTime() -
          new Date(b.lastMessageAt).getTime()
        );
      if (sort === "longest_wait") return waitingSecs(b) - waitingSecs(a);
      return (
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime()
      );
    });

    return list;
  }, [threads, filter, sort, search, audienceByThreadId]);

  const sender = (t: ThreadSummary) =>
    counterpartyLabel(t.participants, userEmails);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search threads…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Search threads"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterKey)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Filter threads"
        >
          <option value="all">All</option>
          <option value="replied">Replied</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="internal">Internal</option>
          <option value="external">External</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Sort threads"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="longest_wait">Longest wait</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Source
              </th>
              {showMailboxColumn && (
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 lg:table-cell">
                  Mailbox
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Sender
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Subject
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 sm:table-cell">
                Received
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Status
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 md:table-cell">
                Reply time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={showMailboxColumn ? 8 : 7}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  Your inbox is clear!
                </td>
              </tr>
            ) : (
              filtered.map((thread) => {
                const status = statusFromThread(thread);
                return (
                  <tr
                    key={thread.id}
                    className="cursor-pointer hover:bg-gray-50 focus-within:bg-gray-50"
                    onClick={() => setSelected(thread)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && setSelected(thread)
                    }
                    tabIndex={0}
                    role="button"
                    aria-label={`Open thread ${thread.subject}`}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          audienceByThreadId[thread.id] === "internal"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {audienceByThreadId[thread.id] === "internal"
                          ? "Internal"
                          : "External"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          thread.provider === "zoho"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {thread.provider === "zoho" ? "Zoho" : "Gmail"}
                      </span>
                    </td>
                    {showMailboxColumn && (
                      <td className="hidden max-w-[10rem] truncate px-4 py-3 text-sm text-gray-600 lg:table-cell">
                        {mailboxByThreadId[thread.id] ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-900">{sender(thread)}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-sm font-medium text-gray-900">
                      {thread.subject}
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-gray-500 sm:table-cell">
                      {formatDistanceToNow(new Date(thread.lastMessageAt), {
                        addSuffix: true,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={status}
                        replyTimeSecs={thread.replyTimeSecs}
                        waitingSecs={
                          !thread.isReplied ? waitingSecs(thread) : undefined
                        }
                      />
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-gray-600 md:table-cell">
                      {thread.replyTimeSecs != null
                        ? formatReplyTime(thread.replyTimeSecs)
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          role="dialog"
          aria-modal
          aria-label="Thread detail"
        >
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
            <button
              type="button"
              className="mb-4 text-sm text-gray-500 hover:text-gray-900"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
            <h3 className="text-lg font-semibold">{selected.subject}</h3>
            <p className="mt-2 text-sm text-gray-500">
              {selected.participants.join(", ")}
            </p>
            <p className="mt-4 text-sm">
              Messages:{" "}
              {detailLoading
                ? "Loading…"
                : (detailCount ?? selected.messageCount)}
              {gmailCount != null &&
                !detailLoading &&
                gmailCount !== (detailCount ?? selected.messageCount) && (
                  <span className="text-amber-600">
                    {" "}
                    (Gmail reports {gmailCount})
                  </span>
                )}
            </p>
            {detailError && (
              <p className="mt-2 text-sm text-red-600">{detailError}</p>
            )}
            {selected.replyTimeSecs != null && (
              <p className="text-sm">
                Reply time: {formatReplyTime(selected.replyTimeSecs)}
              </p>
            )}

            <div className="mt-6 border-t border-gray-200 pt-4">
              <h4 className="text-sm font-semibold text-gray-900">
                Thread messages
              </h4>
              {detailLoading ? (
                <p className="mt-3 text-sm text-gray-500">Loading messages…</p>
              ) : threadMessages.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">No messages found.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {threadMessages.map((msg) => {
                    const href = buildMailMessageUrl({
                      provider: selected.provider,
                      messageId: msg.gmail_message_id,
                      threadId: selected.gmailThreadId,
                      zohoDc,
                    });
                    const providerLabel = mailProviderLabel(selected.provider);

                    return (
                      <li key={msg.gmail_message_id}>
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group block rounded-lg border border-gray-200 bg-gray-50 p-3 transition hover:border-indigo-300 hover:bg-indigo-50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700">
                              {msg.subject?.trim() || "(no subject)"}
                            </p>
                            <span className="flex shrink-0 items-center gap-1">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  msg.is_sent
                                    ? "bg-indigo-100 text-indigo-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {msg.is_sent ? "Sent" : "Received"}
                              </span>
                              <ExternalLink
                                className="h-3.5 w-3.5 text-gray-400 group-hover:text-indigo-600"
                                aria-hidden
                              />
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-600">
                            {messageSender(msg)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {format(new Date(msg.received_at), "MMM d, yyyy · h:mm a")}
                            <span className="text-gray-400">
                              {" "}
                              ({formatDistanceToNow(new Date(msg.received_at), {
                                addSuffix: true,
                              })})
                            </span>
                          </p>
                          <p className="mt-2 text-xs font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100">
                            Open in {providerLabel} →
                          </p>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
