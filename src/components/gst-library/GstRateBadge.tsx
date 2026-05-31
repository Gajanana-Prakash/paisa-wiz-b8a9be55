import { formatRateLabel, totalGstPercent, type GstSearchResult } from "@/lib/gst-library.utils";

export function formatGstTotal(row: GstSearchResult) {
  const total = row.totalGst;
  if (total === 0) return "Exempt / 0%";
  return `${total}%`;
}

export function GstRateLines({ row }: { row: GstSearchResult }) {
  if (row.kind === "HSN") {
    return (
      <p className="text-sm text-muted-foreground">
        {formatRateLabel(row.cgst_rate, row.sgst_rate, row.igst_rate, row.cess_rate)}
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      {formatRateLabel(row.cgst_rate, row.sgst_rate, row.igst_rate)}
    </p>
  );
}

export function codeLabel(row: GstSearchResult) {
  return row.kind === "HSN" ? row.hsn_code : row.sac_code;
}

export function descriptionLabel(row: GstSearchResult) {
  return row.kind === "HSN" ? row.description : row.service_description;
}

export function suggestedGstRate(row: GstSearchResult) {
  return totalGstPercent(row.cgst_rate, row.sgst_rate, row.igst_rate);
}
