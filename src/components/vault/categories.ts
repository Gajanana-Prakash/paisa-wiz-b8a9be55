export const VAULT_CATEGORIES = [
  { value: "KYC", label: "KYC Documents", icon: "User" },
  { value: "GST", label: "GST Filings", icon: "Receipt" },
  { value: "INCOME_TAX", label: "Income Tax", icon: "FileText" },
  { value: "AUDIT", label: "Audit Reports", icon: "ShieldCheck" },
  { value: "BANKING", label: "Bank Statements", icon: "Wallet" },
  { value: "CORPORATE", label: "Corporate", icon: "Building2" },
  { value: "INVOICES", label: "Invoices", icon: "FileSpreadsheet" },
  { value: "NOTICES", label: "Notices", icon: "AlertTriangle" },
  { value: "AGREEMENTS", label: "Agreements", icon: "FilePen" },
  { value: "OTHER", label: "Other", icon: "Folder" },
] as const;

export type VaultCategory = (typeof VAULT_CATEGORIES)[number]["value"];

export const SUBCATEGORIES: Record<VaultCategory, string[]> = {
  KYC: ["PAN Card", "Aadhaar", "GST Certificate", "Incorporation Certificate", "MOA/AOA", "Partnership Deed", "Other"],
  GST: ["GSTR-1", "GSTR-3B", "GSTR-9", "GSTR-9C", "GSTR-2A", "ITC-04", "Other"],
  INCOME_TAX: ["ITR", "Form 16", "Form 26AS", "TDS Return", "Computation", "Tax Audit Report", "Other"],
  AUDIT: ["Statutory Audit Report", "Tax Audit Report", "Internal Audit", "Financial Statements", "Other"],
  BANKING: ["Bank Statement", "Cheque Book", "Bank Certificate", "Other"],
  CORPORATE: ["MCA Filing", "AOC-4", "MGT-7", "DIR-3 KYC", "Board Resolution", "Other"],
  INVOICES: ["Sales Invoice", "Purchase Invoice", "Credit Note", "Debit Note", "Other"],
  NOTICES: ["GST Notice", "Income Tax Notice", "MCA Notice", "Other"],
  AGREEMENTS: ["Engagement Letter", "NDA", "Service Agreement", "Lease", "Other"],
  OTHER: ["Other"],
};

export function detectFileType(name: string, mime?: string): "PDF" | "IMAGE" | "EXCEL" | "WORD" | "OTHER" {
  const n = name.toLowerCase();
  const m = (mime || "").toLowerCase();
  if (n.endsWith(".pdf") || m === "application/pdf") return "PDF";
  if (/\.(png|jpe?g|webp|gif|heic|bmp|tiff?)$/.test(n) || m.startsWith("image/")) return "IMAGE";
  if (/\.(xlsx?|csv|ods)$/.test(n) || m.includes("excel") || m.includes("spreadsheet")) return "EXCEL";
  if (/\.(docx?|odt|rtf)$/.test(n) || m.includes("word") || m.includes("document")) return "WORD";
  return "OTHER";
}
