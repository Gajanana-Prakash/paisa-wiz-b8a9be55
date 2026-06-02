import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logCpeActivity, updateCpeActivity } from "@/lib/cpe.functions";

const ACTIVITY_TYPES = [
  { value: "SEMINAR",      label: "Seminar",       category: "STRUCTURED" },
  { value: "WEBINAR",      label: "Webinar",        category: "STRUCTURED" },
  { value: "CONFERENCE",   label: "Conference",     category: "STRUCTURED" },
  { value: "ICAI_PROGRAM", label: "ICAI Program",   category: "STRUCTURED" },
  { value: "E_LEARNING",   label: "E-Learning",     category: "STRUCTURED" },
  { value: "STUDY_CIRCLE", label: "Study Circle",   category: "STRUCTURED" },
  { value: "SELF_READING", label: "Self Reading",   category: "UNSTRUCTURED" },
  { value: "WRITING",      label: "Writing/Article", category: "UNSTRUCTURED" },
  { value: "TEACHING",     label: "Teaching",       category: "UNSTRUCTURED" },
] as const;

type ActivityType = typeof ACTIVITY_TYPES[number]["value"];

interface EditActivity {
  id: string;
  activity_date: string;
  activity_type: ActivityType;
  title: string;
  organizer: string;
  hours_claimed: number;
  certificate_url: string | null;
  icai_activity_id: string | null;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: EditActivity | null;
}

export function LogActivityDialog({ open, onOpenChange, editing }: Props) {
  const qc = useQueryClient();
  const logFn = useServerFn(logCpeActivity);
  const updateFn = useServerFn(updateCpeActivity);

  const today = new Date().toISOString().slice(0, 10);

  const [activityType, setActivityType] = useState<ActivityType>("WEBINAR");
  const [activityDate, setActivityDate] = useState(today);
  const [title, setTitle] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [hours, setHours] = useState("2");
  const [certUrl, setCertUrl] = useState("");
  const [icaiId, setIcaiId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const category = ACTIVITY_TYPES.find((a) => a.value === activityType)?.category ?? "STRUCTURED";

  useEffect(() => {
    if (editing) {
      setActivityType(editing.activity_type);
      setActivityDate(editing.activity_date);
      setTitle(editing.title);
      setOrganizer(editing.organizer);
      setHours(String(editing.hours_claimed));
      setCertUrl(editing.certificate_url ?? "");
      setIcaiId(editing.icai_activity_id ?? "");
      setNotes(editing.notes ?? "");
    } else {
      setActivityType("WEBINAR");
      setActivityDate(today);
      setTitle("");
      setOrganizer("");
      setHours("2");
      setCertUrl("");
      setIcaiId("");
      setNotes("");
    }
  }, [editing, open]);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Activity title is required"); return; }
    const h = parseFloat(hours);
    if (isNaN(h) || h < 0.5 || h > 24) { toast.error("Hours must be between 0.5 and 24"); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateFn({ data: {
          id: editing.id,
          activityDate, activityType, title: title.trim(),
          organizer: organizer.trim(), hoursClaimed: h,
          certificateUrl: certUrl || undefined, icaiActivityId: icaiId || undefined,
          notes: notes || undefined,
        }});
        toast.success("Activity updated");
      } else {
        await logFn({ data: {
          activityDate, activityType, title: title.trim(),
          organizer: organizer.trim(), hoursClaimed: h,
          certificateUrl: certUrl || undefined, icaiActivityId: icaiId || undefined,
          notes: notes || undefined,
        }});
        toast.success("Activity logged");
      }
      qc.invalidateQueries({ queryKey: ["cpe-summary"] });
      qc.invalidateQueries({ queryKey: ["cpe-activities"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Activity" : "Log CPE Activity"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Activity Type</Label>
              <Select value={activityType} onValueChange={(v) => setActivityType(v as ActivityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <div className="h-10 flex items-center">
                <Badge
                  variant="outline"
                  className={category === "STRUCTURED"
                    ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                    : "bg-blue-500/15 text-blue-700 border-blue-500/30"}
                >
                  {category}
                </Badge>
                <span className="ml-2 text-xs text-muted-foreground">
                  {category === "STRUCTURED"
                    ? "ICAI classifies this as Structured"
                    : "ICAI classifies this as Unstructured"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Activity Title <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. GST Amendments 2025-26 — Key Changes"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Organizer</Label>
              <Input placeholder="WIRC of ICAI / External" value={organizer} onChange={(e) => setOrganizer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Hours Claimed <span className="text-destructive">*</span></Label>
              <Input
                type="number" step="0.5" min="0.5" max="24"
                placeholder="e.g. 3.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>ICAI Activity ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="From ICAI portal" value={icaiId} onChange={(e) => setIcaiId(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Certificate URL <span className="text-muted-foreground text-xs">(optional — paste Google Drive / URL)</span></Label>
            <Input
              type="url" placeholder="https://drive.google.com/..."
              value={certUrl} onChange={(e) => setCertUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Certificates help if ICAI asks for records during verification.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input placeholder="Any additional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Log Activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
