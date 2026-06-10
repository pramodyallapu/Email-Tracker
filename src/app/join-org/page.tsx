import { auth } from "@/lib/auth";
import {
  acceptOrgInvite,
  getPendingInvitesForEmail,
} from "@/lib/org/context";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function JoinOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-gray-600">Invalid invite link.</p>
            <Link href="/dashboard/organization" className="text-sm text-indigo-600 hover:underline">
              Go to Organization
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    redirect(
      `/auth/signin?callbackUrl=${encodeURIComponent(`/join-org?token=${token}`)}`
    );
  }

  const result = await acceptOrgInvite(
    session.user.id,
    session.user.email,
    token
  );

  if ("error" in result) {
    const otherInvites = await getPendingInvitesForEmail(session.user.email);

    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="space-y-4 pt-6">
            <p className="font-medium text-gray-900">Could not join organization</p>
            <p className="text-sm text-gray-600">{result.error}</p>

            {session.user.email && (
              <p className="text-sm text-gray-500">
                Signed in as <strong>{session.user.email}</strong>. The invite may
                be for a different email — sign out and use the invited account.
              </p>
            )}

            {otherInvites.length > 0 && (
              <div className="rounded-lg bg-indigo-50 p-3 text-sm">
                <p className="font-medium text-indigo-900">Other pending invites</p>
                <ul className="mt-2 space-y-1">
                  {otherInvites.map((inv) => (
                    <li key={inv.token}>
                      <Link
                        href={`/join-org?token=${inv.token}`}
                        className="text-indigo-700 hover:underline"
                      >
                        Join {inv.organizationName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <Link href="/dashboard/organization">
                <Button variant="secondary" size="sm">
                  Organization
                </Button>
              </Link>
              <Link href="/auth/signin">
                <Button size="sm">Switch account</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  redirect("/dashboard");
}
