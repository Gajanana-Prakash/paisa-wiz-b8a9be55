export type HsnRow = {
  id: string;
  hsn_code: string;
  description: string;
  chapter: string;
  chapter_description: string;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cess_rate: number | null;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
  notes: string | null;
  kind: "HSN";
};

export type SacRow = {
  id: string;
  sac_code: string;
  service_description: string;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
  exemption_condition: string | null;
  kind: "SAC";
};

export type GstSearchResult = (HsnRow | SacRow) & { totalGst: number };

export function totalGstPercent(cgst: number, sgst: number, igst: number) {
  if (igst > 0) return igst;
  return cgst + sgst;
}

export function formatRateLabel(cgst: number, sgst: number, igst: number, cess?: number | null) {
  const total = totalGstPercent(cgst, sgst, igst);
  if (total === 0) return "Exempt / 0%";
  const parts = [`CGST: ${cgst}%`, `SGST: ${sgst}%`, `IGST: ${igst}%`];
  if (cess && cess > 0) parts.push(`CESS: ${cess}%`);
  return parts.join(" | ");
}
