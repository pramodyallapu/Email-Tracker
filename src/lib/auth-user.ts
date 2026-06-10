import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveUserIdByEmail(
  email: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("resolveUserIdByEmail:", error.message);
    return null;
  }

  return data?.id ?? null;
}
