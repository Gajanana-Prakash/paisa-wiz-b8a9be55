import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, Tag, MinusCircle } from "lucide-react";

export function MatchStatusBadge({ status, confidence }: { status: string; confidence?: number | null }) {
  if (status === "MATCHED" || status === "MANUALLY_MATCHED") {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1 rounded-full">
        <CheckCircle2 className="size-3" /> {status === "MANUALLY_MATCHED" ? "Confirmed" : "Matched"}
      </Badge>
    );
  }
  if (status === "EXCLUDED") {
    return (
      <Badge variant="secondary" className="gap-1 rounded-full">
        <MinusCircle className="size-3" /> Excluded
      </Badge>
    );
  }
  // Unmatched but has a category set → "Categorized"
  if (confidence != null && confidence > 0) {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1 rounded-full">
        <AlertTriangle className="size-3" /> Review
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 gap-1 rounded-full">
      <XCircle className="size-3" /> Unmatched
    </Badge>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  if (!category || category === "UNKNOWN") return null;
  return (
    <Badge variant="outline" className="gap-1 rounded-full text-xs">
      <Tag className="size-3" /> {category.replace(/_/g, " ").toLowerCase()}
    </Badge>
  );
}

export function ConfidencePill({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round(Number(value) * 100);
  const color = pct >= 85 ? "text-green-700" : pct >= 60 ? "text-amber-700" : "text-red-700";
  return <span className={`text-xs font-medium ${color}`}>{pct}%</span>;
}

export function TxnAmount({ amount, type }: { amount: number; type: "CREDIT" | "DEBIT" }) {
  const cls = type === "CREDIT" ? "text-green-700" : "text-red-700";
  const sign = type === "CREDIT" ? "+" : "−";
  return (
    <span className={`font-mono font-medium ${cls}`}>
      {sign} ₹{Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
    </span>
  );
}
