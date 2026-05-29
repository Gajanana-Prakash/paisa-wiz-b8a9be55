import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { getStaff, updateStaffProfile } from "@/lib/timetracking.functions";
import { LeavePanel } from "@/components/timetracking/LeavePanel";
import { TimesheetTable } from "@/components/timetracking/TimesheetTable";
import { formatMinutes, inr } from "@/components/timetracking/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ca/staff/$userId")({
  component: StaffDetailPage,
});

function StaffDetailPage() {
  const { userId: routeUserId } = Route.useParams();
  const { role, userId: myId } = useTenant();
  const isOwner = role === "ca_owner";
  const isSelf = myId === routeUserId;
  if (!isOwner && !isSelf) return <Navigate to="/ca/dashboard" />;

  const qc = useQueryClient();
  const loadStaff = useServerFn(getStaff);
  const updateProfile = useServerFn(updateStaffProfile);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-detail", routeUserId],
    queryFn: () => loadStaff({ data: { userId: routeUserId } }),
  });

  const [editing, setEditing] = useState(false);
  const [designation, setDesignation] = useState("");
  const [billingRate, setBillingRate] = useState("");
  const [costRate, setCostRate] = useState("");
  const [weeklyTarget, setWeeklyTarget] = useState("");
  const [leaveBalance, setLeaveBalance] = useState("");
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    const sp = (data as any)?.profile;
    setDesignation(sp?.designation ?? "");
    setBillingRate(String(sp?.billing_rate_per_hour ?? 0));
    setCostRate(String(sp?.cost_rate_per_hour ?? 0));
    setWeeklyTarget(String(sp?.weekly_target_hours ?? 40));
    setLeaveBalance(String(sp?.leave_balance ?? 0));
    setEditing(true);
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      await updateProfile({
        data: {
          userId: routeUserId,
          patch: {
            designation: designation.trim() || null,
            billing_rate_per_hour: Number(billingRate) || 0,
            cost_rate_per_hour: Number(costRate) || 0,
            weekly_target_hours: Number(weeklyTarget) || 40,
            leave_balance: Number(leaveBalance) || 0,
          },
        },
      });
      qc.invalidateQueries({ queryKey: ["staff-detail", routeUserId] });
      setEditing(false);
      toast.success("Profile updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Staff member not found.</p>
        <Link to="/ca/staff" className="text-primary text-sm mt-2 inline-block">Back to staff</Link>
      </div>
    );
  }

  const d = data as any;
  const sp = d.profile;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <Link to={isOwner ? "/ca/staff" : "/ca/dashboard"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{d.name}</h1>
          <p className="text-muted-foreground mt-1 capitalize">
            {d.designation || sp?.designation || "Staff"} · {String(d.role).replace("ca_", "")}
          </p>
        </div>
        {isOwner && !editing && (
          <Button variant="outline" size="sm" onClick={startEdit}>Edit profile</Button>
        )}
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard label="Hours this month" value={formatMinutes(d.stats.month_minutes)} />
        <StatCard label="Billable hours" value={formatMinutes(d.stats.month_billable_minutes)} />
        <StatCard label="Billable amount" value={inr(d.stats.month_billable_amount)} />
        <StatCard label="Tasks done / overdue" value={`${d.stats.tasks_completed} / ${d.stats.tasks_overdue}`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm">Profile</h2>
          {editing ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Designation</Label>
                <Input value={designation} onChange={(e) => setDesignation(e.target.value)} className="mt-1" />
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
                  <Label className="text-xs">Weekly target (h)</Label>
                  <Input type="number" value={weeklyTarget} onChange={(e) => setWeeklyTarget(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Leave balance (days)</Label>
                  <Input type="number" value={leaveBalance} onChange={(e) => setLeaveBalance(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveProfile} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground text-xs">Billing rate</dt><dd className="font-medium">{inr(Number(sp?.billing_rate_per_hour ?? 0))}/hr</dd></div>
              <div><dt className="text-muted-foreground text-xs">Cost rate</dt><dd className="font-medium">{inr(Number(sp?.cost_rate_per_hour ?? 0))}/hr</dd></div>
              <div><dt className="text-muted-foreground text-xs">Weekly target</dt><dd className="font-medium">{sp?.weekly_target_hours ?? 40}h</dd></div>
              <div><dt className="text-muted-foreground text-xs">Leave balance</dt><dd className="font-medium">{sp?.leave_balance ?? 0} days</dd></div>
              {sp?.joining_date && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground text-xs">Joined</dt>
                  <dd className="font-medium">{format(new Date(sp.joining_date), "dd MMM yyyy")}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Assigned clients</h2>
          {(d.assigned_clients ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No clients assigned.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {d.assigned_clients.map((c: any) => (
                <li key={c.id}>
                  <Link to="/ca/clients/$clientId" params={{ clientId: c.id }} className="text-primary hover:underline">
                    {c.business_name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold text-sm mb-4">Leave</h2>
        <LeavePanel
          staffUserId={routeUserId}
          leaveBalance={sp?.leave_balance}
          mode={isOwner && !isSelf ? "owner" : "self"}
        />
      </div>

      <div>
        <h2 className="font-semibold text-sm mb-3">Recent time logs</h2>
        <TimesheetTable rows={d.recent_logs ?? []} showStaff={false} allowEdit={isOwner} allowDelete={isOwner} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
