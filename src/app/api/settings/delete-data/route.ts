import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const userId = session.user.id;

  await supabase.from("emails").delete().eq("user_id", userId);
  await supabase.from("threads").delete().eq("user_id", userId);
  await supabase.from("metrics_daily").delete().eq("user_id", userId);
  await supabase.from("sla_breaches").delete().eq("user_id", userId);
  await supabase
    .from("users")
    .update({ gmail_history_id: null })
    .eq("id", userId);

  revalidatePath("/dashboard");

  return NextResponse.json({ success: true });
}
