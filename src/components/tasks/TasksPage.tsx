import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Plus, KanbanSquare, List } from "lucide-react";
import { toast } from "sonner";
import {
  listTasks, updateTask, listAssignableStaff, listFirmClientsLite,
} from "@/lib/tasks.functions";
import { TaskBoard } from "./TaskBoard";
import { TaskListView } from "./TaskListView";
import { TaskFiltersBar, type TaskFilters } from "./TaskFiltersBar";
import { NewTaskDialog } from "./NewTaskDialog";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import type { TaskCardData } from "./TaskCard";

export function TasksPage({
  title = "Tasks",
  fixedClientId,
}: { title?: string; fixedClientId?: string }) {
  const list = useServerFn(listTasks);
  const upd = useServerFn(updateTask);
  const loadStaff = useServerFn(listAssignableStaff);
  const loadClients = useServerFn(listFirmClientsLite);

  const [view, setView] = useState<"board" | "list">("board");
  const [filters, setFilters] = useState<TaskFilters>({
    scope: "firm",
    clientId: fixedClientId,
  });
  const [tasks, setTasks] = useState<TaskCardData[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; business_name: string }[]>([]);
  const [openNew, setOpenNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await list({ data: {
        scope: filters.scope,
        clientId: fixedClientId || filters.clientId,
        priority: filters.priority as any,
        taskType: filters.taskType as any,
        assignedTo: filters.assignedTo,
        search: filters.search,
      } });
      setTasks(data as any);
    } catch (e: any) { toast.error(e.message); }
  }, [list, filters, fixedClientId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadStaff({ data: undefined as any }).then(setStaff).catch(() => {});
    loadClients({ data: undefined as any }).then((c: any) => setClients(c)).catch(() => {});
  }, [loadStaff, loadClients]);

  const assigneeNames = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);

  const handleStatus = async (id: string, status: TaskCardData["status"]) => {
    // optimistic
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try { await upd({ data: { id, patch: { status } } }); }
    catch (e: any) { toast.error(e.message); load(); }
  };

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1500px] mx-auto space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">Plan, assign and track every piece of work across your firm.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-muted p-0.5">
            <button onClick={() => setView("board")}
              className={`px-2.5 py-1.5 rounded-full ${view === "board" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              title="Kanban">
              <KanbanSquare className="size-4" />
            </button>
            <button onClick={() => setView("list")}
              className={`px-2.5 py-1.5 rounded-full ${view === "list" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              title="List">
              <List className="size-4" />
            </button>
          </div>
          <Button onClick={() => setOpenNew(true)} className="gap-1.5"><Plus className="size-4" /> New task</Button>
        </div>
      </div>

      <TaskFiltersBar
        filters={filters}
        setFilters={setFilters}
        clients={clients}
        staff={staff}
        hideClientFilter={!!fixedClientId}
      />

      {view === "board" ? (
        <TaskBoard tasks={tasks} onStatusChange={handleStatus} onOpen={setOpenId} assigneeNames={assigneeNames} />
      ) : (
        <TaskListView tasks={tasks} onOpen={setOpenId} assigneeNames={assigneeNames} />
      )}

      <NewTaskDialog
        open={openNew} onOpenChange={setOpenNew}
        clients={clients} staff={staff}
        defaultClientId={fixedClientId}
        onCreated={load}
      />
      <TaskDetailDrawer
        taskId={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}
        onChanged={load}
        staff={staff}
      />
    </div>
  );
}
