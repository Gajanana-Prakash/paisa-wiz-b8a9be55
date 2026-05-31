import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { lookupGstCodeFn } from "@/lib/gst-library.functions";
import { codeLabel, descriptionLabel, formatGstTotal, suggestedGstRate } from "./GstRateBadge";
import type { GstSearchResult } from "@/lib/gst-library.utils";

export function HsnRateLookup({
  code,
  onApplyRate,
  compact,
}: {
  code: string;
  onApplyRate?: (gstPercent: number, label: string) => void;
  compact?: boolean;
}) {
  const lookup = useServerFn(lookupGstCodeFn);
  const [row, setRow] = useState<GstSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const c = code.trim();
    if (c.length < 2) {
      setRow(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      lookup({ data: { code: c } })
        .then((r: any) => {
          if (!cancelled) setRow(r.row ?? null);
        })
        .catch(() => {
          if (!cancelled) setRow(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, lookup]);

  if (!code.trim() || code.trim().length < 2) return null;
  if (loading && !row) {
    return <p className="text-xs text-muted-foreground mt-1">Looking up rate…</p>;
  }
  if (!row) return null;

  const label = `${codeLabel(row)}: ${descriptionLabel(row)}`;
  const rate = suggestedGstRate(row);

  return (
    <div
      className={
        "mt-1 rounded-lg border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-800 px-3 py-2 text-xs " +
        (compact ? "" : "")
      }
    >
      <p className="font-medium text-emerald-800 dark:text-emerald-300">
        {label} — CGST {row.cgst_rate}% + SGST {row.sgst_rate}% = Total{" "}
        <span className="text-base font-bold">{formatGstTotal(row)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        {onApplyRate && (
          <button
            type="button"
            className="text-emerald-700 dark:text-emerald-400 underline font-medium"
            onClick={() => onApplyRate(rate, label)}
          >
            Apply {rate}% GST
          </button>
        )}
        <Link to="/ca/gst-library" search={{ q: codeLabel(row) } as any} className="text-muted-foreground hover:text-foreground underline">
          Wrong rate? Check GST Library
        </Link>
      </div>
    </div>
  );
}
