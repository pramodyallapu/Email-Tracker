import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "team";
}

async function uniqueSlug(supabase: ReturnType<typeof createAdminClient>, name: string) {
  const base = slugify(name);
  let slug = base;
  let attempt = 0;

  while (attempt < 5) {
    const { data } = await supabase
      .from("teams")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) return slug;

    attempt += 1;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  return `${base}-${Date.now().toString(36)}`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = (await request.json()) as { name?: string };
  const trimmed = name?.trim();

  if (!trimmed || trimmed.length < 2) {
    return NextResponse.json(
      { error: "Team name must be at least 2 characters" },
      { status: 400 }
    );
  }

  if (trimmed.length > 60) {
    return NextResponse.json(
      { error: "Team name must be 60 characters or less" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("team_id")
    .eq("id", session.user.id)
    .single();

  if (user?.team_id) {
    return NextResponse.json(
      { error: "You are already on a team" },
      { status: 409 }
    );
  }

  const slug = await uniqueSlug(supabase, trimmed);

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .insert({
      name: trimmed,
      slug,
      owner_id: session.user.id,
    })
    .select("id, name")
    .single();

  if (teamError || !team) {
    const message = teamError?.message ?? "Could not create team";
    const hint = message.includes("teams")
      ? "Run sql/teams.sql in Supabase first."
      : undefined;
    return NextResponse.json({ error: message, hint }, { status: 500 });
  }

  const { error: userError } = await supabase
    .from("users")
    .update({ team_id: team.id, role: "owner" })
    .eq("id", session.user.id);

  if (userError) {
    await supabase.from("teams").delete().eq("id", team.id);
    return NextResponse.json(
      { error: userError.message ?? "Could not join team" },
      { status: 500 }
    );
  }

  revalidatePath("/dashboard/team");

  return NextResponse.json({ team });
}
