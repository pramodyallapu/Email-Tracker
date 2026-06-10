import { CompanyDateFilter } from "@/components/reports/CompanyDateFilter";
import { CompanyReportTable } from "@/components/reports/CompanyReportTable";
import { auth } from "@/lib/auth";
import {
  getCompanyReportStats,
  parseReportDateParam,
} from "@/lib/metrics/companies";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { requireOrganization } from "@/lib/org/require-org";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");
  await requireOrganization(session.user.id);

  const params = await searchParams;
  const startDate = parseReportDateParam(params.from);
  const endDate = parseReportDateParam(params.to);

  const supabase = createAdminClient();
  const { data: slaConfig } = await supabase
    .from("sla_configs")
    .select("threshold_hours")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { rows, contactsCount, companiesCount, dateRange } =
    await getCompanyReportStats(session.user.id, slaConfig?.threshold_hours ?? 24, {
      startDate,
      endDate,
    });

  const totals = rows.reduce(
    (acc, r) => ({
      received: acc.received + r.emailsReceived,
      sent: acc.sent + r.emailsSent,
      threads: acc.threads + r.threads,
      replied: acc.replied + r.replied,
      notReplied: acc.notReplied + r.notReplied,
      delayed: acc.delayed + r.delayed,
    }),
    {
      received: 0,
      sent: 0,
      threads: 0,
      replied: 0,
      notReplied: 0,
      delayed: 0,
    }
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Companies</h2>
        <p className="text-gray-500">
          Per-company received, sent, and reply statistics
        </p>
        {dateRange && (
          <p className="mt-1 text-sm text-indigo-700">
            Filtered:{" "}
            {dateRange.startDate
              ? formatDisplayDate(dateRange.startDate)
              : "beginning"}{" "}
            →{" "}
            {dateRange.endDate
              ? formatDisplayDate(dateRange.endDate)
              : "today"}
          </p>
        )}
      </div>

      {companiesCount === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <p className="text-lg font-medium text-gray-700">
            No companies configured
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Add a company name and contact emails in Settings, for example{" "}
            <code>TherapyPMS</code> with <code>john@therapypms.com</code>
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Configure in Settings
          </Link>
        </div>
      ) : (
        <>
          <Suspense fallback={null}>
            <CompanyDateFilter startDate={startDate} endDate={endDate} />
          </Suspense>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Companies tracked</p>
              <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Emails received</p>
              <p className="text-2xl font-bold text-blue-700">{totals.received}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Replied threads</p>
              <p className="text-2xl font-bold text-green-600">{totals.replied}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Not replied / delayed</p>
              <p className="text-2xl font-bold text-amber-600">
                {totals.notReplied}{" "}
                <span className="text-base font-normal text-gray-400">/</span>{" "}
                <span className="text-red-600">{totals.delayed}</span>
              </p>
            </div>
          </div>

          <CompanyReportTable rows={rows} dateFiltered={Boolean(dateRange)} />

          <p className="text-sm text-gray-500">
            {contactsCount} contact{contactsCount === 1 ? "" : "s"} across{" "}
            {companiesCount} {companiesCount === 1 ? "company" : "companies"} in
            Settings ·{" "}
            <Link href="/dashboard/settings" className="text-indigo-600 hover:underline">
              Edit mappings
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
