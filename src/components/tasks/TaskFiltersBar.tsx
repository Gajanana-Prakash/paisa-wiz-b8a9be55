import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { TYPE_LABELS } from "./utils";

export type TaskFilters = {
  scope: "firm" | "mine";
  clientId?: string;
  assignedTo?: string;
  taskType?: string;
  priority?: string;
  search?: string;
};

export function TaskFiltersBar({
  filters, setFilters, clients, staff, hideClientFilter = false,
}: {
  filters: TaskFilters;
  setFilters: (f: TaskFilters) => void;
  clients: { id: string; business_name: string }[];
  staff: { id: string; name: string }[];
  hideClientFilter?: boolean;
}) {
  const update = (patch: Partial<TaskFilters>) => setFilters({ ...filters, ...patch });
  const clear = () => setFilters({ scope: filters.scope });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-full bg-muted p-0.5">
        <button
          onClick={() => update({ scope: "firm" })}
          className={`px-3 py-1 text-xs font-medium rounded-full transition ${filters.scope === "firm" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
        >All tasks</button>
        <button
          onClick={() => update({ scope: "mine" })}
          className={`px-3 py-1 text-xs font-medium rounded-full transition ${filters.scope === "mine" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
        >My tasks</button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={filters.search || ""}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Search title or client…"
          className="h-9 pl-8 w-56"
        />
      </div>

      {!hideClientFilter && (
        <Select value={filters.clientId || "ALL"} onValueChange={(v) => update({ clientId: v === "ALL" ? undefined : v })}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All clients</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.assignedTo || "ALL"} onValueChange={(v) => update({ assignedTo: v === "ALL" ? undefined : v })}>
        <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Assignee" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Anyone</SelectItem>
          {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.taskType || "ALL"} onValueChange={(v) => update({ taskType: v === "ALL" ? undefined : v })}>
        <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All types</SelectItem>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.priority || "ALL"} onValueChange={(v) => update({ priority: v === "ALL" ? undefined : v })}>
        <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Any priority</SelectItem>
          <SelectItem value="URGENT">Urgent</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
          <SelectItem value="MEDIUM">Medium</SelectItem>
          <SelectItem value="LOW">Low</SelectItem>
        </SelectContent>
      </Select>

      {(filters.search || filters.clientId || filters.assignedTo || filters.taskType || filters.priority) && (
        <Button variant="ghost" size="sm" onClick={clear} className="gap-1 text-muted-foreground">
          <X className="size-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}
