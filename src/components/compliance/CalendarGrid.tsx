import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TONE_PILL, toneFor } from "./status";
import type { DeadlineRow } from "./DeadlineDrawer";

type Props = {
  month: Date;
  onMonth: (d: Date) => void;
  rows: DeadlineRow[];
  onPick: (r: DeadlineRow) => void;
};

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export function CalendarGrid({ month, onMonth, rows, onPick }: Props) {
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startOffset = first.getDay();
    const total = startOffset + last.getDate();
    const rowsCount = Math.ceil(total / 7);
    const out: Array<{ date: Date | null }> = [];
    for (let i = 0; i < startOffset; i++) out.push({ date: null });
    for (let d = 1; d <= last.getDate(); d++) out.push({ date: new Date(month.getFullYear(), month.getMonth(), d) });
    while (out.length < rowsCount * 7) out.push({ date: null });
    return out;
  }, [month]);

  const byDay = useMemo(() => {
    const m = new Map<string, DeadlineRow[]>();
    for (const r of rows) {
      const k = r.due_date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [rows]);

  const todayKey = new Date(); todayKey.setHours(0,0,0,0);
  const todayStr = `${todayKey.getFullYear()}-${String(todayKey.getMonth()+1).padStart(2,"0")}-${String(todayKey.getDate()).padStart(2,"0")}`;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-display font-semibold text-lg">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h3>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMonth(new Date())}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-xs text-muted-foreground border-b border-border bg-secondary/30">
        {DAYS.map((d) => <div key={d} className="px-2 py-2 font-medium">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, idx) => {
          if (!c.date) return <div key={idx} className="min-h-[110px] border-t border-r border-border last-in-row:border-r-0 bg-muted/20" />;
          const key = `${c.date.getFullYear()}-${String(c.date.getMonth()+1).padStart(2,"0")}-${String(c.date.getDate()).padStart(2,"0")}`;
          const items = byDay.get(key) ?? [];
          const isToday = key === todayStr;
          return (
            <div
              key={idx}
              className={`min-h-[110px] border-t border-r border-border p-1.5 last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
              style={(idx + 1) % 7 === 0 ? { borderRightWidth: 0 } : undefined}
            >
              <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {c.date.getDate()}
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((r) => {
                  const t = toneFor(r.due_date, r.status);
                  return (
                    <button
                      key={r.id}
                      onClick={() => onPick(r)}
                      title={`${r.clients.business_name} — ${r.compliance_types.name}`}
                      className={`block w-full text-left text-[10.5px] leading-tight px-1.5 py-1 rounded truncate ${TONE_PILL[t]} hover:opacity-90`}
                    >
                      <span className="font-medium">{r.compliance_types.name}</span>
                      <span className="opacity-70"> · {r.clients.business_name}</span>
                    </button>
                  );
                })}
                {items.length > 3 && (
                  <button
                    onClick={() => onPick(items[3])}
                    className="text-[10.5px] text-muted-foreground hover:text-primary px-1.5"
                  >
                    +{items.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}