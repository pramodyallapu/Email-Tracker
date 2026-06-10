import { auth } from "@/lib/auth";
import { syncGmailThread } from "@/lib/gmail/thread-sync";
import { getOrgMailConnectionByProvider } from "@/lib/mail/connections";
import { rebuildOneThread } from "@/lib/mail/rebuild-one-thread";
import { getActiveSlaConfig } from "@/lib/mail/sla";
import { getThreadForUser } from "@/lib/org/access";
import {
  resolveMailScope,
  scopeEmailsFilter,
} from "@/lib/mail/scope";
import { threadRowToSummary } from "@/lib/metrics/reply-time";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const thread = await getThreadForUser(session.user.id, id);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const scope = await resolveMailScope(session.user.id);
  const supabase = createAdminClient();

  const provider = thread.provider as string;
  const gmailThreadId = thread.gmail_thread_id as string;

  let gmailTotal: number | null = null;
  if (provider === "google") {
    const result = await syncGmailThread(session.user.id, gmailThreadId);
    gmailTotal = result.total;
  }

  const { messageCount } = await rebuildOneThread(
    session.user.id,
    provider,
    gmailThreadId
  );

  const { data: refreshed } = await supabase
    .from("threads")
    .select("*")
    .eq("id", id)
    .single();

  const slaConfig = await getActiveSlaConfig(session.user.id);

  const messagesQuery = scopeEmailsFilter(
    supabase.from("emails").select(
      "gmail_message_id, from_address, from_name, subject, is_sent, received_at"
    ),
    scope
  )
    .eq("provider", provider)
    .eq("gmail_thread_id", gmailThreadId)
    .order("received_at", { ascending: true });
  const { data: messages } = await messagesQuery;

  const connection =
    provider === "zoho" && scope.mode === "organization"
      ? await getOrgMailConnectionByProvider(
          scope.organizationId,
          "zoho"
        )
      : null;

  revalidatePath("/dashboard/inbox");

  return NextResponse.json({
    thread: threadRowToSummary(
      (refreshed ?? thread) as Parameters<typeof threadRowToSummary>[0],
      slaConfig?.threshold_hours ?? 24
    ),
    messageCount,
    gmailTotal,
    zohoDc: connection?.zoho_dc ?? null,
    messages: messages ?? [],
  });
}
