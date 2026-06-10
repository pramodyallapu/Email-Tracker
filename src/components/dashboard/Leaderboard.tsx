"use client";

import type { TeamMemberStats } from "@/types/email";
import { Crown, TrendingDown, TrendingUp } from "lucide-react";
import { formatReplyTime } from "@/lib/metrics/reply-time";
import Image from "next/image";

export function Leaderboard({ members }: { members: TeamMemberStats[] }) {
  if (members.length === 0) {
    return (
      <p className="py-8 text-center text-gray-500">
        No team members yet. Invite someone to get started.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Rank
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Avg reply
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Reply rate
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Today
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Streak
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {members.map((m) => (
            <tr key={m.userId} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-bold text-gray-900">
                <span className="flex items-center gap-1">
                  {m.rank === 1 && (
                    <Crown className="h-4 w-4 text-amber-500" aria-label="First place" />
                  )}
                  #{m.rank}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {m.avatarUrl && (
                    <Image
                      src={m.avatarUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded-full"
                    />
                  )}
                  <span className="text-sm font-medium">{m.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {m.avgReplyTimeSecs != null
                  ? formatReplyTime(m.avgReplyTimeSecs)
                  : "—"}
              </td>
              <td className="px-4 py-3 text-sm">
                <span className="flex items-center gap-1">
                  {m.replyRate}%
                  {m.replyRate >= 80 ? (
                    <TrendingUp className="h-3 w-3 text-green-500" aria-hidden />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-400" aria-hidden />
                  )}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{m.emailsToday}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{m.streak}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
