"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateOrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/organizations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not create organization");
      return;
    }

    router.refresh();
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
        <p className="text-sm text-gray-500">
          Set up a shared workspace. Connect team mailboxes once — every manager
          sees the same inbox and metrics.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={createOrg} className="space-y-4">
          <div>
            <label
              htmlFor="org-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Organization name
            </label>
            <input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Amromed"
              maxLength={60}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" loading={loading} disabled={name.trim().length < 2}>
            Create organization
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
