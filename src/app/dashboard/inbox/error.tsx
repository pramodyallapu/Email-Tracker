"use client";

import { Button } from "@/components/ui/Button";
import { useEffect } from "react";

export default function InboxError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => console.error("Inbox error:", error), [error]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
      <p className="text-gray-700">Could not load your inbox.</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
