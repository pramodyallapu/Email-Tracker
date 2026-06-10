import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { addHours } from "date-fns";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, teamId } = (await request.json()) as {
    email: string;
    teamId: string;
  };

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("role, team_id")
    .eq("id", session.user.id)
    .single();

  if (!user || user.team_id !== teamId || !["owner", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const expiresAt = addHours(new Date(), 48).toISOString();
  const { data: invite, error } = await supabase
    .from("team_invites")
    .insert({
      team_id: teamId,
      email,
      expires_at: expiresAt,
    })
    .select("token")
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const link = `${baseUrl}/join?token=${invite.token}`;

  if (process.env.RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: email,
        subject: "You're invited to Email Tracker",
        html: `<p>Join your team: <a href="${link}">${link}</a></p>`,
      }),
    });
  } else {
    console.log("Team invite link:", link);
  }

  return NextResponse.json({ link, token: invite.token });
}
