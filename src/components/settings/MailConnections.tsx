"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { MailConnection } from "@/types/mail";

export function MailConnections({
  connections,
  zohoEnabled,
  canConnect,
  isOrg,
  gmailRedirectUri,
}: {
  connections: MailConnection[];
  zohoEnabled: boolean;
  canConnect: boolean;
  isOrg: boolean;
  gmailRedirectUri?: string;
}) {
  const googleConnections = connections.filter((c) => c.provider === "google");
  const zoho = connections.find((c) => c.provider === "zoho");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Google / Gmail</p>
            <p className="text-sm text-gray-500">
              {isOrg
                ? "Shared mailboxes synced once for all managers"
                : "Connected Gmail accounts"}
            </p>
          </div>
          {canConnect && (
            <a href="/api/mail/connect/google">
              <Button variant="secondary" size="sm">
                Add Gmail
              </Button>
            </a>
          )}
        </div>

        {googleConnections.length === 0 ? (
          <p className="text-sm text-gray-500">No Gmail mailboxes connected</p>
        ) : (
          <ul className="space-y-2">
            {googleConnections.map((conn) => (
              <li
                key={conn.id}
                className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-gray-800">
                  {conn.mailbox_email}
                </span>
                <Badge variant="success">Connected</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
        <div>
          <p className="font-medium text-gray-900">Zoho Mail</p>
          <p className="text-sm text-gray-500">
            {zoho?.mailbox_email ?? "Not connected"}
          </p>
        </div>
        {zoho ? (
          <Badge variant="success">Connected</Badge>
        ) : canConnect && zohoEnabled ? (
          <a href="/api/mail/connect/zoho">
            <Button variant="secondary" size="sm">
              Connect Zoho
            </Button>
          </a>
        ) : (
          <Badge variant="default">
            {zohoEnabled ? "Owner/manager only" : "Set ZOHO_CLIENT_ID in .env.local"}
          </Badge>
        )}
      </div>

      <p className="text-xs text-gray-500">
        {isOrg
          ? "Connect admin@ or shared inboxes here. Each mailbox owner must approve Google access once."
          : "Connect mailboxes to see Gmail and Zoho mail in your inbox and dashboard."}
      </p>

      {canConnect && gmailRedirectUri && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-medium">Google OAuth setup (one-time)</p>
          <p className="mt-1">
            If you see <strong>redirect_uri_mismatch</strong>, add this URL in{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Google Cloud Console
            </a>{" "}
            → your OAuth client → <strong>Authorized redirect URIs</strong>:
          </p>
          <p className="mt-2 break-all font-mono text-[11px]">
            {gmailRedirectUri}
          </p>
          <p className="mt-2 text-amber-800">
            Sign-in uses a different URI:{" "}
            <span className="font-mono">
              {gmailRedirectUri.replace("/api/mail/connect/google", "/api/auth/callback/google")}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
