import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ArrowLeft, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  getEInvoiceSettings,
  saveEInvoiceSettings,
  testIrpConnection,
} from "@/lib/einvoice.functions";
import { SandboxBanner } from "@/components/einvoice/StatusBadges";

export const Route = createFileRoute("/_authenticated/ca/settings/e-invoice")({
  component: EInvoiceSettingsPage,
});

function EInvoiceSettingsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getEInvoiceSettings);
  const save = useServerFn(saveEInvoiceSettings);
  const test = useServerFn(testIrpConnection);

  const { data, isLoading } = useQuery({
    queryKey: ["einvoice-settings"],
    queryFn: () => load(),
  });

  const [gstin, setGstin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [clientIdIrp, setClientIdIrp] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    const s: any = data?.settings;
    if (!s) return;
    setGstin(s.gstin ?? "");
    setUsername(s.irp_username ?? "");
    setClientIdIrp(s.client_id_irp ?? "");
    setSandbox(s.sandbox_mode ?? true);
  }, [data?.settings]);

  if (isLoading)
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );

  const canEdit = data?.canEdit ?? false;
  const isConfigured = (data?.settings as any)?.is_configured ?? false;
  const lastConn = (data?.settings as any)?.last_connected_at;

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({
        data: {
          gstin: gstin.trim() || null,
          irpUsername: username.trim() || null,
          irpPassword: password || null,
          clientIdIrp: clientIdIrp.trim() || null,
          clientSecret: clientSecret || null,
          sandboxMode: sandbox,
        },
      });
      setPassword("");
      setClientSecret("");
      toast.success("e-Invoice settings saved");
      qc.invalidateQueries({ queryKey: ["einvoice-settings"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await test();
      setTestResult({ ok: res.ok, message: res.message });
      if (res.ok) toast.success("Connected to IRP portal");
      else toast.error(res.message);
      qc.invalidateQueries({ queryKey: ["einvoice-settings"] });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message ?? "Connection failed" });
      toast.error(e.message ?? "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <Link to="/ca/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to settings
      </Link>

      <div>
        <h1 className="font-display text-3xl font-semibold">e-Invoice (IRP) Configuration</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connect your CA firm's GSTIN to the NIC IRP portal to generate IRN and QR codes for invoices above ₹5 crore turnover.
        </p>
      </div>

      <SandboxBanner mockMode={data?.mockMode ?? false} sandbox={sandbox} />

      <section className="rounded-3xl border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              {isConfigured ? <ShieldCheck className="size-4 text-emerald-600" /> : <ShieldAlert className="size-4 text-amber-600" />}
              {isConfigured ? "Configured" : "Not configured yet"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lastConn ? `Last successful IRP connection: ${new Date(lastConn).toLocaleString("en-IN")}` : "Not yet connected to IRP."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Sandbox</Label>
            <Switch disabled={!canEdit} checked={sandbox} onCheckedChange={setSandbox} />
          </div>
        </div>

        {!sandbox && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 text-rose-900 px-3 py-2 text-xs">
            Only switch to Production after testing in Sandbox mode.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Your GSTIN</Label>
            <Input
              className="mt-1 font-mono"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              maxLength={15}
              disabled={!canEdit}
              placeholder="22ABCDE1234F1Z5"
            />
          </div>
          <div>
            <Label className="text-xs">IRP Username</Label>
            <Input
              className="mt-1"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={!canEdit}
              placeholder="GSTNxxxxxx"
            />
          </div>
          <div>
            <Label className="text-xs">IRP Password</Label>
            <Input
              type="password"
              className="mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!canEdit}
              placeholder={isConfigured ? "••••••••" : "IRP portal password"}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Leave blank to keep the existing password.</p>
          </div>
          <div>
            <Label className="text-xs">IRP API Client ID</Label>
            <Input
              className="mt-1 font-mono"
              value={clientIdIrp}
              onChange={(e) => setClientIdIrp(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">IRP API Client Secret</Label>
            <Input
              type="password"
              className="mt-1"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              disabled={!canEdit}
              placeholder={isConfigured ? "••••••••" : ""}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Leave blank to keep the existing secret.</p>
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-2 border-t">
          <Button variant="outline" disabled={!canEdit || testing} onClick={handleTest}>
            {testing && <Loader2 className="size-4 animate-spin mr-1.5" />}
            Test Connection
          </Button>
          <Button disabled={!canEdit || saving} onClick={handleSave}>
            {saving && <Loader2 className="size-4 animate-spin mr-1.5" />} Save configuration
          </Button>
        </div>

        {testResult && (
          <div
            className={`rounded-xl border px-3 py-2 text-sm ${
              testResult.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-rose-300 bg-rose-50 text-rose-900"
            }`}
          >
            {testResult.ok ? "✅ " : "❌ "}
            {testResult.message}
          </div>
        )}
      </section>

      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Only the CA firm owner can view or change IRP credentials.
        </p>
      )}
    </div>
  );
}
