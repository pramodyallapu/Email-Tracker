import { createAdminClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!authHeader?.includes(serviceKey ?? "___none___")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const supabase = createAdminClient();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    const { data: users } = await supabase.from("users").select("id");

    for (const user of users ?? []) {
      const { data: recv } = await supabase
        .from("emails")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_sent", false)
        .gte("received_at", `${dateStr}T00:00:00Z`)
        .lt("received_at", `${dateStr}T23:59:59Z`);

      const { data: sent } = await supabase
        .from("emails")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_sent", true)
        .gte("received_at", `${dateStr}T00:00:00Z`)
        .lt("received_at", `${dateStr}T23:59:59Z`);

      const { data: threads } = await supabase
        .from("threads")
        .select("is_replied, reply_time_seconds, created_at, first_replied_at")
        .eq("user_id", user.id);

      const dayThreads = (threads ?? []).filter(
        (t) => t.created_at?.startsWith(dateStr) || t.first_replied_at?.startsWith(dateStr)
      );
      const replied = dayThreads.filter((t) => t.is_replied);
      const notReplied = dayThreads.filter((t) => !t.is_replied);
      const replyTimes = replied
        .map((t) => t.reply_time_seconds)
        .filter((t): t is number => t != null)
        .sort((a, b) => a - b);

      const p50 = replyTimes.length
        ? replyTimes[Math.floor(replyTimes.length * 0.5)]
        : null;
      const p90 = replyTimes.length
        ? replyTimes[Math.floor(replyTimes.length * 0.9)]
        : null;

      const total = replied.length + notReplied.length;
      const replyRate = total > 0 ? (replied.length / total) * 100 : 0;

      await supabase.from("metrics_daily").upsert(
        {
          user_id: user.id,
          date: dateStr,
          total_received: recv?.length ?? 0,
          total_sent: sent?.length ?? 0,
          new_threads: dayThreads.length,
          threads_replied: replied.length,
          threads_not_replied: notReplied.length,
          reply_rate: Math.round(replyRate * 100) / 100,
          avg_reply_time_sec: replyTimes.length
            ? Math.round(replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length)
            : null,
          min_reply_time_sec: replyTimes[0] ?? null,
          max_reply_time_sec: replyTimes[replyTimes.length - 1] ?? null,
          p50_reply_time_sec: p50,
          p90_reply_time_sec: p90,
        },
        { onConflict: "user_id,date" }
      );
    }

    return new Response(JSON.stringify({ ok: true, date: dateStr }), {
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
