"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead } from "@/lib/notify-actions";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export function NotificationsBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(items.filter((n) => !n.read).length);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      void markAllNotificationsRead();
    }
  }

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" className="relative text-muted-foreground" aria-label="Notificaciones" onClick={toggle}>
        <Bell />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Notificaciones</div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin notificaciones</p>
              ) : (
                items.map((n) => {
                  const inner = (
                    <div className={cn("border-b border-border px-4 py-2.5 last:border-0 hover:bg-accent", !n.read && "bg-primary/5")}>
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body ? <p className="text-xs text-muted-foreground">{n.body}</p> : null}
                    </div>
                  );
                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>{inner}</Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  );
                })
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
