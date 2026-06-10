import { auth, signOut } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { redirect } from "next/navigation";
import { CompanyContactsForm } from "@/components/settings/CompanyContactsForm";
import { InternalDomainsForm } from "@/components/settings/InternalDomainsForm";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { MailConnections } from "@/components/settings/MailConnections";
import {
  canConnectMailboxes,
  getOrgMembership,
} from "@/lib/org/context";
import {
  getMailConnections,
  getOrgMailConnections,
} from "@/lib/mail/connections";
import { getCompanyGroups } from "@/lib/mail/company-contacts";
import { getInternalDomains } from "@/lib/mail/internal-domains";
import { getEnrichedMailboxStats } from "@/lib/mail/mailbox-stats";
import { getActiveSlaConfig } from "@/lib/mail/sla";
import { getAppBaseUrl } from "@/lib/app-url";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; mailbox?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const membership = await getOrgMembership(session.user.id);
  if (!membership) redirect("/dashboard/organization");
  const connections = membership
    ? await getOrgMailConnections(membership.organizationId)
    : await getMailConnections(session.user.id);

  const internalDomains = await getInternalDomains(session.user.id);
  const companyGroups = await getCompanyGroups(session.user.id);
  const [sla, mailboxStats] = await Promise.all([
    getActiveSlaConfig(session.user.id),
    getEnrichedMailboxStats(session.user.id),
  ]);

  const canConnect = membership
    ? canConnectMailboxes(membership.role)
    : true;

  const params = await searchParams;
  const host = headers().get("x-forwarded-host") ?? headers().get("host");
  const proto = headers().get("x-forwarded-proto") ?? "http";
  const baseUrl = host ? `${proto}://${host}` : getAppBaseUrl();
  const gmailRedirectUri = `${baseUrl}/api/mail/connect/google`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-gray-500">
          {membership
            ? `${membership.organizationName} — shared account settings`
            : "Account, SLA, and sync preferences"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mail accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {params.error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Connection failed: {params.error}
            </div>
          )}
          {params.connected && (
            <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {params.mailbox
                ? `${params.mailbox} connected. Fetching mailbox counts and recent mail (not full history).`
                : `${params.connected} connected. Fetching mailbox counts and recent mail.`}
              {connections.length === 0 && (
                <p className="mt-1 text-amber-800">
                  If the mailbox is not listed below, run{" "}
                  <code className="text-xs">sql/organizations.sql</code> in
                  Supabase and connect again.
                </p>
              )}
            </div>
          )}
          <MailConnections
            connections={connections}
            zohoEnabled={Boolean(process.env.ZOHO_CLIENT_ID)}
            canConnect={canConnect}
            isOrg={Boolean(membership)}
            gmailRedirectUri={gmailRedirectUri}
          />
          <form
            className="mt-4"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-sm text-red-600 hover:underline"
            >
              Sign out of Email Tracker
            </button>
          </form>
        </CardContent>
      </Card>

      <InternalDomainsForm initialDomains={internalDomains} />

      <CompanyContactsForm initialCompanies={companyGroups} />

      <SettingsForm
        userId={session.user.id}
        mailboxStats={mailboxStats}
        initialSla={{
          thresholdHours: sla?.threshold_hours ?? 24,
          notifyEmail: sla?.notify_email ?? true,
          notifyInapp: sla?.notify_inapp ?? true,
        }}
      />
    </div>
  );
}
