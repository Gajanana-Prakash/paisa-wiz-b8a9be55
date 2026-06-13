import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getReferralSettings, updateReferralPreferences } from "@/lib/referrals.functions";

export const Route = createFileRoute("/_authenticated/ca/settings/referral")({
  component: ReferralSettingsPage,
});

function ReferralSettingsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getReferralSettings);
  const save = useServerFn(updateReferralPreferences);

  const { data, isLoading } = useQuery({
    queryKey: ["referral-settings"],
    queryFn: () => load({ data: undefined as any }),
  });

  const [code, setCode] = useState("");
  const [leaderboard, setLeaderboard] = useState(false);
  const [notify, setNotify] = useState(true);
  const [poweredBy, setPoweredBy] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setCode(data.code?.code ?? "");
    setLeaderboard(data.firm?.leaderboard_opt_in ?? false);
    setNotify(data.firm?.referral_notify_on_signup ?? true);
    setPoweredBy(data.firm?.show_powered_by_gstify ?? true);
  }, [data]);

  const submit = async () => {
    setBusy(true);
    try {
      await save({
        data: {
          referralCode: data?.code?.code_customized ? undefined : code || undefined,
          leaderboardOptIn: leaderboard,
          referralNotifyOnSignup: notify,
          showPoweredByGstify: poweredBy,
        },
      });
      qc.invalidateQueries({ queryKey: ["referral-settings"] });
      toast.success("Settings saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const codeLocked = data?.code?.code_customized;

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Referral settings</h1>
        <p className="text-muted-foreground mt-1">Customize your growth program preferences</p>
      </div>

      <section className="rounded-2xl border bg-card p-6 space-y-4">
        <div>
          <Label>Your referral code</Label>
          <Input
            className="mt-1 font-mono uppercase h-11"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
            disabled={codeLocked}
            maxLength={24}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {codeLocked ? "Code was customized and cannot be changed again." : "You can customize your code once."}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Leaderboard visibility</Label>
            <p className="text-xs text-muted-foreground">Show your firm on the public leaderboard</p>
          </div>
          <Switch checked={leaderboard} onCheckedChange={setLeaderboard} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Signup notifications</Label>
            <p className="text-xs text-muted-foreground">Notify when someone signs up with your link</p>
          </div>
          <Switch checked={notify} onCheckedChange={setNotify} />
        </div>

        <div className="flex items-center justify-between gap-4 border-t pt-4">
          <div>
            <Label>Powered by PracticeDesk badge</Label>
            <p className="text-xs text-muted-foreground">Show in your client portal footer</p>
          </div>
          <Switch checked={poweredBy} onCheckedChange={setPoweredBy} />
        </div>

        <Button onClick={submit} disabled={busy} className="w-full h-11">
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Save settings"}
        </Button>
      </section>

      <p className="text-center text-sm">
        <Link to="/ca/grow" className="text-primary hover:underline">
          ← Back to Growth center
        </Link>
      </p>
    </div>
  );
}
