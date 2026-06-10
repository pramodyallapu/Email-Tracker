"use client";

import { Button } from "@/components/ui/Button";
import { useState } from "react";

export function TeamInviteButton({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const invite = async () => {
    setLoading(true);
    const res = await fetch("/api/teams/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, teamId }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setLink(data.link);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite member</Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal
          aria-label="Invite team member"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Invite team member</h3>
            <input
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2"
              aria-label="Invitee email"
            />
            {link && (
              <p className="mt-3 break-all text-sm text-gray-600">
                Invite link: {link}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button onClick={invite} loading={loading}>
                Send invite
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
