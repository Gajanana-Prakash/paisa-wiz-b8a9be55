import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Palette, Globe, Building2, Sparkles } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { useServerFn } from "@tanstack/react-start";
import { updateFirmBranding } from "@/lib/tenant.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ca/settings")({ component: SettingsPage });

function SettingsPage() {
  const { role, firm, refresh } = useTenant();
  const update = useServerFn(updateFirmBranding);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState("#1f6f4a");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isOwner = role === "ca_owner";

  useEffect(() => {
    if (!firm) return;
    setName(firm.name || "");
    setColor(firm.primary_color || "#1f6f4a");
    setSlug(firm.subdomain_slug || "");
    setLogoUrl(firm.logo_url || null);
  }, [firm?.id]);

  if (!firm) {
    return <div className="p-8 max-w-3xl mx-auto"><p className="text-muted-foreground">Loading workspace…</p></div>;
  }

  const handleLogo = async (file: File) => {
    if (!isOwner) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo must be under 2 MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${firm.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("firm-logos").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("firm-logos").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      await update({ data: { logoUrl: pub.publicUrl } });
      await refresh();
      toast.success("Logo updated");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally { setUploading(false); }
  };

  const removeLogo = async () => {
    setLogoUrl(null);
    await update({ data: { logoUrl: null } });
    await refresh();
    toast.success("Logo removed");
  };

  const save = async () => {
    setSaving(true);
    try {
      await update({
        data: {
          name: name.trim() || undefined,
          primaryColor: color || null,
          subdomainSlug: slug.trim() ? slug.trim().toLowerCase() : null,
        },
      });
      await refresh();
      toast.success("Branding saved");
    } catch (e: any) {
      toast.error(e.message || "Could not save");
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Building2 className="size-3.5" /> Settings
        </div>
        <h1 className="font-display text-3xl font-semibold mt-1">Branding & white-label</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Customize how your firm appears to your clients in their portal.
        </p>
      </div>

      {!isOwner && (
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Only the CA firm owner can change branding. You can view current settings below.
        </div>
      )}

      {/* Branding card */}
      <section className="bg-card border border-border rounded-3xl p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Firm branding</h2>
        </div>

        {/* Logo */}
        <div className="grid md:grid-cols-[180px_1fr] gap-6 items-start">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Logo</Label>
            <div className="mt-2 size-32 rounded-2xl border border-dashed border-border bg-muted/30 grid place-items-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt={`${name} logo`} className="max-h-full max-w-full object-contain" />
              ) : (
                <Building2 className="size-8 text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">CA Firm Logo</div>
            <p className="text-xs text-muted-foreground">PNG, JPG, or SVG. Square works best. Max 2 MB.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" disabled={!isOwner || uploading} onClick={() => fileRef.current?.click()} className="gap-2 rounded-full">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {logoUrl ? "Replace logo" : "Upload logo"}
              </Button>
              {logoUrl && isOwner && (
                <Button size="sm" variant="outline" onClick={removeLogo} className="rounded-full">Remove</Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogo(f); e.target.value = ""; }}
              />
            </div>
          </div>
        </div>

        {/* Firm name */}
        <div className="grid md:grid-cols-[180px_1fr] gap-6 items-start">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground md:pt-3">Firm name</Label>
          <div className="space-y-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} maxLength={120} />
            <p className="text-xs text-muted-foreground">Shown in your clients' portal header.</p>
          </div>
        </div>

        {/* Primary color */}
        <div className="grid md:grid-cols-[180px_1fr] gap-6 items-start">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground md:pt-3">Primary color</Label>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={!isOwner}
                className="h-10 w-14 rounded-md border border-border bg-transparent cursor-pointer disabled:opacity-50"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={!isOwner}
                className="font-mono uppercase max-w-[140px]"
                placeholder="#1f6f4a"
              />
              <div className="flex-1 h-10 rounded-md border border-border" style={{ background: color }} />
            </div>
            <p className="text-xs text-muted-foreground">Used for buttons, links and highlights across your clients' portal.</p>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button onClick={save} disabled={!isOwner || saving} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />} Save branding
          </Button>
        </div>
      </section>

      {/* Client portal preview */}
      <section className="bg-card border border-border rounded-3xl p-6 md:p-8">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Client portal preview</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">How your clients see your firm at the top of their portal.</p>
        <div className="mt-5 rounded-2xl border border-border overflow-hidden">
          <div className="p-5 flex items-center gap-3" style={{ background: color, color: "#fff" }}>
            <div className="size-10 rounded-xl bg-white/15 backdrop-blur grid place-items-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <Building2 className="size-5" />
              )}
            </div>
            <div className="leading-tight min-w-0">
              <div className="font-display font-semibold truncate">{name || "Your Firm"}</div>
              <div className="text-[11px] uppercase tracking-widest opacity-80">Powered by GSTify</div>
            </div>
          </div>
        </div>
      </section>

      {/* Subdomain — coming soon */}
      <section className="bg-card border border-border rounded-3xl p-6 md:p-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Custom subdomain</h2>
          </div>
          <Badge variant="secondary" className="rounded-full">Coming soon</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Give your clients a portal at your own domain.</p>

        <div className="mt-5 flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Subdomain</Label>
            <div className="mt-1 flex items-stretch rounded-md border border-border overflow-hidden bg-background">
              <span className="px-3 grid place-items-center text-xs text-muted-foreground bg-muted/40">gst.</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                disabled={!isOwner}
                placeholder="yourfirmname"
                maxLength={40}
                className="flex-1 px-2 py-2 bg-transparent text-sm focus:outline-none"
              />
              <span className="px-3 grid place-items-center text-xs text-muted-foreground bg-muted/40">.com</span>
            </div>
          </div>
          <Button disabled className="opacity-70">Reserve</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Your client portal: <span className="font-mono">gst.{slug || "yourfirmname"}.com</span> — Coming Soon
        </p>
      </section>

      <section className="bg-card border border-border rounded-3xl p-6 md:p-8">
        <h2 className="font-display text-lg font-semibold">Billing &amp; invoices</h2>
        <p className="text-xs text-muted-foreground mt-1">PAN, GSTIN, bank details, UPI, and invoice numbering for client fee invoices.</p>
        <Link to="/ca/settings/billing" className="inline-block mt-4">
          <Button variant="outline" size="sm">Billing settings</Button>
        </Link>
      </section>

      <div className="text-center">
        <Link to="/ca/dashboard" className="text-xs text-muted-foreground hover:text-foreground">← Back to dashboard</Link>
      </div>
    </div>
  );
}
