import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgMembership, OrgRole } from "@/lib/org/types";

export async function getOrgMembership(
  userId: string
): Promise<OrgMembership | null> {
  const supabase = createAdminClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("role, organization_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!member?.organization_id) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", member.organization_id)
    .single();

  return {
    organizationId: member.organization_id,
    organizationName: org?.name ?? "Organization",
    role: member.role as OrgRole,
  };
}

export function canManageOrg(role: OrgRole): boolean {
  return role === "owner" || role === "manager";
}

export function canConnectMailboxes(role: OrgRole): boolean {
  return role === "owner" || role === "manager";
}

export async function requireOrgMembership(
  userId: string
): Promise<OrgMembership> {
  const membership = await getOrgMembership(userId);
  if (!membership) {
    throw new Error("Organization membership required");
  }
  return membership;
}

export async function createOrganization(
  userId: string,
  name: string
): Promise<{ organizationId: string; slug: string } | { error: string }> {
  const supabase = createAdminClient();
  const existing = await getOrgMembership(userId);
  if (existing) {
    return { error: "You already belong to an organization" };
  }

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) +
    "-" +
    userId.slice(0, 8);

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: name.trim(), slug })
    .select("id, slug")
    .single();

  if (orgError || !org) {
    return { error: orgError?.message ?? "Could not create organization" };
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: "owner",
    });

  if (memberError) {
    await supabase.from("organizations").delete().eq("id", org.id);
    return { error: memberError.message };
  }

  return { organizationId: org.id, slug: org.slug };
}

export async function getPendingInvitesForEmail(email: string) {
  const supabase = createAdminClient();
  const normalized = email.toLowerCase().trim();
  const { data: invites } = await supabase
    .from("organization_invites")
    .select("id, token, role, expires_at, organization_id")
    .eq("email", normalized)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (!invites?.length) return [];

  const orgIds = Array.from(new Set(invites.map((i) => i.organization_id)));
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", orgIds);

  const orgNames = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return invites.map((invite) => ({
    id: invite.id,
    token: invite.token,
    role: invite.role as OrgRole,
    expiresAt: invite.expires_at,
    organizationId: invite.organization_id,
    organizationName: orgNames.get(invite.organization_id) ?? "Organization",
  }));
}

export async function getOrgPendingInvites(organizationId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organization_invites")
    .select("id, email, role, token, expires_at, created_at")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  return data ?? [];
}

async function isEmailAlreadyMember(
  organizationId: string,
  email: string
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (!user?.id) return false;

  const { data: member } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  return Boolean(member);
}

async function canLeaveSoloOrganization(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if ((count ?? 0) !== 1) return false;

  const { data: member } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(member);
}

async function leaveSoloOrganization(
  userId: string,
  organizationId: string
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  const { count } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if ((count ?? 0) === 0) {
    await supabase.from("organizations").delete().eq("id", organizationId);
  }
}

export async function inviteOrgMember(
  inviterUserId: string,
  organizationId: string,
  email: string,
  role: OrgRole = "manager",
  baseUrl?: string
): Promise<{ token: string; link: string } | { error: string }> {
  const supabase = createAdminClient();
  const membership = await getOrgMembership(inviterUserId);
  const normalizedEmail = email.toLowerCase().trim();

  if (
    !membership ||
    membership.organizationId !== organizationId ||
    !canManageOrg(membership.role)
  ) {
    return { error: "Forbidden" };
  }

  if (role === "owner" && membership.role !== "owner") {
    return { error: "Only owners can invite other owners" };
  }

  if (await isEmailAlreadyMember(organizationId, normalizedEmail)) {
    return { error: `${normalizedEmail} is already a member of this organization` };
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: existingInvite } = await supabase
    .from("organization_invites")
    .select("token")
    .eq("organization_id", organizationId)
    .eq("email", normalizedEmail)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existingInvite?.token) {
    const appUrl = baseUrl ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    return {
      token: existingInvite.token,
      link: `${appUrl}/join-org?token=${existingInvite.token}`,
    };
  }

  const { data: invite, error } = await supabase
    .from("organization_invites")
    .insert({
      organization_id: organizationId,
      email: normalizedEmail,
      role,
      invited_by: inviterUserId,
      expires_at: expiresAt,
    })
    .select("token")
    .single();

  if (error || !invite) {
    return { error: error?.message ?? "Could not create invite" };
  }

  const appUrl = baseUrl ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const link = `${appUrl}/join-org?token=${invite.token}`;

  return { token: invite.token, link };
}

export async function acceptOrgInvite(
  userId: string,
  userEmail: string,
  token: string
): Promise<{ organizationId: string } | { error: string }> {
  const supabase = createAdminClient();

  const { data: invite } = await supabase
    .from("organization_invites")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!invite) {
    return { error: "Invite expired or invalid" };
  }

  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    return {
      error: `This invite was sent to ${invite.email}. Sign in with that account.`,
    };
  }

  const existing = await getOrgMembership(userId);
  if (existing) {
    if (existing.organizationId === invite.organization_id) {
      await supabase
        .from("organization_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);
      return { organizationId: invite.organization_id };
    }

    const canSwitch = await canLeaveSoloOrganization(
      userId,
      existing.organizationId
    );
    if (canSwitch) {
      await leaveSoloOrganization(userId, existing.organizationId);
    } else {
      return {
        error: `You already belong to "${existing.organizationName}". Leave that organization first, or sign in with ${invite.email}.`,
      };
    }
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: invite.organization_id,
      user_id: userId,
      role: invite.role,
    });

  if (memberError) {
    return { error: memberError.message };
  }

  await supabase
    .from("organization_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return { organizationId: invite.organization_id };
}

export async function getOrgOwnerUserId(
  organizationId: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  return data?.user_id ?? null;
}

export async function getOrgMembers(organizationId: string) {
  const supabase = createAdminClient();
  const { data: members } = await supabase
    .from("organization_members")
    .select("role, user_id")
    .eq("organization_id", organizationId);

  if (!members?.length) return [];

  const userIds = members.map((m) => m.user_id);
  const { data: users } = await supabase
    .from("users")
    .select("id, email, name, avatar_url")
    .in("id", userIds);

  const userMap = new Map((users ?? []).map((u) => [u.id, u]));

  return members.map((member) => {
    const user = userMap.get(member.user_id);
    return {
      id: user?.id ?? member.user_id,
      email: user?.email ?? "",
      name: user?.name ?? null,
      avatarUrl: user?.avatar_url ?? null,
      role: member.role as OrgRole,
    };
  });
}
