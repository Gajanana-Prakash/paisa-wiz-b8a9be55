import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Play, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getMyRunningTimer, startTimer, stopTimer } from "@/lib/timetracking.functions";
import { listFirmClientsLite, listTasks } from "@/lib/tasks.functions";
import { formatElapsedFromStart } from "./utils";

export function TimerWidget() {
  const qc = useQueryClient();
  const getRunning = useServerFn(getMyRunningTimer);
  const start = useServerFn(startTimer);
  const stop = useServerFn(stopTimer);
  const listClients = useServerFn(listFirmClientsLite);
  const listTasksFn = useServerFn(listTasks);

  const { data: running, refetch } = useQuery({
    queryKey: ["my-running-timer"],
    queryFn: () => getRunning({ data: undefined as any }),
    refetchInterval: 30_000,
  });

  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string>("");
  const [taskId, setTaskId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Live tick when timer is running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const { data: clients } = useQuery({
    queryKey: ["timer-clients"],
    queryFn: () => listClients({ data: undefined as any }),
    enabled: open,
  });

  const { data: tasks } = useQuery({
    queryKey: ["timer-tasks", clientId || "all"],
    queryFn: () =>
      listTasksFn({
        data: clientId ? { scope: "client" as const, clientId } : { scope: "firm" as const },
      }),
    enabled: open,
  });

  const elapsedLabel = useMemo(
    () => (running ? formatElapsedFromStart(running.started_at as string, now) : ""),
    [running, now],
  );

  const handleStart = useCallback(async () => {
    setBusy(true);
    try {
      await start({
        data: {
          clientId: clientId || null,
          taskId: taskId || null,
          description: description.trim() || null,
          isBillable: billable,
        },
      });
      setOpen(false);
      setDescription("");
      setTaskId("");
      await refetch();
      toast.success("Timer started");
    } catch (e: any) {
      toast.error(e.message ?? "Could not start timer");
    } finally {
      setBusy(false);
    }
  }, [start, clientId, taskId, description, billable, refetch]);

  const handleStop = useCallback(async () => {
    setBusy(true);
    try {
      const res = await stop({ data: {} });
      await refetch();
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      qc.invalidateQueries({ queryKey: ["active-timers"] });
      toast.success(`Logged ${res.durationMinutes}m`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not stop timer");
    } finally {
      setBusy(false);
    }
  }, [stop, refetch, qc]);

  if (running) {
    const label = (running as any).clients?.business_name ?? (running as any).tasks?.title ?? "Tracking…";
    return (
      <button
        type="button"
        onClick={handleStop}
        disabled={busy}
        className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15 transition text-sm font-medium"
        title="Click to stop timer"
      >
        <span className="relative inline-flex">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
        </span>
        <Clock className="size-4" />
        <span className="tabular-nums">{elapsedLabel}</span>
        <span className="hidden md:inline opacity-80 truncate max-w-[140px]">— {label}</span>
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Square className="size-3" />}
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
          <Clock className="size-4" />
          <span className="hidden md:inline">Start timer</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="font-display text-sm font-semibold">Start timer</div>
          <div>
            <Label className="text-xs">Client</Label>
            <select
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setTaskId(""); }}
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">— Internal (no client) —</option>
              {(clients ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.business_name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Task (optional)</Label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">— None —</option>
              {(tasks ?? []).map((t: any) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you working on?" className="mt-1" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Billable</Label>
            <Switch checked={billable} onCheckedChange={setBillable} />
          </div>
          <Button onClick={handleStart} disabled={busy} className="w-full gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Start
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
