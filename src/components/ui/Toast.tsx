"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

const styles = {
  info: "bg-blue-600",
  warning: "bg-amber-500",
  error: "bg-red-600",
  success: "bg-green-600",
};

export function Toast({
  type,
  message,
  onDismiss,
}: {
  type: keyof typeof styles;
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className={cn(
        "fixed bottom-20 right-4 z-[100] max-w-sm animate-[slideIn_0.3s_ease-out] rounded-lg px-4 py-3 text-sm text-white shadow-lg md:bottom-4",
        styles[type]
      )}
    >
      {message}
    </div>
  );
}
