import { auth } from "@/lib/auth";
import { getHeatmapBreakdown } from "@/lib/metrics/aggregator";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hour = Number(request.nextUrl.searchParams.get("hour"));
  const dow = Number(request.nextUrl.searchParams.get("dow"));

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(dow) ||
    dow < 0 ||
    dow > 6
  ) {
    return NextResponse.json({ error: "Invalid hour or day" }, { status: 400 });
  }

  const breakdown = await getHeatmapBreakdown(session.user.id, hour, dow);
  return NextResponse.json(breakdown);
}
