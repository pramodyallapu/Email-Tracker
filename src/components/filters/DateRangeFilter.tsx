"use client";

import { Button } from "@/components/ui/Button";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function DateRangeFilter({
  basePath,
  startDate,
  endDate,
  hint,
  resetPageParam = false,
}: {
  basePath: string;
  startDate?: string;
  endDate?: string;
  hint?: string;
  resetPageParam?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(startDate ?? "");
  const [to, setTo] = useState(endDate ?? "");

  const navigate = (nextFrom: string, nextTo: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (resetPageParam) params.delete("page");
    if (nextFrom) params.set("from", nextFrom);
    else params.delete("from");
    if (nextTo) params.set("to", nextTo);
    else params.delete("to");
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  };

  const apply = () => navigate(from, to);

  const clear = () => {
    setFrom("");
    setTo("");
    navigate("", "");
  };

  const active = Boolean(startDate || endDate);
  const idPrefix = basePath.replace(/\//g, "-");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label
            htmlFor={`${idPrefix}-from-date`}
            className="mb-1 block text-xs font-medium text-gray-600"
          >
            Start date
          </label>
          <input
            id={`${idPrefix}-from-date`}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div>
          <label
            htmlFor={`${idPrefix}-to-date`}
            className="mb-1 block text-xs font-medium text-gray-600"
          >
            End date
          </label>
          <input
            id={`${idPrefix}-to-date`}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <Button size="sm" onClick={apply}>
          Apply
        </Button>
        {active && (
          <button
            type="button"
            onClick={clear}
            className="pb-2 text-sm text-gray-600 hover:text-gray-900 hover:underline"
          >
            Clear dates
          </button>
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
