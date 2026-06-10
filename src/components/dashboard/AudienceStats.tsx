import type { AudienceStats } from "@/lib/metrics/audience";
import Link from "next/link";

function BucketCard({
  title,
  tone,
  bucket,
}: {
  title: string;
  tone: "emerald" | "indigo";
  bucket: AudienceStats["internal"];
}) {
  const border = tone === "emerald" ? "border-emerald-200" : "border-indigo-200";
  const heading = tone === "emerald" ? "text-emerald-800" : "text-indigo-800";
  const muted = tone === "emerald" ? "text-emerald-600" : "text-indigo-600";

  return (
    <div className={`rounded-xl border ${border} bg-white p-5`}>
      <h3 className={`text-lg font-semibold ${heading}`}>{title}</h3>
      <p className={`mt-1 text-sm ${muted}`}>{bucket.total} threads tracked</p>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs font-medium uppercase text-gray-500">Replied</dt>
          <dd className="mt-1 text-2xl font-bold text-green-600">
            {bucket.replied}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-gray-500">
            Not replied
          </dt>
          <dd className="mt-1 text-2xl font-bold text-amber-600">
            {bucket.notReplied}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-gray-500">Delayed</dt>
          <dd className="mt-1 text-2xl font-bold text-red-600">
            {bucket.delayed}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function AudienceStatsPanel({ stats }: { stats: AudienceStats }) {
  if (stats.domainsConfigured === 0) {
    return (
      <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Internal vs external
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Add internal domains in Settings to split replied, not replied, and
          delayed threads by internal and external mail.
        </p>
        <Link
          href="/dashboard/settings"
          className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
        >
          Configure domains →
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Internal vs external
        </h3>
        <p className="text-sm text-gray-500">
          Based on counterparty domain · {stats.domainsConfigured} internal
          domain{stats.domainsConfigured === 1 ? "" : "s"} configured
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <BucketCard title="Internal" tone="emerald" bucket={stats.internal} />
        <BucketCard title="External" tone="indigo" bucket={stats.external} />
      </div>
    </section>
  );
}
