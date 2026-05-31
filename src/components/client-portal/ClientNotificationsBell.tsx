import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listClientNotifications, markClientNotificationsRead } from "@/lib/client-portal.functions";

export function ClientNotificationsBell() {
  const qc = useQueryClient();
  const load = useServerFn(listClientNotifications);
  const markRead = useServerFn(markClientNotificationsRead);

  const { data } = useQuery({
    queryKey: ["client-notifications"],
    queryFn: () => load({ data: undefined as any }),
    refetchInterval: 60_000,
  });

  const unread = data?.unread ?? 0;

  const onOpen = (open: boolean) => {
    if (open && unread > 0) {
      markRead({ data: undefined as any }).then(() =>
        qc.invalidateQueries({ queryKey: ["client-notifications"] }),
      );
    }
  };

  return (
    <DropdownMenu onOpenChange={onOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative rounded-full" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold grid place-items-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(data?.notifications ?? []).length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground">No notifications yet.</p>
        )}
        {(data?.notifications ?? []).slice(0, 20).map((n) => (
          <DropdownMenuItem key={n.id} asChild={!!n.link}>
            {n.link ? (
              <Link to={n.link} className="flex flex-col items-start gap-0.5 cursor-pointer w-full">
                <span className="font-medium text-sm">{n.title}</span>
                {n.body && <span className="text-xs text-muted-foreground line-clamp-2">{n.body}</span>}
              </Link>
            ) : (
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-medium text-sm">{n.title}</span>
                {n.body && <span className="text-xs text-muted-foreground line-clamp-2">{n.body}</span>}
              </div>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
