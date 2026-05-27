import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  getTask, updateTask, deleteTask, addComment,
  addSubtask, toggleSubtask, deleteSubtask, addAttachment,
} from "@/lib/tasks.functions";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Trash2, Plus, Paperclip, MessageCircle, ListChecks, History, Loader2 } from "lucide-react";
import { PRIORITY_LABEL, TYPE_LABELS, initials } from "./utils";

export function TaskDetailDrawer({
  taskId, open, onOpenChange, onChanged, staff,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
  staff: { id: string; name: string }[];
}) {
  const get = useServerFn(getTask);
  const upd = useServerFn(updateTask);
  const del = useServerFn(deleteTask);
  const com = useServerFn(addComment);
  const subAdd = useServerFn(addSubtask);
  const subTog = useServerFn(toggleSubtask);
  const subDel = useServerFn(deleteSubtask);
  const attAdd = useServerFn(addAttachment);
  const { role, firm } = useTenant();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [newSub, setNewSub] = useState("");
  const [uploading, setUploading] = useState(false);

  const canEdit = role === "ca_owner" || role === "ca_staff";
  const isOwner = role === "ca_owner";

  const load = async () => {
    if (!taskId) return;
    setLoading(true);
    try { setData(await get({ data: { id: taskId } })); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open && taskId) load(); }, [open, taskId]);

  const patch = async (p: any) => {
    if (!taskId) return;
    try { await upd({ data: { id: taskId, patch: p } }); await load(); onChanged(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleUpload = async (file: File) => {
    if (!taskId || !firm?.id) return;
    setUploading(true);
    try {
      const path = `${firm.id}/${taskId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("task-attachments").upload(path, file);
      if (error) throw error;
      const { data: signed } = await supabase.storage.from("task-attachments").createSignedUrl(path, 60 * 60 * 24 * 7);
      await attAdd({ data: { taskId, file_url: signed?.signedUrl || path, file_name: file.name } });
      await load();
      toast.success("File uploaded");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {loading || !data ? (
          <div className="grid place-items-center h-40"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="font-display">{data.task.title}</SheetTitle>
              <SheetDescription>
                {data.task.clients?.business_name || "Internal task"} ·
                <Badge variant="secondary" className="ml-2">{data.task.status.replace("_", " ")}</Badge>
                <Badge variant="outline" className="ml-2">{PRIORITY_LABEL[data.task.priority as keyof typeof PRIORITY_LABEL]}</Badge>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 mt-4">
              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={data.task.status} disabled={!canEdit} onValueChange={(v) => patch({ status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODO">To do</SelectItem>
                      <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                      <SelectItem value="REVIEW">Review</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={data.task.priority} disabled={!canEdit} onValueChange={(v) => patch({ priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Assignee</Label>
                  <Select value={data.task.assigned_to || ""} disabled={!canEdit} onValueChange={(v) => patch({ assigned_to: v || null })}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Due date</Label>
                  <Input type="date" value={data.task.due_date || ""} disabled={!canEdit}
                    onChange={(e) => patch({ due_date: e.target.value || null })} />
                </div>
                <div className="col-span-2">
                  <Label>Type</Label>
                  <Select value={data.task.task_type} disabled={!canEdit} onValueChange={(v) => patch({ task_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  defaultValue={data.task.description || ""} disabled={!canEdit} rows={3}
                  onBlur={(e) => { if (e.target.value !== (data.task.description || "")) patch({ description: e.target.value || null }); }}
                />
              </div>

              {/* Subtasks */}
              <div>
                <div className="flex items-center gap-2 mb-2 text-sm font-medium"><ListChecks className="size-4" /> Subtasks</div>
                <div className="space-y-1.5">
                  {data.subtasks.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-2 group">
                      <Checkbox checked={s.is_done} onCheckedChange={(v) => subTog({ data: { id: s.id, is_done: !!v } }).then(load)} />
                      <span className={`flex-1 text-sm ${s.is_done ? "line-through text-muted-foreground" : ""}`}>{s.title}</span>
                      {canEdit && (
                        <button onClick={() => subDel({ data: { id: s.id } }).then(load)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <form onSubmit={(e) => { e.preventDefault(); if (!newSub.trim()) return; subAdd({ data: { taskId: data.task.id, title: newSub.trim() } }).then(() => { setNewSub(""); load(); }); }}
                      className="flex gap-2">
                      <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add checklist item…" className="h-8 text-sm" />
                      <Button type="submit" size="sm" variant="outline" className="gap-1"><Plus className="size-3.5" /></Button>
                    </form>
                  )}
                </div>
              </div>

              {/* Comments */}
              <div>
                <div className="flex items-center gap-2 mb-2 text-sm font-medium"><MessageCircle className="size-4" /> Comments</div>
                <div className="space-y-2">
                  {data.comments.length === 0 && <div className="text-xs text-muted-foreground">No comments yet.</div>}
                  {data.comments.map((c: any) => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="size-7 rounded-full bg-secondary text-secondary-foreground text-[10px] grid place-items-center font-semibold shrink-0">
                        {initials(data.profiles[c.user_id])}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium">{data.profiles[c.user_id] || "User"}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-sm">{c.comment}</p>
                      </div>
                    </div>
                  ))}
                  <form onSubmit={(e) => { e.preventDefault(); if (!newComment.trim()) return; com({ data: { taskId: data.task.id, comment: newComment.trim() } }).then(() => { setNewComment(""); load(); }); }}
                    className="flex gap-2 pt-1">
                    <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment…" className="h-9 text-sm" />
                    <Button type="submit" size="sm">Post</Button>
                  </form>
                </div>
              </div>

              {/* Attachments */}
              <div>
                <div className="flex items-center gap-2 mb-2 text-sm font-medium"><Paperclip className="size-4" /> Attachments</div>
                <div className="space-y-1.5">
                  {data.attachments.map((a: any) => (
                    <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer"
                       className="text-sm flex items-center gap-2 text-primary hover:underline">
                      <Paperclip className="size-3.5" /> {a.file_name}
                    </a>
                  ))}
                  {canEdit && (
                    <label className="inline-flex items-center gap-2 text-xs text-primary cursor-pointer hover:underline">
                      <input type="file" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
                      {uploading ? "Uploading…" : "+ Attach file"}
                    </label>
                  )}
                </div>
              </div>

              {/* Time placeholder */}
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
                <History className="size-3.5" /> Time tracking arrives in the next feature.
              </div>

              {isOwner && (
                <div className="pt-2 border-t border-border">
                  <Button
                    variant="ghost" size="sm" className="text-destructive gap-1"
                    onClick={async () => {
                      if (!confirm("Delete this task? This cannot be undone.")) return;
                      try { await del({ data: { id: data.task.id } }); toast.success("Task deleted"); onOpenChange(false); onChanged(); }
                      catch (e: any) { toast.error(e.message); }
                    }}
                  >
                    <Trash2 className="size-3.5" /> Delete task
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
