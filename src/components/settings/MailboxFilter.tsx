"use client";

import { useRouter, useSearchParams } from "next/navigation";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("mailbox") ?? "";

  if (mailboxes.length === 0) return null;

  const active =
    mailboxes.find(
      (m) => m.id === current || m.email.toLowerCase() === current.toLowerCase()
    ) ?? null;

  const selectValue = active?.email ?? "";

  function navigate(mailbox: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (mailbox) params.set("mailbox", mailbox);
    else params.delete("mailbox");
    params.delete("page");
    const q = params.toString();
    router.push(q ? `${basePath}?${q}` : basePath);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="mailbox-filter" className="text-sm text-gray-500">
        Mailbox
      </label>
      <select
        id="mailbox-filter"
        value={selectValue}
        onChange={(e) => {
          const value = e.target.value;
          navigate(value || null);
        }}
        className="min-w-[220px] max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">All mailboxes ({mailboxes.length})</option>
        {mailboxes.map((mb) => (
          <option key={mb.id} value={mb.email}>
            {mb.email}
          </option>
        ))}
      </select>
    </div>
  );
}
