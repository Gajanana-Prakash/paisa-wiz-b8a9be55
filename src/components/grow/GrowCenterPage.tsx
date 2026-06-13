import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Copy, Mail, MessageCircle, Download, Loader2, Gift, Users, Trophy,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { getGrowthCenter, updateReferralPreferences } from "@/lib/referrals.functions";
import { formatInr } from "@/components/billing/utils";

function whatsappShare(url: string, reward: number) {
  const text = `Hey! I've been using PracticeDesk for managing my clients' GST and compliance — it's fantastic. Use my link to get 1 month free: ${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

function emailShare(url: string) {
  const subject = "Try PracticeDesk for your CA practice";
  const body = `I've been using PracticeDesk to manage client GST and compliance. Sign up with my link for a free trial:\n\n${url}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function GrowCenterPage() {
  const qc = useQueryClient();
  const load = useServerFn(getGrowthCenter);
  const savePrefs = useServerFn(updateReferralPreferences);
  const [copied, setCopied] = useState(false);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["growth-center"],
    queryFn: () => load({ data: undefined as any }),
  });

  const reward = data?.rewardAmount ?? 500;
  const joinUrl = data?.joinUrl ?? "";

  const copyLink = async () => {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleLeaderboard = async (v: boolean) => {
    setLeaderboardOptIn(v);
    try {
      await savePrefs({ data: { leaderboardOptIn: v } });
      refetch();
      toast.success(v ? "You're on the leaderboard" : "Leaderboard hidden");
    } catch (e: unknown) {
      setLeaderboardOptIn(!v);
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const qrUrl = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`
    : "";

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-medium">
          <Gift className="size-4" /> Growth
        </div>
        <h1 className="font-display text-3xl font-semibold mt-1">Grow with PracticeDesk</h1>
        <p className="text-muted-foreground mt-1">Refer firms, onboard clients, earn rewards</p>
      </div>

      <Tabs defaultValue="ca" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 h-12">
          <TabsTrigger value="ca" className="text-sm md:text-base">Refer CA firms</TabsTrigger>
          <TabsTrigger value="clients" className="text-sm md:text-base">Refer clients</TabsTrigger>
          <TabsTrigger value="rewards" className="text-sm md:text-base">My rewards</TabsTrigger>
        </TabsList>

        <TabsContent value="ca" className="space-y-8">
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-amber-500/10">
            <CardHeader>
              <CardTitle className="text-2xl font-display">
                Earn {formatInr(reward)} credit for every CA firm you refer
              </CardTitle>
              <p className="text-muted-foreground text-base">
                Share your unique link. When they subscribe, you both benefit.
              </p>
            </CardHeader>
          </Card>

          <section className="space-y-3">
            <Label className="text-base">Your referral link</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input readOnly value={joinUrl} className="h-12 text-base font-mono" />
              <Button size="lg" className="h-12 shrink-0 gap-2" onClick={copyLink}>
                <Copy className="size-5" />
                {copied ? "Copied!" : "Copy link"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                className="gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white h-11"
                onClick={() => whatsappShare(joinUrl, reward)}
              >
                <MessageCircle className="size-5" />
                Share on WhatsApp
              </Button>
              <Button size="lg" variant="outline" className="gap-2 h-11" onClick={() => emailShare(joinUrl)}>
                <Mail className="size-5" />
                Send via email
              </Button>
            </div>
          </section>

          {qrUrl && (
            <Card>
              <CardContent className="pt-6 flex flex-col items-center gap-4">
                <img src={qrUrl} alt="Referral QR code" width={220} height={220} className="rounded-xl border" />
                <Button variant="outline" className="gap-2" asChild>
                  <a href={qrUrl} download="gstify-referral-qr.png" target="_blank" rel="noreferrer">
                    <Download className="size-4" />
                    Download QR
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { step: "1", title: "Share your link", desc: "They sign up for a free trial" },
              { step: "2", title: "They subscribe", desc: "They pick a paid plan" },
              { step: "3", title: "You earn", desc: `${formatInr(reward)} credit on your account` },
            ].map((s) => (
              <Card key={s.step}>
                <CardContent className="pt-6">
                  <div className="size-10 rounded-full bg-primary text-primary-foreground font-bold grid place-items-center mb-3">
                    {s.step}
                  </div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <section>
            <h2 className="font-semibold text-lg mb-3">Referral tracking</h2>
            <div className="rounded-xl border overflow-x-auto bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referred to</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reward</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.referrals ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No referrals yet — share your link to get started.
                      </TableCell>
                    </TableRow>
                  )}
                  {(data?.referrals ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>{new Date(r.date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>{r.rewardIssued ? `✅ ${r.reward}` : "Pending"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="clients" className="space-y-8">
          <Card className="bg-muted/30">
            <CardContent className="pt-6 space-y-2 text-base">
              <p>Clients who upload their first document within 48 hours stay 3× longer.</p>
              <p className="text-muted-foreground">
                Pro tip: Send the WhatsApp invite immediately after the client agrees to work with you.
              </p>
              <p className="font-medium text-primary">
                Firms with 100% client onboarding earn a Champion badge.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" />
                Client adoption score
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-lg">
                Your adoption rate: <strong>{data?.adoption.pct ?? 0}%</strong>{" "}
                ({data?.adoption.active} of {data?.adoption.total} clients are active)
              </p>
              <Progress value={data?.adoption.pct ?? 0} className="h-3" />
              {(data?.inactiveClients?.length ?? 0) > 0 && (
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground mb-2">
                    Invite the remaining {data?.inactiveClients.length} clients
                  </p>
                  <ul className="space-y-2">
                    {data?.inactiveClients.slice(0, 7).map((c) => (
                      <li key={c.id} className="flex justify-between items-center rounded-lg border px-3 py-2">
                        <span>{c.name}</span>
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/ca/clients">Invite</Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <section>
            <h2 className="font-semibold text-lg mb-3">Client invitations sent</h2>
            <div className="rounded-xl border overflow-x-auto bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Documents</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.clientInvites ?? []).map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.clientName}</TableCell>
                      <TableCell>{new Date(inv.invitedAt).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell>{inv.status}</TableCell>
                      <TableCell>{inv.docsUploaded}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="rewards" className="space-y-8">
          <Card className="border-2 border-amber-400/50 bg-gradient-to-r from-amber-50 to-primary/5">
            <CardContent className="pt-8 pb-8 text-center">
              <p className="text-sm uppercase tracking-widest text-muted-foreground">Your PracticeDesk credit balance</p>
              <p className="text-4xl md:text-5xl font-display font-bold text-primary mt-2">
                {formatInr(data?.creditBalance ?? 0)}
              </p>
              <p className="text-muted-foreground mt-2">Applied automatically to your next PracticeDesk subscription invoice</p>
            </CardContent>
          </Card>

          <section>
            <h2 className="font-semibold text-lg mb-3">Credits history</h2>
            <div className="rounded-xl border overflow-x-auto bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.credits ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No credits yet — refer a CA firm to earn {formatInr(reward)}.
                      </TableCell>
                    </TableRow>
                  )}
                  {(data?.credits ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{new Date(c.date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell>{c.type}</TableCell>
                      <TableCell>{c.description}</TableCell>
                      <TableCell className="text-emerald-700 font-medium">+{formatInr(c.amount)}</TableCell>
                      <TableCell>{c.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Trophy className="size-5 text-amber-500" />
              Badges
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(data?.badges ?? []).map((b) => (
                <Card
                  key={b.type}
                  className={b.earned ? "border-amber-400/60 bg-gradient-to-br from-amber-50/80 to-card" : "opacity-60 grayscale"}
                  title={b.howTo}
                >
                  <CardContent className="pt-6">
                    <span className="text-3xl">{b.emoji}</span>
                    <p className="font-semibold mt-2">{b.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{b.earned ? b.howTo : `How to earn: ${b.howTo}`}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Leaderboard</CardTitle>
              <p className="text-sm text-muted-foreground">Opt in to appear and see top firms</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={data?.leaderboardOptIn ?? leaderboardOptIn}
                  onCheckedChange={toggleLeaderboard}
                />
                <Label>Show my firm on the public leaderboard</Label>
              </div>
              {data?.leaderboardOptIn && (data.leaderboard?.length ?? 0) > 0 && (
                <ol className="space-y-2">
                  {data.leaderboard.map((row, i) => (
                    <li key={i} className="flex justify-between rounded-lg border px-4 py-2 text-sm">
                      <span>
                        #{i + 1} {row.firmName}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {row.referrals} refs · {row.clients} clients · {row.filings} filings
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-center text-sm text-muted-foreground">
        <Link to="/ca/settings/referral" className="text-primary hover:underline">
          Referral settings
        </Link>
      </p>
    </div>
  );
}
