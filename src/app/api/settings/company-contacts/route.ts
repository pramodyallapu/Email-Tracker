import { auth } from "@/lib/auth";
import {
  getCompanyGroups,
  saveCompanyGroups,
} from "@/lib/mail/company-contacts";
import { DomainConflictError } from "@/lib/mail/domain-conflicts";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companies = await getCompanyGroups(session.user.id);
  return NextResponse.json({ companies });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companies } = (await request.json()) as {
    companies?: { companyName?: string; emails?: string[] }[];
  };

  if (!Array.isArray(companies)) {
    return NextResponse.json(
      { error: "companies must be an array" },
      { status: 400 }
    );
  }

  try {
    const result = await saveCompanyGroups(
      session.user.id,
      companies.map((c) => ({
        companyName: c.companyName ?? "",
        emails: Array.isArray(c.emails) ? c.emails : [],
      }))
    );
    revalidatePath("/dashboard/companies", "page");
    revalidatePath("/dashboard/settings", "page");
    return NextResponse.json(result);
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
}
