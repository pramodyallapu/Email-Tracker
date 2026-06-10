"use client";

import { DateRangeFilter } from "@/components/filters/DateRangeFilter";

export function CompanyDateFilter({
  startDate,
  endDate,
}: {
  startDate?: string;
  endDate?: string;
}) {
  return (
    <DateRangeFilter
      basePath="/dashboard/companies"
      startDate={startDate}
      endDate={endDate}
      hint="Optional. Leave blank for all time. Counts include only emails received within the selected range; threads appear if they had activity in that period."
    />
  );
}
