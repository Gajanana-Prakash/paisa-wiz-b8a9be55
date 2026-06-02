import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import {
  GraduationCap, Plus, Pencil, Trash2, ExternalLink, FileText,
  CheckCircle2, AlertTriangle, XCircle, CalendarDays, TrendingUp,
  Award, Clock, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  getCpeSummary, listCpeActivities, listUpcomingEvents,
  deleteCpeActivity, saveCpeProfile,
} from "@/lib/cpe.functions";
import { CpeProgressRing } from "@/components/cpe/CpeProgressRing";
import { LogActivityDialog } from "@/components/cpe/LogActivityDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/ca/my-profile/cpe")({
  component: CpePage,
});

const STATUS_META = {
  on_track:  { label: "On track",        color: "text-emerald-700",  bg: "bg-emerald-500/10  border-emerald-500/20",  Icon: CheckCircle2 },
  attention: { label: "Attention needed", color: "text-amber-700",   bg: "bg-amber-500/10    border-amber-500/20",   Icon: AlertTriangle },
  at_risk:   { label: "At risk",          color: "text-rose-700",    bg: "bg-rose-500/10     border-rose-500/20",    Icon: XCircle },
};

const TYPE_LABELS: Record<string, string> = {
  SEMINAR: "Seminar", WEBINAR: "Webinar", CONFERENCE: "Conference",
  SELF_READING: "Self Reading", WRITING: "Writing", TEACHING: "Teaching",
  ICAI_PROGRAM: "ICAI Program", E_LEARNING: "E-Learning", STUDY_CIRCLE: "Study Circle",
};

function fmtDate(d: string) {
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-20 text-right">
        {value} / {max} hrs
      </span>
    </div>
  );
}

function ProfileSettingsDialog({ open, onOpenChange, profile }: { open: boolean; onOpenChange: (v: boolean) => void; profile: any }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveCpeProfile);
  const [memNo, setMemNo] = useState(profile?.membership_number ?? "");
  const [memType, setMemType] = useState<"ASSOCIATE" | "FELLOW">(profile?.membership_type ?? "ASSOCIATE");
  const [copNo, setCopNo] = useState(profile?.cop_number ?? "");
  const [copExpiry, setCopExpiry] = useState(profile?.cop_expiry_date ?? "");
  const [blockStart, setBlockStart] = useState(profile?.current_cpe_block_start ?? "2022-04-01");
  const [blockEnd, setBlockEnd] = useState(profile?.current_cpe_block_end ?? "2025-03-31");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveFn({ data: {
        membershipNumber: memNo, membershipType: memType,
        copNumber: copNo, copExpiryDate: copExpiry || undefined,
        blockStart, blockEnd,
      }});
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["cpe-summary"] });
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>ICAI Profile Settings</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Membership Number</Label>
              <Input placeholder="e.g. 123456" value={memNo} onChange={(e) => setMemNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Membership Type</Label>
              <select
                value={memType}
                onChange={(e) => setMemType(e.target.value as "ASSOCIATE" | "FELLOW")}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="ASSOCIATE">Associate (ACA)</option>
                <option value="FELLOW">Fellow (FCA)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>COP Number</Label>
              <Input placeholder="Certificate of Practice" value={copNo} onChange={(e) => setCopNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>COP Expiry Date</Label>
              <Input type="date" value={copExpiry} onChange={(e) => setCopExpiry(e.target.value)} />
            </div>
          </div>
          <div className="pt-1 border-t">
            <p className="text-xs text-muted-foreground mb-3 font-medium">Current CPE Block</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Block Start</Label>
                <Input type="date" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Block End</Label>
                <Input type="date" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CpePage() {
  const qc = useQueryClient();
  const summaryFn = useServerFn(getCpeSummary);
  const activitiesFn = useServerFn(listCpeActivities);
  const eventsFn = useServerFn(listUpcomingEvents);
  const deleteFn = useServerFn(deleteCpeActivity);

  const [logOpen, setLogOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<any>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["cpe-summary"],
    queryFn: () => summaryFn({ data: undefined as any }),
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["cpe-activities"],
    queryFn: () => activitiesFn({ data: undefined as any }),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["icai-events"],
    queryFn: () => eventsFn({ data: undefined as any }),
    staleTime: 30 * 60_000,
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this activity? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteFn({ data: { id } });
      toast.success("Activity deleted");
      qc.invalidateQueries({ queryKey: ["cpe-summary"] });
      qc.invalidateQueries({ queryKey: ["cpe-activities"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setDeletingId(null); }
  };

  const status = summary?.status ?? "on_track";
  const meta = STATUS_META[status];
  const profile = summary?.profile;
  const total = summary?.total ?? 0;
  const structured = summary?.structured ?? 0;
  const unstructured = summary?.unstructured ?? 0;
  const pace = summary?.pace;
  const required = profile?.cpe_hours_required ?? 120;
  const structuredRequired = profile?.cpe_hours_structured_required ?? 90;
  const unstructuredMax = profile?.cpe_hours_unstructured_max ?? 30;

  const copExpiry = profile?.cop_expiry_date;
  const copDaysLeft = copExpiry
    ? Math.ceil((new Date(copExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const showCopAlert = copDaysLeft !== null && copDaysLeft <= 90;

  const currentMonth = new Date().getMonth();
  const showMembershipFeeAlert = currentMonth === 1;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <GraduationCap className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">My CPE Progress</h1>
            <p className="text-muted-foreground text-sm mt-0.5">ICAI Continuing Professional Education Tracker</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setProfileOpen(true)}>
            <Award className="size-4 mr-2" /> ICAI Profile
          </Button>
          <Button size="sm" onClick={() => { setEditActivity(null); setLogOpen(true); }}>
            <Plus className="size-4 mr-2" /> Log Activity
          </Button>
        </div>
      </div>

      {/* Membership Alerts */}
      {showCopAlert && copDaysLeft !== null && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="size-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-semibold text-sm text-amber-800">
                Certificate of Practice expires {copDaysLeft <= 0 ? "today" : `in ${copDaysLeft} days`}
              </div>
              <div className="text-xs text-amber-700 mt-0.5">
                Expiry: {fmtDate(copExpiry!)} — Renew on the ICAI Member portal to avoid suspension.
              </div>
            </div>
          </div>
          <a href="https://www.icai.org" target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="shrink-0">
              Renew at ICAI <ExternalLink className="size-3.5 ml-1.5" />
            </Button>
          </a>
        </div>
      )}
      {showMembershipFeeAlert && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarDays className="size-5 text-blue-600 shrink-0" />
            <div className="text-sm text-blue-800">
              <span className="font-semibold">ICAI annual membership fee</span> is due by 30 September.
              Remember to pay on the ICAI Member portal.
            </div>
          </div>
          <a href="https://www.icai.org" target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="shrink-0">
              ICAI Portal <ExternalLink className="size-3.5 ml-1.5" />
            </Button>
          </a>
        </div>
      )}

      {/* Progress Hero Card */}
      <div className="rounded-3xl border bg-card p-6 md:p-8">
        {summaryLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Ring */}
            <div className="relative shrink-0">
              <CpeProgressRing earned={total} required={required} status={status} size={180} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold tabular-nums">{total}</span>
                <span className="text-xs text-muted-foreground">/ {required} hrs</span>
              </div>
            </div>

            {/* Right side details */}
            <div className="flex-1 w-full space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className={`gap-1.5 px-3 py-1 ${meta.bg} ${meta.color} border`}>
                  <meta.Icon className="size-3.5" />
                  {meta.label}
                </Badge>
                {profile?.current_cpe_block_start && profile?.current_cpe_block_end && (
                  <span className="text-sm text-muted-foreground">
                    Block: {fmtDate(profile.current_cpe_block_start)} – {fmtDate(profile.current_cpe_block_end)}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Structured hours</div>
                <MiniBar value={structured} max={structuredRequired} color="bg-emerald-500" />
                <div className="text-xs font-medium text-muted-foreground mt-3">Unstructured hours</div>
                <MiniBar value={unstructured} max={unstructuredMax} color="bg-blue-500" />
              </div>

              {pace && (
                <div className="rounded-xl bg-muted/40 p-4 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold">{pace.remaining}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">hrs remaining</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{pace.requiredPace}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">hrs/month needed</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{pace.earnedPace}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">hrs/month so far</div>
                  </div>
                </div>
              )}
              {pace && pace.monthsLeft > 0 && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="size-4 text-primary shrink-0" />
                  To complete on time, you need <strong>{pace.remaining} more hours</strong> in the next <strong>{pace.monthsLeft} months</strong>.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="rounded-3xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold">CPE Activity Log</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{activities.length} activities recorded</p>
          </div>
          <Button size="sm" onClick={() => { setEditActivity(null); setLogOpen(true); }}>
            <Plus className="size-4 mr-1.5" /> Log Activity
          </Button>
        </div>
        {activities.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <GraduationCap className="size-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No activities yet</p>
            <p className="text-sm mt-1">Click "Log Activity" to start tracking your CPE hours.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Organizer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm whitespace-nowrap">{fmtDate(a.activity_date)}</TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="text-sm font-medium truncate block" title={a.title}>{a.title}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.organizer || "—"}</TableCell>
                    <TableCell className="text-sm">{TYPE_LABELS[a.activity_type] ?? a.activity_type}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={a.activity_category === "STRUCTURED"
                          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-700 border-blue-500/20"}
                      >
                        {a.activity_category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{Number(a.hours_claimed).toFixed(1)}</TableCell>
                    <TableCell>
                      {a.certificate_url
                        ? <a href={a.certificate_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-sm"><FileText className="size-3.5" /> View</a>
                        : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => { setEditActivity(a); setLogOpen(true); }}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => handleDelete(a.id)} disabled={deletingId === a.id}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Upcoming ICAI Events */}
      <div className="rounded-3xl border bg-card overflow-hidden">
        <div className="p-5 border-b">
          <h2 className="font-semibold">Upcoming CPE Opportunities</h2>
          <p className="text-xs text-muted-foreground mt-0.5">ICAI events & webinars you can attend for CPE credits</p>
        </div>
        {events.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <CalendarDays className="size-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No upcoming events listed yet</p>
            <p className="text-sm mt-1">Check <a href="https://www.icai.org" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">icai.org</a> for the latest events and webinars.</p>
          </div>
        ) : (
          <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((ev: any) => (
              <div key={ev.id} className="rounded-2xl border p-4 space-y-2 hover:bg-muted/30 transition">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">{ev.event_type}</Badge>
                  {ev.cpe_hours_awarded && (
                    <span className="text-xs font-semibold text-emerald-700">{ev.cpe_hours_awarded} CPE hrs</span>
                  )}
                </div>
                <div className="font-medium text-sm leading-snug">{ev.title}</div>
                <div className="text-xs text-muted-foreground">by {ev.organizer}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  {fmtDate(ev.event_date)}
                  {ev.event_time && ` · ${ev.event_time.slice(0, 5)}`}
                  {ev.duration_hours && ` · ${ev.duration_hours}h`}
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {ev.is_free
                    ? <span className="text-emerald-600 font-medium">Free for ICAI members</span>
                    : <span className="text-muted-foreground">₹{ev.fee_amount?.toLocaleString("en-IN") ?? "—"}</span>}
                </div>
                <div className="flex gap-2 pt-1">
                  {ev.registration_url && (
                    <a href={ev.registration_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button size="sm" variant="outline" className="w-full text-xs">Register <ExternalLink className="size-3 ml-1" /></Button>
                    </a>
                  )}
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => {
                    const url = `https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(ev.title)}&dates=${ev.event_date.replace(/-/g,"")}/${ev.event_date.replace(/-/g,"")}`;
                    window.open(url, "_blank");
                  }}>
                    <Clock className="size-3.5 mr-1" /> Calendar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <LogActivityDialog
        open={logOpen}
        onOpenChange={(v) => { setLogOpen(v); if (!v) setEditActivity(null); }}
        editing={editActivity}
      />
      {profile && (
        <ProfileSettingsDialog open={profileOpen} onOpenChange={setProfileOpen} profile={profile} />
      )}
    </div>
  );
}
