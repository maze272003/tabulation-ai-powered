"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Bell,
  CheckCheck,
  CreditCard,
  LifeBuoy,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "refund_approved":
      return <ShieldCheck className="size-4 text-success shrink-0" />;
    case "refund_rejected":
      return <ShieldAlert className="size-4 text-destructive shrink-0" />;
    case "ticket_reply":
    case "chat_message":
      return <MessageSquare className="size-4 text-primary shrink-0" />;
    case "ticket_created":
    case "ticket_status_change":
      return <LifeBuoy className="size-4 text-info shrink-0" />;
    default:
      return <Bell className="size-4 text-muted-foreground shrink-0" />;
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const notifications = useQuery(api.support.notifications.listMyNotifications, { limit: 15 });
  const unreadCount = useQuery(api.support.notifications.getUnreadCount) ?? 0;
  const markAsRead = useMutation(api.support.notifications.markAsRead);
  const markAllAsRead = useMutation(api.support.notifications.markAllAsRead);

  const handleNotificationClick = async (
    notificationId: Id<"notifications">,
    link: string,
    isRead: boolean,
  ) => {
    if (!isRead) {
      await markAsRead({ notificationId }).catch(() => {});
    }
    setOpen(false);
    if (link) {
      router.push(link);
    }
  };

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await markAllAsRead().catch(() => {});
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Notifications (${unreadCount} unread)`}
            className="relative flex size-9 items-center justify-center rounded-lg border bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Bell className="size-4.5" />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground animate-in zoom-in-50">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>
        }
      />

      <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {unreadCount > 0 ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                {unreadCount} unread
              </Badge>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-[380px] overflow-y-auto divide-y">
          {notifications === undefined ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded bg-muted/60 animate-pulse" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Bell className="size-6 mx-auto mb-2 opacity-40" />
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n._id}
                role="button"
                tabIndex={0}
                onClick={() => handleNotificationClick(n._id, n.link, n.isRead)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void handleNotificationClick(n._id, n.link, n.isRead);
                  }
                }}
                className={cn(
                  "flex items-start gap-3 p-3 text-left transition-colors cursor-pointer hover:bg-muted/50",
                  !n.isRead && "bg-primary/5 font-medium",
                )}
              >
                <div className="mt-0.5">{getNotificationIcon(n.type)}</div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground truncate">{n.title}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                </div>
                {!n.isRead ? (
                  <span className="size-2 rounded-full bg-primary mt-1.5 shrink-0" />
                ) : null}
              </div>
            ))
          )}
        </div>

        {notifications && notifications.length > 0 ? (
          <div className="border-t p-2 text-center bg-muted/20">
            <span className="text-[11px] text-muted-foreground">
              Notifications update in real time
            </span>
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
