import { auth } from "@/lib/auth";
import { getEnrichedMailboxStats } from "@/lib/mail/mailbox-stats";
import { syncAllForUser, syncAllOrganizations } from "@/lib/mail/sync-all";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

function verifyInternal(request: NextRequest): boolean {
  const secret =
    process.env.INTERNAL_API_SECRET ??
    process.env.CRON_SECRET ??
    process.env.GOOGLE_PUBSUB_SECRET;
  const header =
    request.headers.get("x-internal-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(secret && header === secret);
}

async function getUserByEmail(email: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();
  return data;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      full?: boolean;
      mode?: "bootstrap" | "quick" | "full";
      reset?: boolean;
    };

    const isInternal = verifyInternal(request);
    let userId: string | undefined;

    if (isInternal && body.email) {
      const user = await getUserByEmail(body.email);
      userId = user?.id;
    } else {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = session.user.id;
    }

    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const mode =
      body.mode ?? (body.full === true ? "full" : body.full === false ? "quick" : "quick");
    const result = await syncAllForUser(userId, mode, {
      reset: body.reset === true,
    });
    const coverage = await getEnrichedMailboxStats(userId);

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/inbox");
    revalidatePath("/dashboard/settings");

    return NextResponse.json(
      {
        success: true,
        mode,
        synced: result.synced,
        total: result.total,
        errors: result.errors,
        hasMore: result.hasMore,
        mailboxes: result.mailboxes,
        coverage,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Gmail sync error:", error);
    return NextResponse.json(
      {
        success: false,
        synced: 0,
        error: error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const isCron =
    verifyInternal(request) ||
    request.headers.get("authorization") ===
      `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncAllOrganizations("quick");

  return NextResponse.json({
    success: true,
    processed: result.processed,
    synced: result.synced,
    errors: result.errors,
  });
}
