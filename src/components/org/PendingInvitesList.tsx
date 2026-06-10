import { getAppBaseUrl } from "@/lib/app-url";
import { headers } from "next/headers";

export function PendingInvitesList({
  invites,
}: {
  invites: Array<{
    id: string;
    email: string;
    role: string;
    token: string;
    expires_at: string;
  }>;
}) {
  if (!invites.length) return null;

  const host = headers().get("x-forwarded-host") ?? headers().get("host");
  const proto = headers().get("x-forwarded-proto") ?? "http";
  const baseUrl = host ? `${proto}://${host}` : getAppBaseUrl();

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="font-semibold text-gray-900">Pending invites</h3>
        <p className="text-sm text-gray-500">
          Share these links if email was not sent
        </p>
      </div>
      <ul className="divide-y divide-gray-100">
        {invites.map((invite) => (
          <li key={invite.id} className="px-4 py-3 text-sm">
            <p className="font-medium text-gray-900">{invite.email}</p>
            <p className="text-xs capitalize text-gray-500">Role: {invite.role}</p>
            <p className="mt-1 break-all text-xs text-indigo-700">
              {baseUrl}/join-org?token={invite.token}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
