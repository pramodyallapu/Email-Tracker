import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TeamMemberStats } from "@/types/email";
import { format, subDays } from "date-fns";

export const getTeamLeaderboard = cache(
  async (teamId: string): Promise<TeamMemberStats[]> => {
    const supabase = createAdminClient();
    const today = format(new Date(), "yyyy-MM-dd");
    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

    const { data: members } = await supabase
      .from("users")
      .select("id, name, email, avatar_url")
      .eq("team_id", teamId);

    if (!members?.length) return [];

    const stats: TeamMemberStats[] = [];

    for (const member of members) {
      const { data: todayMetrics } = await supabase
        .from("metrics_daily")
        .select("reply_rate, avg_reply_time_sec, total_received, total_sent")
        .eq("user_id", member.id)
        .eq("date", today)
        .maybeSingle();

      const { data: history } = await supabase
        .from("metrics_daily")
        .select("date, reply_rate")
        .eq("user_id", member.id)
        .gte("date", thirtyDaysAgo)
        .order("date", { ascending: true });

      let streak = 0;
      let current = 0;
      for (const day of history ?? []) {
        if (Number(day.reply_rate) > 80) {
          current += 1;
          streak = Math.max(streak, current);
        } else {
          current = 0;
        }
      }

      stats.push({
        userId: member.id,
        name: member.name ?? member.email,
        email: member.email,
        avatarUrl: member.avatar_url,
        avgReplyTimeSecs: todayMetrics?.avg_reply_time_sec ?? null,
        replyRate: Number(todayMetrics?.reply_rate ?? 0),
        emailsToday:
          (todayMetrics?.total_received ?? 0) +
          (todayMetrics?.total_sent ?? 0),
        streak,
        rank: 0,
      });
    }

    stats.sort((a, b) => b.replyRate - a.replyRate);
    return stats.map((s, i) => ({ ...s, rank: i + 1 }));
  }
);
