import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listTasks, updateTask, listAssignableStaff } from "@/lib/tasks.functions";
import { MyTasksList } from "@/components/tasks/MyTasksList";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import type { TaskCardData } from "@/components/tasks/TaskCard";

export const Route = createFileRoute("/_authenticated/ca/tasks/my-tasks")({
  component: MyTasksRoute,
});

function MyTasksRoute() {
  const list = useServerFn(listTasks);
  const upd = useServerFn(updateTask);
  const loadStaff = useServerFn(listAssignableStaff);
  const [tasks, setTasks] = useState<TaskCardData[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await list({ data: { scope: "mine" } });
      setTasks(data as any);
    } catch (e: any) { toast.error(e.message); }
  }, [list]);

  useEffect(() => { load(); loadStaff({ data: undefined as any }).then(setStaff).catch(() => {}); }, [load, loadStaff]);

  const handleStatus = async (id: string, status: TaskCardData["status"]) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try { await upd({ data: { id, patch: { status } } }); load(); }
    catch (e: any) { toast.error(e.message); load(); }
  };

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold">My tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">Today's work is highlighted. Update status as you progress.</p>
      </div>
      <MyTasksList tasks={tasks} onOpen={setOpenId} onStatusChange={handleStatus} />
      <TaskDetailDrawer
        taskId={openId} open={!!openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        onChanged={load} staff={staff}
      />
    </div>
  );
}
