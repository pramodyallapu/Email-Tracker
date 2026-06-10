import { unstable_noStore as noStore } from "next/cache";
import {
  getEmailsForThread,
  type ThreadEmail,
} from "@/lib/mail/classify-audience";
import {
  buildContactIndex,
  getCompanyContacts,
  resolveCompanyInThread,
  type CompanyContact,
} from "@/lib/mail/company-contacts";
import { getMailboxEmails } from "@/lib/mail/mailboxes";
import { resolveMailScope } from "@/lib/mail/scope";
import { resolveIsSent } from "@/lib/mail/sent";
import {
  fetchEmailsPaginated,
  fetchThreadsPaginated,
} from "@/lib/metrics/emails-query";
import {
  describeReportDateRange,
  parseReportDateParam,
  resolveReportDateBounds,
  type ReportDateFilter,
} from "@/lib/metrics/report-date";
import { threadRowToSummary } from "@/lib/metrics/reply-time";
import type { ThreadSummary } from "@/types/email";

export type CompanyStatRow = {
  companyName: string;
  contactCount: number;
  threads: number;
  replied: number;
  notReplied: number;
  delayed: number;
  emailsReceived: number;
  emailsSent: number;
};

export type CompanyReportDateFilter = ReportDateFilter;

export { parseReportDateParam };

const EMAIL_SELECT =
  "provider, gmail_thread_id, from_address, to_addresses, cc_addresses, is_sent, labels, received_at";

function emptyRow(companyName: string, contactCount: number): CompanyStatRow {
  return {
    companyName,
    contactCount,
    threads: 0,
    replied: 0,
    notReplied: 0,
    delayed: 0,
    emailsReceived: 0,
    emailsSent: 0,
  };
}

function threadKey(
  provider: string | null | undefined,
  gmailThreadId: string
): string {
  return `${provider ?? "google"}:${gmailThreadId}`;
}

function emailInRange(
  receivedAt: string | undefined,
  bounds: { start?: string; end: string }
): boolean {
  if (!receivedAt) return false;
  const t = new Date(receivedAt).getTime();
  if (bounds.start && t < new Date(bounds.start).getTime()) return false;
  return t <= new Date(bounds.end).getTime();
}

function mapThreadsToCompanies(
  emails: ThreadEmail[],
  mailboxEmails: string[],
  contactIndex: Map<string, CompanyContact>
): Map<string, CompanyContact> {
  const map = new Map<string, CompanyContact>();

  for (const email of emails) {
    const key = threadKey(email.provider, email.gmail_thread_id);
    if (map.has(key)) continue;

    const match = resolveCompanyInThread([email], null, mailboxEmails, contactIndex);
    if (match) map.set(key, match);
  }

  return map;
}

function tallyThread(
  summary: ThreadSummary,
  row: CompanyStatRow,
  emailsInScope: ThreadEmail[],
  mailboxEmails: string[]
) {
  row.threads += 1;

  if (summary.isReplied) row.replied += 1;
  else if (summary.slaStatus === "breach") row.delayed += 1;
  else row.notReplied += 1;

  for (const e of emailsInScope) {
    if (resolveIsSent(e, mailboxEmails)) row.emailsSent += 1;
    else row.emailsReceived += 1;
  }
}

export async function getCompanyReportStats(
  userId: string,
  thresholdHours = 24,
  dateFilter?: CompanyReportDateFilter
): Promise<{
  rows: CompanyStatRow[];
  contactsCount: number;
  companiesCount: number;
  dateRange: { startDate?: string; endDate?: string } | null;
}> {
  noStore();

  const contacts = await getCompanyContacts(userId);
  if (contacts.length === 0) {
    return { rows: [], contactsCount: 0, companiesCount: 0, dateRange: null };
  }

  const bounds = resolveReportDateBounds(dateFilter);
  const dateRange = describeReportDateRange(dateFilter);

  const scope = await resolveMailScope(userId);
  const mailboxEmails = await getMailboxEmails(scope);
  const contactIndex = buildContactIndex(contacts);

  const contactCountByCompany = new Map<string, number>();
  for (const c of contacts) {
    contactCountByCompany.set(
      c.companyName,
      (contactCountByCompany.get(c.companyName) ?? 0) + 1
    );
  }

  const [threadRows, emailRows] = await Promise.all([
    fetchThreadsPaginated(scope, { select: "*", archived: false }),
    fetchEmailsPaginated(scope, {
      select: EMAIL_SELECT,
      orderAsc: true,
      since: bounds?.start,
    }),
  ]);

  let emails = emailRows as ThreadEmail[];
  if (bounds) {
    emails = emails.filter((e) => emailInRange(e.received_at, bounds));
  }

  const threads = threadRows as Array<
    Record<string, unknown> & {
      id: string;
      provider?: string;
      gmail_thread_id: string;
      participants?: string[];
    }
  >;

  const emailsByThread = new Map<string, ThreadEmail[]>();
  for (const e of emails) {
    const key = threadKey(e.provider, e.gmail_thread_id);
    const list = emailsByThread.get(key) ?? [];
    list.push(e);
    emailsByThread.set(key, list);
  }

  const threadCompanyMap = mapThreadsToCompanies(
    emails,
    mailboxEmails,
    contactIndex
  );

  const stats = new Map<string, CompanyStatRow>();
  for (const [companyName, contactCount] of Array.from(
    contactCountByCompany.entries()
  )) {
    stats.set(companyName, emptyRow(companyName, contactCount));
  }

  for (const row of threads) {
    const key = threadKey(row.provider, row.gmail_thread_id);
    let company = threadCompanyMap.get(key);

    const threadEmails = getEmailsForThread(row, emails, emailsByThread);

    if (bounds && threadEmails.length === 0) continue;

    if (!company) {
      company =
        resolveCompanyInThread(
          threadEmails,
          row.participants,
          mailboxEmails,
          contactIndex
        ) ?? undefined;
    }

    if (!company) continue;

    threadCompanyMap.set(key, company);

    const bucket = stats.get(company.companyName);
    if (!bucket) continue;

    const summary = threadRowToSummary(
      row as Parameters<typeof threadRowToSummary>[0],
      thresholdHours
    );
    tallyThread(summary, bucket, threadEmails, mailboxEmails);
  }

  const rows = Array.from(stats.values()).sort(
    (a, b) =>
      b.threads - a.threads ||
      b.emailsReceived - a.emailsReceived ||
      a.companyName.localeCompare(b.companyName)
  );

  return {
    rows,
    contactsCount: contacts.length,
    companiesCount: contactCountByCompany.size,
    dateRange,
  };
}
