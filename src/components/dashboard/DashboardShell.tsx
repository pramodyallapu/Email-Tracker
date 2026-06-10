"use client";

import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { SessionProvider } from "@/components/providers/SessionProvider";

export function DashboardShell({
  children,
  showSyncBanner,
  organizationName,
}: {
  children: React.ReactNode;
  showSyncBanner: boolean;
  organizationName?: string;
}) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden pb-16 md:pb-0">
          <TopNav organizationName={organizationName} />
          {showSyncBanner && (
            <div
              className="border-b border-indigo-200 bg-indigo-50 px-6 py-3 text-sm text-indigo-800"
              role="status"
            >
              Connecting mailbox… Recent mail will appear shortly.
            </div>
          )}
          <main className="flex-1 overflow-y-auto bg-white p-6 text-gray-900">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
