"use client";

import { DateRangeFilter } from "@/components/filters/DateRangeFilter";

export function InboxDateFilter({
  startDate,
  endDate,
}: {
  startDate?: string;
  endDate?: string;
}) {
  return (
    <DateRangeFilter
      basePath="/dashboard/inbox"
      startDate={startDate}
      endDate={endDate}
      resetPageParam
      hint="Optional. Leave blank for all threads. Filters by last message date in the selected range."
    />
  );
}
