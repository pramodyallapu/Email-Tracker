import { auth } from "@/lib/auth";
import { saveSlaConfig } from "@/lib/mail/sla";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    thresholdHours: number;
    notifyEmail: boolean;
    notifyInapp: boolean;
  };

  await saveSlaConfig(session.user.id, body);

  return NextResponse.json({ success: true });
}
