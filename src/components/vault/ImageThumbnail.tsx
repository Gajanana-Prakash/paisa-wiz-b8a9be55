import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getVaultSignedUrl } from "@/lib/vault.functions";
import { FileTypeIconView } from "./FileTypeIconView";
import { Loader2 } from "lucide-react";

export function ImageThumbnail({ documentId, fileType, className }: { documentId: string; fileType: string; className?: string }) {
  const sign = useServerFn(getVaultSignedUrl);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (fileType !== "IMAGE") return;
    let cancelled = false;
    sign({ data: { id: documentId, action: "VIEWED" } })
      .then((r) => { if (!cancelled) setUrl(r.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [documentId, fileType, sign]);

  if (fileType !== "IMAGE") {
    return <FileTypeIconView type={fileType} className={className ?? "size-12"} />;
  }
  if (!url) {
    return <div className="grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }
  return <img src={url} alt="" className={`object-cover rounded-md ${className ?? "size-full"}`} />;
}
