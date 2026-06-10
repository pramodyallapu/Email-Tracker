"use client";

import { Button } from "@/components/ui/Button";
import { useState } from "react";

export function OrgInviteButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setLink(null);

    const res = await fetch("/api/organizations/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: "manager" }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not send invite");
      return;
    }

    setLink(data.link);
    setEmail("");
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Invite manager
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Invite a manager
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Managers see the same shared mailboxes and dashboard.
            </p>

            <form onSubmit={invite} className="mt-4 space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@amromed.org"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              {link && (
                <div className="space-y-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                  <p className="font-medium">Invite link (copy and send):</p>
                  <p className="break-all select-all">{link}</p>
                  <p className="text-xs text-green-700">
                    Uses your current browser URL. Invitee must sign in with the
                    exact email you entered above.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
                <Button type="submit" size="sm" loading={loading}>
                  Send invite
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
