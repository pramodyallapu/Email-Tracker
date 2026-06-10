import { HourlyHeatmap } from "@/components/dashboard/HourlyHeatmap";
import { ReplyTimeChart } from "@/components/dashboard/ReplyTimeChart";
import { auth } from "@/lib/auth";
import {
  getHourlyHeatmap,
  getReplyTimeSeries,
  getTopSenders,
} from "@/lib/metrics/aggregator";
import { formatReplyTime } from "@/lib/metrics/reply-time";
import { requireOrganization } from "@/lib/org/require-org";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");
  await requireOrganization(session.user.id);

  const params = await searchParams;
  const range = params.range === "90" ? 90 : params.range === "30" ? 30 : 7;
  const userId = session.user.id;

  const [series, senders, heatmap] = await Promise.all([
    getReplyTimeSeries(userId, range),
    getTopSenders(userId, 10),
    getHourlyHeatmap(userId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
          <p className="text-gray-500">Reply patterns and volume insights</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Date range">
          {(["7", "30", "90"] as const).map((d) => (
            <Link
              key={d}
              href={`/dashboard/analytics?range=${d}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                String(range) === d
                  ? "bg-indigo-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      <ReplyTimeChart data={series} />

      <section className="rounded-xl border border-gray-200 bg-white p-6 text-gray-900">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Top senders</h3>
        {senders.length === 0 ? (
          <p className="text-sm text-gray-500">No email data yet.</p>
        ) : (
          <table className="min-w-full text-sm text-gray-900">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-2 font-medium">Sender</th>
                <th className="pb-2 font-medium">Count</th>
                <th className="pb-2 font-medium">Avg reply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {senders.map((s) => (
                <tr key={s.email} className="text-gray-800">
                  <td className="py-2 font-medium text-gray-900">
                    {s.name ?? s.email}
                  </td>
                  <td className="py-2 text-gray-700">{s.count}</td>
                  <td className="py-2 text-gray-700">
                    {s.avgReplySecs != null
                      ? formatReplyTime(s.avgReplySecs)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 text-gray-900">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Hour-of-day heatmap
        </h3>
        <HourlyHeatmap data={heatmap} />
      </section>
    </div>
  );
}
