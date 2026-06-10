"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { SyncResultBanner } from "@/components/settings/SyncResultBanner";
import { SyncStatusPanel } from "@/components/settings/SyncStatusPanel";
import { useMailSync } from "@/lib/hooks/useMailSync";
import type { EnrichedMailboxStat } from "@/lib/mail/sync-status";
import { useState } from "react";

export function SettingsForm({
  userId,
  initialSla,
  mailboxStats,
}: {
  userId: string;
  initialSla: {
    thresholdHours: number;
    notifyEmail: boolean;
    notifyInapp: boolean;
  };
  mailboxStats: EnrichedMailboxStat[];
}) {
  const [threshold, setThreshold] = useState(initialSla.thresholdHours);
  const [notifyEmail, setNotifyEmail] = useState(initialSla.notifyEmail);
  const [notifyInapp, setNotifyInapp] = useState(initialSla.notifyInapp);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const {
    syncing,
    statusMessage,
    syncResult,
    coverage,
    runSync,
  } = useMailSync(mailboxStats);

  const saveSla = async () => {
    setSaving(true);
    const res = await fetch("/api/settings/sla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        thresholdHours: threshold,
        notifyEmail,
        notifyInapp,
      }),
    });
    setSaving(false);
    setMessage(res.ok ? "SLA settings saved." : "Failed to save.");
  };

  const deleteData = async () => {
    if (
      !confirm(
        "Delete all synced email data? This cannot be undone."
      )
    ) {
      return;
    }
    const res = await fetch("/api/settings/delete-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setMessage(res.ok ? "All data deleted." : "Delete failed.");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>SLA threshold</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Hours before breach</span>
            <input
              type="number"
              min={1}
              max={168}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              aria-label="SLA threshold hours"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.checked)}
            />
            Email notifications
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifyInapp}
              onChange={(e) => setNotifyInapp(e.target.checked)}
            />
            In-app notifications
          </label>
          <Button onClick={saveSla} loading={saving}>
            Save SLA settings
          </Button>
        </CardContent>
      </Card>

      <SyncStatusPanel mailboxes={coverage} />

      <Card>
        <CardHeader>
          <CardTitle>Mail sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <p>
              <strong className="text-gray-900">Quick sync</strong> — new mail
              only (fast). Counts above update live.
            </p>
            <p className="mt-2">
              <strong className="text-gray-900">Full sync</strong> — pulls{" "}
              <strong>entire Gmail and Zoho history</strong> in batches. Progress
              bar and synced count increase every few seconds while running.
            </p>
          </div>

          {statusMessage && (
            <p className="text-sm font-medium text-blue-700" role="status">
              {statusMessage}
            </p>
          )}

          {syncResult && (
            <SyncResultBanner
              mode={syncResult.mode}
              newSynced={syncResult.synced}
              mailboxes={syncResult.mailboxes}
              coverage={syncResult.coverage}
              errors={syncResult.errors}
            />
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => runSync("quick")}
              loading={syncing}
              variant="secondary"
            >
              Quick sync (new mail)
            </Button>
            <Button
              onClick={() => runSync("full")}
              loading={syncing}
              variant="primary"
            >
              Full sync (Gmail + Zoho history)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-700">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-500">
            Permanently delete all synced emails and thread data.
          </p>
          <Button variant="danger" onClick={deleteData}>
            Delete all data
          </Button>
        </CardContent>
      </Card>

      {message && (
        <p className="text-sm text-gray-600" role="status">
          {message}
        </p>
      )}
    </>
  );
}
