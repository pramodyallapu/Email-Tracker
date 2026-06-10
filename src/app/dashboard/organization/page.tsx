import { CreateOrganizationForm } from "@/components/org/CreateOrganizationForm";
import { OrgInviteButton } from "@/components/org/OrgInviteButton";
import { Badge } from "@/components/ui/Badge";
import { auth } from "@/lib/auth";
import { PendingInvitesList } from "@/components/org/PendingInvitesList";
import { PendingInvitesPanel } from "@/components/org/PendingInvitesPanel";
import {
  canManageOrg,
  getOrgMembers,
  getOrgMembership,
  getOrgPendingInvites,
  getPendingInvitesForEmail,
} from "@/lib/org/context";
import { getOrgMailConnections } from "@/lib/mail/connections";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const membership = await getOrgMembership(session.user.id);

  if (!membership) {
    const pendingInvites = session.user.email
      ? await getPendingInvitesForEmail(session.user.email)
      : [];

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Organization</h2>
          <p className="text-gray-500">
            Create a workspace to share mailboxes across managers.
          </p>
        </div>

        <PendingInvitesPanel invites={pendingInvites} />

        {pendingInvites.length > 0 && (
          <p className="text-sm text-gray-500">
            Or create your own organization below if you do not want to join the
            invite.
          </p>
        )}
        <CreateOrganizationForm />
      </div>
    );
  }

  const [members, connections, pendingInvites] = await Promise.all([
    getOrgMembers(membership.organizationId),
    getOrgMailConnections(membership.organizationId),
    canManageOrg(membership.role)
      ? getOrgPendingInvites(membership.organizationId)
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {membership.organizationName}
          </h2>
          <p className="text-gray-500">
            Shared organization — one sync, all managers see the same data
          </p>
        </div>
        {canManageOrg(membership.role) && <OrgInviteButton />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Managers</p>
          <p className="text-2xl font-bold">{members.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Shared mailboxes</p>
          <p className="text-2xl font-bold">{connections.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-900">Team members</h3>
        </div>
        <ul className="divide-y divide-gray-100">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {member.name ?? member.email}
                </p>
                <p className="text-gray-500">{member.email}</p>
              </div>
              <Badge variant={member.role === "owner" ? "default" : "success"}>
                {member.role}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      {canManageOrg(membership.role) && (
        <PendingInvitesList invites={pendingInvites} />
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-900">Shared mailboxes</h3>
        </div>
        {connections.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">
            No mailboxes yet. Go to Settings → Mail accounts to connect
            admin1@, admin2@, etc.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {connections.map((conn) => (
              <li key={conn.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-gray-900">{conn.mailbox_email}</p>
                <p className="text-gray-500 capitalize">{conn.provider}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
