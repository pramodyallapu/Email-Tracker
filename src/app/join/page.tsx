import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-600">Invalid invite link.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const supabase = createAdminClient();
  const { data: invite } = await supabase
    .from("team_invites")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!invite) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-600">This invite is expired or already used.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/join?token=${token}`)}`);
  }

  await supabase
    .from("users")
    .update({ team_id: invite.team_id })
    .eq("id", session.user.id);

  await supabase
    .from("team_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  redirect("/dashboard/team");
}
