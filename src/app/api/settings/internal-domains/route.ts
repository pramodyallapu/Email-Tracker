import { auth } from "@/lib/auth";
import { DomainConflictError } from "@/lib/mail/domain-conflicts";
import {
  getInternalDomains,
  saveInternalDomains,
} from "@/lib/mail/internal-domains";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const domains = await getInternalDomains(session.user.id);
  return NextResponse.json({ domains });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domains } = (await request.json()) as { domains?: string[] };
  if (!Array.isArray(domains)) {
    return NextResponse.json({ error: "domains must be an array" }, { status: 400 });
  }

  let result;
  try {
    result = await saveInternalDomains(session.user.id, domains);
  } catch (err) {
    if (err instanceof DomainConflictError) {
      return NextResponse.json(
        { error: err.message, conflicts: err.conflicts, otherList: err.otherList },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 }
    );
  }

  revalidatePath("/dashboard", "page");
  revalidatePath("/dashboard/settings", "page");
  revalidatePath("/dashboard/inbox", "page");

  return NextResponse.json(result);
}
