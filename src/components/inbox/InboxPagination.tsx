import Link from "next/link";

export const INBOX_PAGE_SIZE = 200;

export function buildInboxHref(
  page: number,
  options?: { from?: string; to?: string; mailbox?: string }
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (options?.from) params.set("from", options.from);
  if (options?.to) params.set("to", options.to);
  if (options?.mailbox) params.set("mailbox", options.mailbox);
  const query = params.toString();
  return query ? `/dashboard/inbox?${query}` : "/dashboard/inbox";
}

export function InboxPagination({
  page,
  total,
  pageSize = INBOX_PAGE_SIZE,
  startDate,
  endDate,
  mailbox,
}: {
  page: number;
  total: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  mailbox?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  const dateOpts = { from: startDate, to: endDate, mailbox };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
      <p className="text-sm text-gray-500">
        {total === 0
          ? "No threads"
          : `Showing ${start}–${end} of ${total} threads`}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {safePage > 1 ? (
            <Link
              href={buildInboxHref(safePage - 1, dateOpts)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous
            </Link>
          ) : (
            <span className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-300">
              Previous
            </span>
          )}
          <span className="text-sm text-gray-600">
            Page {safePage} of {totalPages}
          </span>
          {safePage < totalPages ? (
            <Link
              href={buildInboxHref(safePage + 1, dateOpts)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-300">
              Next
            </span>
          )}
        </div>
      )}
    </div>
  );
}
