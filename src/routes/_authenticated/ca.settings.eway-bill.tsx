import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getEwayBillSettings, saveEwayBillSettings, testEwayConnection } from "@/lib/eway.functions";
import { EwbSandboxBanner } from "@/components/eway/StatusBadges";

export const Route = createFileRoute("/_authenticated/ca/settings/eway-bill")({
  component: EwayBillSettingsPage,
});

function EwayBillSettingsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getEwayBillSettings);
  const save = useServerFn(saveEwayBillSettings);
  const test = useServerFn(testEwayConnection);

  const { data, isLoading } = useQuery({
    queryKey: ["ewb-settings"],
    queryFn: () => load(),
  });

  const [gstin, setGstin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const [defaultMode, setDefaultMode] = useState<"ROAD" | "RAIL" | "AIR" | "SHIP">("ROAD");
  const [defaultVehicle, setDefaultVehicle] = useState<"REGULAR" | "OVER_DIMENSIONAL_CARGO">("REGULAR");
  const [autoLink, setAutoLink] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    const s: any = data?.settings;
    if (!s) return;
    setGstin(s.gstin ?? "");
    setUsername(s.ewb_username ?? "");
    setSandbox(s.sandbox_mode ?? true);
    setDefaultMode(s.default_transport_mode ?? "ROAD");
    setDefaultVehicle(s.default_vehicle_type ?? "REGULAR");
    setAutoLink(s.auto_link_with_einvoice ?? true);
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
          ewbUsername: username.trim() || null,
          ewbPassword: password || null,
          sandboxMode: sandbox,
          defaultTransportMode: defaultMode,
          defaultVehicleType: defaultVehicle,
          autoLinkWithEinvoice: autoLink,
        },
      });
      setPassword("");
      toast.success("E-way bill settings saved");
      qc.invalidateQueries({ queryKey: ["ewb-settings"] });
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
      if (res.ok) toast.success("Connected to NIC EWB portal");
      else toast.error(res.message);
      qc.invalidateQueries({ queryKey: ["ewb-settings"] });
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
        <h1 className="font-display text-3xl font-semibold">E-Way Bill Configuration</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connect your CA firm's GSTIN to the NIC E-Way Bill portal to generate and manage EWBs for goods movement.
        </p>
      </div>

      <EwbSandboxBanner mockMode={data?.mockMode ?? false} sandbox={sandbox} />

      <section className="rounded-3xl border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              {isConfigured ? <ShieldCheck className="size-4 text-emerald-600" /> : <ShieldAlert className="size-4 text-amber-600" />}
              {isConfigured ? "Configured" : "Not configured yet"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lastConn ? `Last successful EWB connection: ${new Date(lastConn).toLocaleString("en-IN")}` : "Not yet connected to NIC EWB."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Sandbox</Label>
            <Switch disabled={!canEdit} checked={sandbox} onCheckedChange={setSandbox} />
          </div>
        </div>

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
            <Label className="text-xs">EWB Portal Username</Label>
            <Input className="mt-1" value={username} onChange={(e) => setUsername(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">EWB Portal Password</Label>
            <Input
              type="password"
              className="mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!canEdit}
              placeholder={isConfigured ? "••••••••" : "EWB portal password"}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Leave blank to keep the existing password.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 pt-2 border-t">
          <div>
            <Label className="text-xs">Default Transport Mode</Label>
            <select
              className="mt-1 w-full h-9 rounded-md border bg-transparent px-2 text-sm"
              disabled={!canEdit}
              value={defaultMode}
              onChange={(e) => setDefaultMode(e.target.value as any)}
            >
              <option value="ROAD">Road</option>
              <option value="RAIL">Rail</option>
              <option value="AIR">Air</option>
              <option value="SHIP">Ship</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Default Vehicle Type</Label>
            <select
              className="mt-1 w-full h-9 rounded-md border bg-transparent px-2 text-sm"
              disabled={!canEdit}
              value={defaultVehicle}
              onChange={(e) => setDefaultVehicle(e.target.value as any)}
            >
              <option value="REGULAR">Regular</option>
              <option value="OVER_DIMENSIONAL_CARGO">Over-Dimensional Cargo (ODC)</option>
            </select>
          </div>
          <div className="flex items-center gap-2 md:pt-6">
            <Switch disabled={!canEdit} checked={autoLink} onCheckedChange={setAutoLink} />
            <Label className="text-xs">Auto-link with e-invoice</Label>
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
              testResult.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-rose-300 bg-rose-50 text-rose-900"
            }`}
          >
            {testResult.ok ? "✅ " : "❌ "}
            {testResult.message}
          </div>
        )}
      </section>

      {!canEdit && (
        <p className="text-xs text-muted-foreground">Only the CA firm owner can view or change EWB credentials.</p>
      )}
    </div>
  );
}
