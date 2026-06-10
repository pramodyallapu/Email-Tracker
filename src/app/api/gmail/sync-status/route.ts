import { auth } from "@/lib/auth";
import { getEnrichedMailboxStats } from "@/lib/mail/mailbox-stats";
import { resolveMailScope } from "@/lib/mail/scope";
import { isOrgSyncRunning, isUserSyncRunning } from "@/lib/mail/sync-progress";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = await resolveMailScope(session.user.id);
  const coverage = await getEnrichedMailboxStats(session.user.id);

  const running =
    scope.mode === "organization"
      ? await isOrgSyncRunning(scope.organizationId)
      : await isUserSyncRunning(session.user.id);

  return NextResponse.json(
    { running, coverage },
    { headers: { "Cache-Control": "no-store" } }
  );
}
