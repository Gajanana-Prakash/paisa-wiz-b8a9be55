import { Badge } from "@/components/ui/badge";
import { STATUS_META, type CaInvoiceStatus } from "./utils";

export function InvoiceStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as CaInvoiceStatus] ?? STATUS_META.DRAFT;
  return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>;
}
