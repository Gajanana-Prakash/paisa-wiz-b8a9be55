import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useTenant } from "@/hooks/useTenant";
import { listStaff } from "@/lib/timetracking.functions";
import { NewStaffDialog } from "@/components/timetracking/NewStaffDialog";
import { formatMinutes } from "@/components/timetracking/utils";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ca/staff")({ component: StaffListPage });

function StaffListPage() {
  const { role } = useTenant();
  if (role !== "ca_owner") return <Navigate to="/ca/dashboard" />;

  const listStaffFn = useServerFn(listStaff);
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff-list"],
    queryFn: () => listStaffFn({ data: undefined as any }),
  });

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Staff</h1>
          <p className="text-muted-foreground mt-1">Manage team members, rates, and utilization.</p>
        </div>
        <NewStaffDialog />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Designation</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Joined</th>
                <th className="px-4 py-2.5 text-right">This week</th>
                <th className="px-4 py-2.5 text-center">Pending leave</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && staff.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No staff yet. Invite your first team member.</td></tr>
              )}
              {(staff as any[]).map((s) => (
                <tr key={s.user_id} className="border-t border-border even:bg-muted/20 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.designation ?? "—"}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{String(s.role).replace("ca_", "")}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {s.joining_date ? format(new Date(s.joining_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMinutes(s.week_minutes)} <span className="text-muted-foreground text-xs">/ {s.weekly_target_hours}h</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.pending_leaves > 0 ? (
                      <Badge variant="secondary">{s.pending_leaves}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.is_active ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to="/ca/staff/$userId"
                      params={{ userId: s.user_id }}
                      className="inline-flex text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
