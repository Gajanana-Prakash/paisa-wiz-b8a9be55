import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  getAdminReferralDashboard,
  updateAdminReferralProgram,
  adminIssueCredit,
  adminMarkFirmPaid,
} from "@/lib/referrals.functions";
import { formatInr } from "@/components/billing/utils";

export const Route = createFileRoute("/_authenticated/admin/referrals")({
  component: AdminReferralsPage,
});

function AdminReferralsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAdminReferralDashboard);
  const updateProgram = useServerFn(updateAdminReferralProgram);
  const issueCredit = useServerFn(adminIssueCredit);
  const markPaid = useServerFn(adminMarkFirmPaid);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-referrals"],
    queryFn: () => load({ data: undefined as any }),
    retry: false,
  });

  const [rewardAmount, setRewardAmount] = useState("500");
  const [programActive, setProgramActive] = useState(true);
  const [creditFirmId, setCreditFirmId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [paidFirmId, setPaidFirmId] = useState("");

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <h1 className="font-display text-xl font-semibold">Admin access required</h1>
        <p className="text-muted-foreground mt-2">
          {(error as Error).message || "You need a super_admin role to view this page."}
        </p>
      </div>
    );
  }

  const saveProgram = async () => {
    try {
      await updateProgram({
        data: {
          programActive,
          caFirmRewardAmount: Number(rewardAmount),
        },
      });
      refetch();
      toast.success("Program updated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const issue = async () => {
    try {
      await issueCredit({
        data: {
          caFirmId: creditFirmId,
          amount: Number(creditAmount),
          description: "Manual credit (admin)",
        },
      });
      refetch();
      toast.success("Credit issued");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const convert = async () => {
    try {
      await markPaid({ data: { caFirmId: paidFirmId } });
      refetch();
      toast.success("Firm marked paid — referrer rewarded if applicable");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">Referral program (admin)</h1>
        <p className="text-muted-foreground">Configure rewards and monitor conversions</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Sign-ups</p>
            <p className="text-2xl font-bold">{data?.stats.signedUp ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Converted</p>
            <p className="text-2xl font-bold">{data?.stats.converted ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Conversion rate</p>
            <p className="text-2xl font-bold">{data?.stats.conversionRate ?? 0}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Program settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="flex items-center gap-3">
            <Switch checked={programActive} onCheckedChange={setProgramActive} />
            <Label>Program active</Label>
          </div>
          <div>
            <Label>CA firm referral reward (₹)</Label>
            <Input
              type="number"
              className="mt-1"
              value={rewardAmount}
              onChange={(e) => setRewardAmount(e.target.value)}
            />
          </div>
          <Button onClick={saveProgram}>Save program</Button>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Issue manual credit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="CA firm UUID" value={creditFirmId} onChange={(e) => setCreditFirmId(e.target.value)} />
            <Input placeholder="Amount" type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
            <Button onClick={issue}>Issue credit</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mark firm as paid (trigger referral reward)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Referred firm UUID" value={paidFirmId} onChange={(e) => setPaidFirmId(e.target.value)} />
            <Button onClick={convert}>Mark converted</Button>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="font-semibold mb-3">Recent referrals</h2>
        <div className="rounded-xl border overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reward</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.referrals ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.referred_email ?? "—"}</TableCell>
                  <TableCell>{r.referral_codes?.code ?? "—"}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>{r.reward_issued ? "Yes" : "No"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-3">Recent credits</h2>
        <div className="rounded-xl border overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firm</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.credits ?? []).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>{(c as { ca_firms?: { name?: string } }).ca_firms?.name ?? c.ca_firm_id}</TableCell>
                  <TableCell>{c.description}</TableCell>
                  <TableCell>{formatInr(Number(c.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
