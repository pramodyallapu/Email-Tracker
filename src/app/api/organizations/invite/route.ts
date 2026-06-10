import { getAppBaseUrl } from "@/lib/app-url";
import { auth } from "@/lib/auth";
import { getOrgMembership, inviteOrgMember } from "@/lib/org/context";
import type { OrgRole } from "@/lib/org/types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, role } = (await request.json()) as {
    email?: string;
    role?: OrgRole;
  };

  const membership = await getOrgMembership(session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const result = await inviteOrgMember(
    session.user.id,
    membership.organizationId,
    email.trim(),
    role ?? "manager",
    getAppBaseUrl(request)
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  if (process.env.RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: email.trim(),
        subject: `Join ${membership.organizationName} on Email Tracker`,
        html: `<p>You've been invited as a manager. <a href="${result.link}">Accept invite</a></p>`,
      }),
    });
  } else {
    console.log("Org manager invite link:", result.link);
  }

  return NextResponse.json({ link: result.link, token: result.token });
}
