import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logCall } from "@/lib/communications.functions";

export function LogCallDialog({
  open,
  onOpenChange,
  clientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  onSaved: () => void;
}) {
  const save = useServerFn(logCall);
  const now = new Date();
  const [callType, setCallType] = useState<"INBOUND" | "OUTBOUND">("OUTBOUND");
  const [callDate, setCallDate] = useState(now.toISOString().slice(0, 10));
  const [callTime, setCallTime] = useState(now.toTimeString().slice(0, 5));
  const [duration, setDuration] = useState("");
  const [outcome, setOutcome] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!outcome.trim()) {
      toast.error("Describe what was discussed");
      return;
    }
    setBusy(true);
    try {
      const res = await save({
        data: {
          clientId,
          callType,
          callDate,
          callTime: `${callTime}:00`,
          durationMinutes: duration ? Number(duration) : null,
          outcome: outcome.trim(),
          followUpRequired: followUp,
          followUpDate: followUp ? followUpDate || null : null,
          followUpNote: followUp ? followUpNote.trim() || null : null,
        },
      });
      toast.success(res.followUpTaskId ? "Call logged + follow-up task created" : "Call logged");
      onOpenChange(false);
      setOutcome("");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Log phone call</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Direction</Label>
              <select value={callType} onChange={(e) => setCallType(e.target.value as "INBOUND" | "OUTBOUND")} className="mt-1 w-full h-9 rounded-md border border-input px-3 text-sm">
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Duration (min)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Time</Label>
              <Input type="time" value={callTime} onChange={(e) => setCallTime(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Outcome / discussion *</Label>
            <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={4} className="mt-1" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Follow-up required?</Label>
            <Switch checked={followUp} onCheckedChange={setFollowUp} />
          </div>
          {followUp && (
            <>
              <div>
                <Label className="text-xs">Follow-up date</Label>
                <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Follow-up note</Label>
                <Input value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} className="mt-1" />
              </div>
            </>
          )}
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Save call log"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
