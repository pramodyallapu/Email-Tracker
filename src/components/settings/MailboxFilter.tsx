"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export type MailboxFilterOption = {
  id: string;
  email: string;
};

export function MailboxFilter({
  mailboxes,
  basePath,
}: {
  mailboxes: MailboxFilterOption[];
  basePath: string;
}) {
  const searchParams = useSearchParams();
  const current = searchParams.get("mailbox") ?? "";

  if (mailboxes.length === 0) return null;

  function hrefFor(mailbox: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (mailbox) params.set("mailbox", mailbox);
    else params.delete("mailbox");
    params.delete("page");
    const q = params.toString();
    return q ? `${basePath}?${q}` : basePath;
  }

  const activeEmail =
    mailboxes.find(
      (m) => m.id === current || m.email.toLowerCase() === current.toLowerCase()
    )?.email ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-gray-500">Mailbox:</span>
      <Link
        href={hrefFor(null)}
        className={`rounded-full px-3 py-1 text-sm ${
          !current
            ? "bg-indigo-600 text-white"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        All ({mailboxes.length})
      </Link>
      {mailboxes.map((mb) => {
        const isActive =
          current === mb.id ||
          current.toLowerCase() === mb.email.toLowerCase();
        return (
          <Link
            key={mb.id}
            href={hrefFor(mb.email)}
            className={`rounded-full px-3 py-1 text-sm ${
              isActive
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {mb.email}
          </Link>
        );
      })}
      {activeEmail && (
        <span className="text-xs text-gray-400">
          Showing metrics for {activeEmail} only
        </span>
      )}
    </div>
  );
}
