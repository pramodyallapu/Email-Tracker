import { createAdminClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record as {
      user_id: string;
      gmail_thread_id: string;
      is_sent: boolean;
      received_at: string;
    };

    if (!record?.user_id) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const supabase = createAdminClient();

    const { data: thread } = await supabase
      .from("threads")
      .select("id, is_replied, first_received_at, last_message_at")
      .eq("user_id", record.user_id)
      .eq("gmail_thread_id", record.gmail_thread_id)
      .single();

    if (!thread) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const { data: configs } = await supabase
      .from("sla_configs")
      .select("*")
      .eq("user_id", record.user_id)
      .eq("is_active", true);

    for (const config of configs ?? []) {
      if (thread.is_replied) continue;

      const received = thread.first_received_at ?? thread.last_message_at;
      const ageHours =
        (Date.now() - new Date(received).getTime()) / (1000 * 60 * 60);

      if (ageHours <= config.threshold_hours) continue;

      const { data: existing } = await supabase
        .from("sla_breaches")
        .select("id")
        .eq("thread_id", thread.id)
        .eq("config_id", config.id)
        .eq("is_resolved", false)
        .maybeSingle();

      if (existing) continue;

      await supabase.from("sla_breaches").insert({
        user_id: record.user_id,
        thread_id: thread.id,
        config_id: config.id,
      });

      if (config.notify_inapp) {
        await supabase.from("notifications").insert({
          user_id: record.user_id,
          type: "sla_breach",
          title: "SLA breach detected",
          body: "A thread has exceeded your reply time threshold.",
          thread_id: thread.id,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
