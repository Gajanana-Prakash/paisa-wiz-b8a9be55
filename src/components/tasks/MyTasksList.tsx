import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PlayCircle, Send, CheckCircle2, Clock, Timer } from "lucide-react";
import {
  PRIORITY_LABEL, PRIORITY_PILL, TYPE_LABELS, isOverdue, isDueToday, dueLabel,
} from "./utils";
import type { TaskCardData } from "./TaskCard";
import { toast } from "sonner";

export function MyTasksList({
  tasks, onOpen, onStatusChange,
}: {
  tasks: TaskCardData[];
  onOpen: (id: string) => void;
  onStatusChange: (id: string, status: TaskCardData["status"]) => void;
}) {
  // Sort: today first, then overdue, then by due date
  const sorted = [...tasks].sort((a, b) => {
    const aToday = isDueToday(a.due_date, a.status) ? 0 : 1;
    const bToday = isDueToday(b.due_date, b.status) ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    return (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31");
  });

  if (sorted.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground text-sm">You're all caught up. No tasks assigned to you.</div>;
  }

  return (
    <div className="space-y-2">
      {sorted.map((t) => {
        const today = isDueToday(t.due_date, t.status);
        const overdue = isOverdue(t.due_date, t.status);
        return (
          <div key={t.id} className={cn(
            "rounded-xl border bg-card p-4 flex flex-wrap items-center gap-3 transition",
            today ? "border-primary/40 bg-primary/[0.03]" : "border-border",
          )}>
            <button onClick={() => onOpen(t.id)} className="flex-1 min-w-0 text-left">
              <div className="flex items-center flex-wrap gap-2 mb-1">
                {t.clients?.business_name && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">{t.clients.business_name}</span>
                )}
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide", PRIORITY_PILL[t.priority])}>
                  {PRIORITY_LABEL[t.priority]}
                </span>
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md">{TYPE_LABELS[t.task_type]}</span>
              </div>
              <div className="font-medium text-sm">{t.title}</div>
              <div className={cn(
                "text-xs mt-1 inline-flex items-center gap-1",
                overdue ? "text-destructive font-medium" : today ? "text-warning font-medium" : "text-muted-foreground",
              )}>
                <Clock className="size-3.5" /> {dueLabel(t.due_date)}{overdue && " · overdue"}{today && !overdue && " · today"}
              </div>
            </button>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="gap-1" onClick={() => toast.info("Time tracking arrives in the next feature.")}>
                <Timer className="size-3.5" /> Start timer
              </Button>
              {t.status === "TODO" && (
                <Button size="sm" className="gap-1" onClick={() => onStatusChange(t.id, "IN_PROGRESS")}>
                  <PlayCircle className="size-3.5" /> Start
                </Button>
              )}
              {t.status === "IN_PROGRESS" && (
                <Button size="sm" className="gap-1" onClick={() => onStatusChange(t.id, "REVIEW")}>
                  <Send className="size-3.5" /> Submit
                </Button>
              )}
              {(t.status === "IN_PROGRESS" || t.status === "REVIEW") && (
                <Button size="sm" variant="outline" className="gap-1" onClick={() => onStatusChange(t.id, "COMPLETED")}>
                  <CheckCircle2 className="size-3.5" /> Done
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
