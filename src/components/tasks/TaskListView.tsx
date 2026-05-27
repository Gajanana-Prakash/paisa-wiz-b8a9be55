import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  PRIORITY_LABEL, PRIORITY_PILL, TYPE_LABELS, isOverdue, isDueToday, dueLabel, initials,
} from "./utils";
import type { TaskCardData } from "./TaskCard";

export function TaskListView({
  tasks, onOpen, assigneeNames,
}: {
  tasks: TaskCardData[];
  onOpen: (id: string) => void;
  assigneeNames: Record<string, string>;
}) {
  if (tasks.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground text-sm">No tasks match these filters.</div>;
  }
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Task</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Priority</th>
              <th className="p-3 font-medium">Assignee</th>
              <th className="p-3 font-medium">Due</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const overdue = isOverdue(t.due_date, t.status);
              const today = isDueToday(t.due_date, t.status);
              const name = t.assigned_to ? assigneeNames[t.assigned_to] : null;
              return (
                <tr key={t.id} className="border-t border-border hover:bg-secondary/30 cursor-pointer" onClick={() => onOpen(t.id)}>
                  <td className="p-3 font-medium">{t.title}</td>
                  <td className="p-3 text-muted-foreground">{t.clients?.business_name || "Internal"}</td>
                  <td className="p-3 text-muted-foreground">{TYPE_LABELS[t.task_type]}</td>
                  <td className="p-3">
                    <span className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide", PRIORITY_PILL[t.priority])}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{name || "—"} {name && <span className="text-xs text-muted-foreground/70">({initials(name)})</span>}</td>
                  <td className={cn("p-3", overdue ? "text-destructive font-medium" : today ? "text-warning font-medium" : "text-muted-foreground")}>
                    {dueLabel(t.due_date)}{overdue && " · overdue"}{today && !overdue && " · today"}
                  </td>
                  <td className="p-3"><Badge variant="secondary">{t.status.replace("_", " ")}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
