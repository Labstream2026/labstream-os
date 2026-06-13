"use client";

import * as React from "react";
import { Sidebar, type SidebarUser, type SidebarClient } from "@/components/layout/sidebar";
import { Topbar, type TopbarAvatar } from "@/components/layout/topbar";
import { ContextPanel } from "@/components/layout/context-panel";
import type { ChatMe, ChatMsg } from "@/components/chat/channel-chat";
import type { NotificationItem } from "@/components/layout/notifications-bell";

export type GeneralChannel = { id: string; name: string; messages: ChatMsg[] } | null;

export function AppShell({
  user,
  clients,
  team,
  canAdmin,
  me,
  generalChannel,
  notifications,
  children,
}: {
  user: SidebarUser;
  clients: SidebarClient[];
  team: TopbarAvatar[];
  canAdmin: boolean;
  me: ChatMe;
  generalChannel: GeneralChannel;
  notifications: NotificationItem[];
  children: React.ReactNode;
}) {
  const [panelOpen, setPanelOpen] = React.useState(true);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar user={user} clients={clients} canAdmin={canAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar team={team} notifications={notifications} onTogglePanel={() => setPanelOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <ContextPanel open={panelOpen} me={me} channel={generalChannel} />
    </div>
  );
}
