import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessageCircle, GripVertical, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRIORITY_PILL, PRIORITY_LABEL, TYPE_ICONS, TYPE_LABELS,
  isOverdue, isDueToday, dueLabel, initials,
  type TaskPriority, type TaskStatus, type TaskType,
} from "./utils";

export type TaskCardData = {
  id: string;
  title: string;
  client_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  task_type: TaskType;
  due_date: string | null;
  assigned_to: string | null;
  comment_count?: number;
  clients?: { business_name: string } | null;
  assigneeName?: string | null;
};

export function TaskCard({
  task, onClick, draggable = true, assigneeName,
}: { task: TaskCardData; onClick?: () => void; draggable?: boolean; assigneeName?: string | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id, disabled: !draggable,
  });
  const Icon = TYPE_ICONS[task.task_type];
  const overdue = isOverdue(task.due_date, task.status);
  const today = isDueToday(task.due_date, task.status);
  const name = assigneeName || task.assigneeName || null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative rounded-xl border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow",
        isDragging && "opacity-50 ring-2 ring-primary/40",
      )}
    >
      {draggable && (
        <button
          {...attributes} {...listeners}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition cursor-grab active:cursor-grabbing text-muted-foreground"
          aria-label="Drag"
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <button onClick={onClick} className="text-left w-full">
        {task.clients?.business_name && (
          <span className="inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary mb-1.5">
            {task.clients.business_name}
          </span>
        )}
        <div className="text-sm font-medium leading-snug pr-6">{task.title}</div>

        <div className="mt-2.5 flex items-center flex-wrap gap-1.5">
          <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide", PRIORITY_PILL[task.priority])}>
            {PRIORITY_LABEL[task.priority]}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
            <Icon className="size-3" /> {TYPE_LABELS[task.task_type]}
          </span>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span className={cn(
            "inline-flex items-center gap-1",
            overdue ? "text-destructive font-medium" : today ? "text-warning font-medium" : "text-muted-foreground",
          )}>
            <CalendarClock className="size-3.5" /> {dueLabel(task.due_date)}
            {overdue && " · overdue"}
            {today && !overdue && " · today"}
          </span>
          <span className="inline-flex items-center gap-2">
            {(task.comment_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                <MessageCircle className="size-3.5" /> {task.comment_count}
              </span>
            )}
            <span
              className="size-6 rounded-full bg-secondary text-secondary-foreground text-[10px] grid place-items-center font-semibold"
              title={name || "Unassigned"}
            >
              {name ? initials(name) : "—"}
            </span>
          </span>
        </div>
      </button>
    </div>
  );
}
