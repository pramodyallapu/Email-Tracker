import type { CompanyStatRow } from "@/lib/metrics/companies";
import Link from "next/link";

export function CompanyReportTable({
  rows,
  dateFiltered = false,
}: {
  rows: CompanyStatRow[];
  dateFiltered?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="font-medium text-gray-700">No company activity yet</p>
        <p className="mt-2 text-sm text-gray-500">
          {dateFiltered
            ? "No threads with company contact activity in the selected date range."
            : "Threads appear here when the other party's email matches a contact you added in Settings."}
        </p>
        <Link
          href="/dashboard/settings"
          className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
        >
          Add companies →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm text-gray-900">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">
              Company
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">
              Contacts
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">
              Received
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">
              Sent
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">
              Threads
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">
              Replied
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">
              Not replied
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">
              Delayed
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row) => (
            <tr key={row.companyName} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-semibold text-gray-900">
                {row.companyName}
              </td>
              <td className="px-4 py-3 text-gray-600">{row.contactCount}</td>
              <td className="px-4 py-3 text-right text-blue-700">
                {row.emailsReceived}
              </td>
              <td className="px-4 py-3 text-right text-indigo-700">
                {row.emailsSent}
              </td>
              <td className="px-4 py-3 text-right">{row.threads}</td>
              <td className="px-4 py-3 text-right font-medium text-green-600">
                {row.replied}
              </td>
              <td className="px-4 py-3 text-right font-medium text-amber-600">
                {row.notReplied}
              </td>
              <td className="px-4 py-3 text-right font-medium text-red-600">
                {row.delayed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
