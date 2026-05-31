import { Badge } from "@/components/ui/badge";
import { AGREEMENT_STATUS_META, type AgreementStatus } from "./utils";

export function AgreementStatusBadge({ status }: { status: string }) {
  const meta = AGREEMENT_STATUS_META[status as AgreementStatus] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}
