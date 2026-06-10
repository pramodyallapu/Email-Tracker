import {
  configInsertRow,
  configScopeColumn,
  resolveMailScope,
} from "@/lib/mail/scope";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getActiveSlaConfig(userId: string) {
  const scope = await resolveMailScope(userId);
  const { column, value } = configScopeColumn(scope);
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sla_configs")
    .select("*")
    .eq(column, value)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return data;
}

export async function saveSlaConfig(
  userId: string,
  body: {
    thresholdHours: number;
    notifyEmail: boolean;
    notifyInapp: boolean;
  }
) {
  const scope = await resolveMailScope(userId);
  const { column, value } = configScopeColumn(scope);
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("sla_configs")
    .select("id")
    .eq(column, value)
    .eq("is_active", true)
    .maybeSingle();

  const payload = configInsertRow(scope, {
    name: "Default SLA",
    threshold_hours: body.thresholdHours,
    notify_email: body.notifyEmail,
    notify_inapp: body.notifyInapp,
    is_active: true,
  });

  if (existing) {
    await supabase.from("sla_configs").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("sla_configs").insert(payload);
  }
}
