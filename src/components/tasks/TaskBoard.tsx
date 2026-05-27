import { useMemo } from "react";
import {
  DndContext, PointerSensor, useSensor, useSensors, DragOverlay,
  useDroppable, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";
import { TaskCard, type TaskCardData } from "./TaskCard";
import { STATUS_COLUMNS, type TaskStatus } from "./utils";
import { cn } from "@/lib/utils";

export function TaskBoard({
  tasks, onStatusChange, onOpen, assigneeNames,
}: {
  tasks: TaskCardData[];
  onStatusChange: (id: string, status: TaskStatus) => void;
  onOpen: (id: string) => void;
  assigneeNames: Record<string, string>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<TaskStatus, TaskCardData[]>();
    for (const col of STATUS_COLUMNS) m.set(col.key, []);
    for (const t of tasks) {
      if (t.status === "CANCELLED") continue;
      m.get(t.status)?.push(t);
    }
    return m;
  }, [tasks]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const handleStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const target: TaskStatus | null = STATUS_COLUMNS.find((c) => c.key === overId)?.key ?? null;
    if (!target) {
      // dropped on another card — derive from that card's column
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask && overTask.status !== tasks.find((t) => t.id === e.active.id)?.status) {
        onStatusChange(String(e.active.id), overTask.status);
      }
      return;
    }
    const current = tasks.find((t) => t.id === e.active.id);
    if (current && current.status !== target) onStatusChange(current.id, target);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleStart} onDragEnd={handleEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto snap-x snap-mandatory md:snap-none">
        {STATUS_COLUMNS.map((col) => {
          const items = grouped.get(col.key) ?? [];
          return (
            <Column key={col.key} status={col.key} label={col.label} count={items.length}>
              <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 min-h-[120px]">
                  {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
                      Drop tasks here
                    </div>
                  ) : items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onClick={() => onOpen(t.id)}
                      assigneeName={t.assigned_to ? assigneeNames[t.assigned_to] : null}
                    />
                  ))}
                </div>
              </SortableContext>
            </Column>
          );
        })}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            draggable={false}
            assigneeName={activeTask.assigned_to ? assigneeNames[activeTask.assigned_to] : null}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status, label, count, children,
}: { status: TaskStatus; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "snap-start shrink-0 min-w-[260px] md:min-w-0 rounded-2xl border border-border bg-card/60 p-3 transition-colors",
        isOver && "bg-primary/5 border-primary/40",
      )}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-semibold">{count}</span>
      </div>
      {children}
    </div>
  );
}
