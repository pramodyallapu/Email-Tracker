import { Leaderboard } from "@/components/dashboard/Leaderboard";
import { CreateTeamForm } from "@/components/team/CreateTeamForm";
import { TeamInviteButton } from "@/components/team/TeamInviteButton";
import { auth } from "@/lib/auth";
import { getTeamLeaderboard } from "@/lib/metrics/team";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export default async function TeamPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("team_id, role")
    .eq("id", session.user.id)
    .single();

  if (!user?.team_id) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Team</h2>
          <p className="text-gray-500">
            Create a team or accept an invite to see the leaderboard.
          </p>
        </div>
        <CreateTeamForm />
      </div>
    );
  }

  const { data: team } = await supabase
    .from("teams")
    .select("name, id")
    .eq("id", user.team_id)
    .single();

  const leaderboard = await getTeamLeaderboard(user.team_id);

  const totalEmails = leaderboard.reduce((s, m) => s + m.emailsToday, 0);
  const avgReplyRate =
    leaderboard.length > 0
      ? Math.round(
          leaderboard.reduce((s, m) => s + m.replyRate, 0) / leaderboard.length
        )
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{team?.name ?? "Team"}</h2>
          <p className="text-gray-500">Leaderboard and team performance</p>
        </div>
        {["owner", "admin"].includes(user.role) && team && (
          <TeamInviteButton teamId={team.id} />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Emails today (team)</p>
          <p className="text-2xl font-bold">{totalEmails}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Avg reply rate</p>
          <p className="text-2xl font-bold">{avgReplyRate}%</p>
        </div>
      </div>

      <Leaderboard members={leaderboard} />
    </div>
  );
}
