"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useState } from "react";

export function InternalDomainsForm({
  initialDomains,
}: {
  initialDomains: string[];
}) {
  const [input, setInput] = useState(
    initialDomains.map((d) => `@${d}`).join("\n")
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setIsError(false);

    const domains = input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch("/api/settings/internal-domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domains }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setIsError(true);
      setMessage(data.error ?? "Failed to save domains.");
      return;
    }

    setInput(data.domains.map((d: string) => `@${d}`).join("\n"));
    const invalid = (data.invalid as string[] | undefined) ?? [];
    setMessage(
      invalid.length > 0
        ? `Saved. Skipped invalid: ${invalid.join(", ")}`
        : "Internal domains saved."
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal domains</CardTitle>
        <p className="text-sm text-gray-500">
          Threads are internal when the other person&apos;s email domain
          matches (e.g. colleague@amromed.org). Your own address does not
          count. A domain cannot be listed here and under Companies — use
          one list only. Domains in neither list are treated as external.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          placeholder={"@amromed.org\n@example.com"}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
          aria-label="Internal domain list"
        />
        <Button onClick={save} loading={saving}>
          Save internal domains
        </Button>
        {message && (
          <p
            className={`text-sm ${isError ? "text-red-600" : "text-gray-600"}`}
            role="status"
          >
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
