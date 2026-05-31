import { FileText, FileSpreadsheet, FileType as FileTypeIcon, Image as ImageIcon, File as FileIcon } from "lucide-react";

export function FileTypeIconView({ type, className }: { type: string; className?: string }) {
  const cls = className ?? "size-8";
  if (type === "PDF") return <FileText className={`${cls} text-rose-600`} />;
  if (type === "EXCEL") return <FileSpreadsheet className={`${cls} text-emerald-600`} />;
  if (type === "WORD") return <FileTypeIcon className={`${cls} text-blue-600`} />;
  if (type === "IMAGE") return <ImageIcon className={`${cls} text-violet-600`} />;
  return <FileIcon className={`${cls} text-muted-foreground`} />;
}
