import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { requestLeave, decideLeave, listLeaveRequests } from "@/lib/timetracking.functions";
import { useTenant } from "@/hooks/useTenant";

const LEAVE_TYPES = ["CASUAL", "SICK", "EARNED", "HALF_DAY", "COMP_OFF"] as const;

export function LeavePanel({
  staffUserId,
  leaveBalance,
  mode,
}: {
  staffUserId?: string;
  leaveBalance?: number;
  mode: "self" | "owner";
}) {
  const { role, userId } = useTenant();
  const qc = useQueryClient();
  const request = useServerFn(requestLeave);
  const decide = useServerFn(decideLeave);
  const listLeaves = useServerFn(listLeaveRequests);

  const scope = mode === "self" ? "mine" : "firm";
  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ["leave-requests", scope, staffUserId],
    queryFn: () => listLeaves({ data: { scope } }),
  });

  const [leaveDate, setLeaveDate] = useState("");
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPES)[number]>("CASUAL");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = staffUserId
    ? (leaves as any[]).filter((l) => l.staff_user_id === staffUserId)
    : (leaves as any[]);

  const pending = filtered.filter((l) => l.status === "PENDING");
  const showRequestForm = mode === "self" || (mode === "owner" && staffUserId === userId);

  const submitRequest = async () => {
    if (!leaveDate) {
      toast.error("Pick a leave date");
      return;
    }
    setBusy(true);
    try {
      await request({ data: { leaveDate, leaveType, reason: reason.trim() || null } });
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success("Leave request submitted");
      setLeaveDate("");
      setReason("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDecide = async (id: string, status: "APPROVED" | "REJECTED") => {
    try {
      await decide({ data: { id, status } });
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["staff-detail"] });
      qc.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success(status === "APPROVED" ? "Leave approved" : "Leave rejected");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const statusBadge = (status: string) => {
    if (status === "APPROVED") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Approved</Badge>;
    if (status === "REJECTED") return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="secondary">Pending</Badge>;
  };

  return (
    <div className="space-y-4">
      {leaveBalance != null && (
        <div className="text-sm">
          <span className="text-muted-foreground">Leave balance: </span>
          <span className="font-semibold">{leaveBalance} days</span>
        </div>
      )}

      {showRequestForm && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
          <div className="text-sm font-semibold">Request leave</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as (typeof LEAVE_TYPES)[number])}
                className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" className="mt-1" />
          </div>
          <Button size="sm" onClick={submitRequest} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Submit request"}
          </Button>
        </div>
      )}

      {mode === "owner" && role === "ca_owner" && pending.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
          <div className="text-sm font-semibold">Pending approvals ({pending.length})</div>
          {pending.map((l: any) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 bg-background rounded-lg p-2 border border-border text-sm">
              <div>
                <span className="font-medium">{l.staff_name}</span>
                <span className="text-muted-foreground"> · {format(new Date(l.leave_date), "dd MMM yyyy")} · {l.leave_type}</span>
                {l.reason && <div className="text-xs text-muted-foreground">{l.reason}</div>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => handleDecide(l.id, "APPROVED")}>
                  <Check className="size-3" /> Approve
                </Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive" onClick={() => handleDecide(l.id, "REJECTED")}>
                  <X className="size-3" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-sm font-semibold">Leave history</div>
        {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-xs text-muted-foreground">No leave records.</div>
        )}
        {filtered.slice(0, 20).map((l: any) => (
          <div key={l.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border/60 last:border-0">
            <div>
              {mode === "owner" && <span className="font-medium mr-2">{l.staff_name}</span>}
              <span>{format(new Date(l.leave_date), "dd MMM yyyy")}</span>
              <span className="text-muted-foreground ml-2">{l.leave_type}</span>
            </div>
            {statusBadge(l.status)}
          </div>
        ))}
      </div>
    </div>
  );
}
