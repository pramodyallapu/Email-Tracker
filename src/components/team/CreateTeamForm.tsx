"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateTeamForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setHint(null);

    const res = await fetch("/api/teams/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not create team");
      setHint(data.hint ?? null);
      return;
    }

    router.refresh();
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Create a team</CardTitle>
        <p className="text-sm text-gray-500">
          Start a workspace to compare reply times and invite colleagues.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={createTeam} className="space-y-4">
          <div>
            <label
              htmlFor="team-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Team name
            </label>
            <input
              id="team-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Amromed Support"
              maxLength={60}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>{error}</p>
              {hint && <p className="mt-1 text-red-600">{hint}</p>}
            </div>
          )}

          <Button type="submit" loading={loading} disabled={name.trim().length < 2}>
            Create team
          </Button>
        </form>

        <p className="mt-6 text-sm text-gray-500">
          Already invited? Open the invite link from your email, or ask your admin
          for a new one.
        </p>
      </CardContent>
    </Card>
  );
}
