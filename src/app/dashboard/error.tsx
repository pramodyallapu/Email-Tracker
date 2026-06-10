"use client";

import { Button } from "@/components/ui/Button";
import { AlertCircle } from "lucide-react";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16">
      <AlertCircle className="h-10 w-10 text-red-500" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold text-gray-900">
        Something went wrong
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        We could not load your dashboard. Please try again.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button
          variant="secondary"
          onClick={() => (window.location.href = "/auth/signin")}
        >
          Reconnect Gmail
        </Button>
      </div>
    </div>
  );
}
