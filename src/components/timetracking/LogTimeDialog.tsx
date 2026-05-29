import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createTimeLog } from "@/lib/timetracking.functions";
import { listFirmClientsLite } from "@/lib/tasks.functions";

export function LogTimeDialog() {
  const qc = useQueryClient();
  const create = useServerFn(createTimeLog);
  const listClients = useServerFn(listFirmClientsLite);
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState("");
  const [startedAt, setStartedAt] = useState(() => new Date(Date.now() - 60 * 60_000).toISOString().slice(0, 16));
  const [endedAt, setEndedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [billable, setBillable] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["log-time-clients"],
    queryFn: () => listClients({ data: undefined as any }),
    enabled: open,
  });

  const submit = async () => {
    setBusy(true);
    try {
      await create({
        data: {
          clientId: clientId || null,
          description: description.trim() || null,
          startedAt: new Date(startedAt).toISOString(),
          endedAt: new Date(endedAt).toISOString(),
          isBillable: billable,
        },
      });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      toast.success("Time logged");
      setOpen(false);
      setDescription("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="size-4" /> Log time</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log time</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Client</Label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">— Internal —</option>
              {(clients ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between"><Label className="text-xs">Billable</Label><Switch checked={billable} onCheckedChange={setBillable} /></div>
          <Button onClick={submit} disabled={busy} className="w-full">{busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
