"use client";

import type { HeatmapBreakdown, HeatmapCell } from "@/lib/metrics/aggregator";
import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHourUtc(hour: number) {
  return `${String(hour).padStart(2, "0")}:00 UTC`;
}

export function HourlyHeatmap({ data }: { data: HeatmapCell[] }) {
  const maxHeat = Math.max(...data.map((h) => h.count), 1);
  const [selected, setSelected] = useState<{ hour: number; dow: number } | null>(
    null
  );
  const [breakdown, setBreakdown] = useState<HeatmapBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCell = useCallback(async (hour: number, dow: number, count: number) => {
    if (count === 0) return;

    setSelected({ hour, dow });
    setBreakdown(null);
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(
        `/api/analytics/heatmap-breakdown?hour=${hour}&dow=${dow}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load breakdown");
        return;
      }
      setBreakdown(json as HeatmapBreakdown);
    } catch {
      setError("Could not load breakdown");
    } finally {
      setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    setSelected(null);
    setBreakdown(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!selected) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, close]);

  const selectedLabel =
    selected != null
      ? `${DOW_LABELS[selected.dow]}, ${formatHourUtc(selected.hour)}`
      : "";

  return (
    <>
      <p className="mb-3 text-sm text-gray-500">
        Click a cell to see senders and emails for that hour (last 90 days, UTC).
      </p>
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-1"
          style={{ gridTemplateColumns: "auto repeat(24, 1fr)" }}
        >
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="text-center text-[10px] font-medium text-gray-500"
            >
              {h}
            </div>
          ))}
          {DOW_LABELS.map((label, dow) => (
            <div key={dow} className="contents">
              <div className="pr-2 text-xs font-medium text-gray-600">
                {label}
              </div>
              {Array.from({ length: 24 }, (_, hour) => {
                const cell = data.find((c) => c.hour === hour && c.dow === dow);
                const count = cell?.count ?? 0;
                const intensity = count / maxHeat;
                const isSelected =
                  selected?.hour === hour && selected?.dow === dow;

                return (
                  <button
                    key={`${dow}-${hour}`}
                    type="button"
                    disabled={count === 0}
                    onClick={() => openCell(hour, dow, count)}
                    className={`h-6 w-6 rounded-sm border transition ${
                      count > 0
                        ? "cursor-pointer border-gray-200 hover:ring-2 hover:ring-indigo-400 hover:ring-offset-1"
                        : "cursor-default border-gray-100"
                    } ${isSelected ? "ring-2 ring-indigo-500 ring-offset-1" : ""}`}
                    style={{
                      backgroundColor: `rgba(79, 70, 229, ${0.08 + intensity * 0.92})`,
                    }}
                    title={
                      count > 0
                        ? `${count} emails — click for breakdown`
                        : "No emails"
                    }
                    aria-label={`${label} ${formatHourUtc(hour)}: ${count} emails`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal
          aria-label="Heatmap breakdown"
          onClick={close}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900">
                    {selectedLabel}
                  </h4>
                  <p className="mt-1 text-sm text-gray-500">
                    Inbound email activity in this hour slot
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="shrink-0 text-sm text-gray-500 hover:text-gray-900"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading && (
                <p className="text-sm text-gray-500">Loading breakdown…</p>
              )}
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              {breakdown && !loading && (
                <div className="space-y-6">
                  <div className="rounded-lg bg-indigo-50 px-4 py-3">
                    <p className="text-2xl font-bold text-indigo-700">
                      {breakdown.count}
                    </p>
                    <p className="text-sm text-indigo-600">
                      emails received in this slot (last 90 days)
                    </p>
                  </div>

                  {breakdown.topSenders.length > 0 && (
                    <div>
                      <h5 className="mb-2 text-sm font-semibold text-gray-900">
                        Top senders
                      </h5>
                      <ul className="space-y-2">
                        {breakdown.topSenders.map((s) => (
                          <li
                            key={s.email}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="truncate text-gray-800">
                              {s.name ?? s.email}
                            </span>
                            <span className="shrink-0 font-medium text-gray-600">
                              {s.count}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {breakdown.recentEmails.length > 0 && (
                    <div>
                      <h5 className="mb-2 text-sm font-semibold text-gray-900">
                        Recent emails
                      </h5>
                      <ul className="divide-y divide-gray-100">
                        {breakdown.recentEmails.map((e, i) => (
                          <li key={`${e.received_at}-${i}`} className="py-2.5">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {e.subject ?? "(no subject)"}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-gray-500">
                              {e.from_name ?? e.from_address}
                              {" · "}
                              {format(new Date(e.received_at), "MMM d, yyyy HH:mm")}
                              {e.provider ? ` · ${e.provider}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                      {breakdown.count > breakdown.recentEmails.length && (
                        <p className="mt-2 text-xs text-gray-400">
                          Showing {breakdown.recentEmails.length} of{" "}
                          {breakdown.count} emails
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
