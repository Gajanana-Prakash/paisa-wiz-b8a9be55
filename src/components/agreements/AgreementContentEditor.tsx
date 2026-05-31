import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MERGE_TAGS } from "@/lib/agreements.server";

export function AgreementContentEditor({
  value,
  onChange,
  previewHtml,
  onPreview,
  previewLoading,
}: {
  value: string;
  onChange: (v: string) => void;
  previewHtml?: string;
  onPreview?: () => void;
  previewLoading?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Agreement content (HTML)</Label>
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              disabled={previewLoading}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {previewLoading ? "Rendering…" : "Preview with client data"}
            </button>
          )}
        </div>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={16}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Merge tags: {MERGE_TAGS.join(", ")}
        </p>
      </div>
      {previewHtml && (
        <div className="rounded-xl border bg-card p-6 prose prose-sm max-w-none agreement-preview">
          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}
    </div>
  );
}

export function AgreementDocumentView({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`prose prose-base max-w-none leading-relaxed agreement-document ${className ?? ""}`}
      style={{ fontSize: "17px", lineHeight: 1.7 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
