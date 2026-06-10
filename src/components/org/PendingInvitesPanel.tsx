"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useState } from "react";

export type PendingInvite = {
  token: string;
  organizationName: string;
  role: string;
};

export function PendingInvitesPanel({ invites }: { invites: PendingInvite[] }) {
  const [accepting, setAccepting] = useState<string | null>(null);

  if (!invites.length) return null;

  const accept = (token: string) => {
    setAccepting(token);
    window.location.href = `/join-org?token=${token}`;
  };

  return (
    <Card className="max-w-md border-indigo-200 bg-indigo-50/50">
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
        <p className="text-sm text-gray-600">
          You were invited to join an organization. Accept to see shared
          mailboxes and metrics.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {invites.map((invite) => (
          <div
            key={invite.token}
            className="flex items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-white p-3"
          >
            <div>
              <p className="font-medium text-gray-900">
                {invite.organizationName}
              </p>
              <p className="text-xs text-gray-500 capitalize">
                Role: {invite.role}
              </p>
            </div>
            <Button
              size="sm"
              loading={accepting === invite.token}
              onClick={() => accept(invite.token)}
            >
              Accept
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
