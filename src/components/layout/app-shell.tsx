"use client";

import * as React from "react";
import { Sidebar, type SidebarUser, type SidebarClient } from "@/components/layout/sidebar";
import { Topbar, type TopbarAvatar } from "@/components/layout/topbar";
import { ContextPanel } from "@/components/layout/context-panel";

export function AppShell({
  user,
  clients,
  team,
  canAdmin,
  children,
}: {
  user: SidebarUser;
  clients: SidebarClient[];
  team: TopbarAvatar[];
  canAdmin: boolean;
  children: React.ReactNode;
}) {
  const [panelOpen, setPanelOpen] = React.useState(true);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar user={user} clients={clients} canAdmin={canAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar team={team} onTogglePanel={() => setPanelOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <ContextPanel open={panelOpen} />
    </div>
  );
}
