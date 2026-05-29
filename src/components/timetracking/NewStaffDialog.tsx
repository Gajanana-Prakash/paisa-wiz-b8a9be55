import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addStaffMember } from "@/lib/timetracking.functions";
import { listFirmClientsLite } from "@/lib/tasks.functions";

export function NewStaffDialog() {
  const qc = useQueryClient();
  const add = useServerFn(addStaffMember);
  const listClients = useServerFn(listFirmClientsLite);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [billingRate, setBillingRate] = useState("1500");
  const [costRate, setCostRate] = useState("500");
  const [weeklyTarget, setWeeklyTarget] = useState("40");
  const [joiningDate, setJoiningDate] = useState("");
  const [clientIds, setClientIds] = useState<string[]>([]);

  const { data: clients = [] } = useQuery({
    queryKey: ["staff-form-clients"],
    queryFn: () => listClients({ data: undefined as any }),
    enabled: open,
  });

  const toggleClient = (id: string) => {
    setClientIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setBusy(true);
    try {
      await add({
        data: {
          email: email.trim(),
          fullName: fullName.trim() || null,
          designation: designation.trim() || null,
          billingRate: Number(billingRate) || 0,
          costRate: Number(costRate) || 0,
          weeklyTargetHours: Number(weeklyTarget) || 40,
          joiningDate: joiningDate || null,
          clientIds: clientIds.length ? clientIds : undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success("Staff member invited");
      setOpen(false);
      setFullName("");
      setEmail("");
      setDesignation("");
      setClientIds([]);
    } catch (e: any) {
      toast.error(e.message ?? "Could not add staff");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" /> Add staff member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add staff member</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Designation</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Associate" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Billing rate (₹/hr)</Label>
              <Input type="number" value={billingRate} onChange={(e) => setBillingRate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Cost rate (₹/hr)</Label>
              <Input type="number" value={costRate} onChange={(e) => setCostRate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Weekly target (hours)</Label>
              <Input type="number" value={weeklyTarget} onChange={(e) => setWeeklyTarget(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Joining date</Label>
              <Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Assign clients</Label>
            <div className="mt-2 max-h-36 overflow-y-auto rounded-md border border-border p-2 space-y-1">
              {(clients as any[]).length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No clients yet.</p>
              )}
              {(clients as any[]).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm px-1 py-0.5 cursor-pointer hover:bg-muted/50 rounded">
                  <input type="checkbox" checked={clientIds.includes(c.id)} onChange={() => toggleClient(c.id)} />
                  {c.business_name}
                </label>
              ))}
            </div>
          </div>
          <Button onClick={submit} disabled={busy} className="w-full gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Invite staff"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
