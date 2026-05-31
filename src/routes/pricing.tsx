import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Check,
  CreditCard,
  FileText,
  MapPin,
  Shield,
  Sparkles,
} from "lucide-react";
import {
  PLAN_CATALOG,
  PER_CLIENT_CROSSOVER,
  formatInr,
  perClientMonthlyTotal,
  perClientAnnualTotal,
  recommendPlan,
} from "@/lib/subscriptions.plans";
export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Pricing — GSTify" },
      {
        name: "description",
        content: "Simple pricing that grows with your CA practice. Start free. Pay only for active clients.",
      },
    ],
  }),
});

type PlanKey = keyof typeof PLAN_CATALOG;

const PLAN_KEYS: PlanKey[] = ["FREE", "PER_CLIENT", "STARTER", "GROWTH", "PROFESSIONAL"];

function PricingNav() {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-9 rounded-lg bg-[var(--gradient-gold)] grid place-items-center text-primary font-bold">G</div>
          <span className="font-display text-lg font-semibold">GSTify</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link to="/signup/ca">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function TrustFooter() {
  return (
    <section className="border-t border-border bg-muted/20 py-16">
      <div className="mx-auto max-w-4xl px-6 text-center space-y-8">
        <div className="grid sm:grid-cols-3 gap-6 text-sm">
          <div className="flex flex-col items-center gap-2">
            <FileText className="size-5 text-primary" />
            <p className="font-medium">GST invoice provided</p>
            <p className="text-muted-foreground text-xs">For all subscriptions — for your own books</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <MapPin className="size-5 text-primary" />
            <p className="font-medium">Data stored in India</p>
            <p className="text-muted-foreground text-xs">Mumbai servers</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Shield className="size-5 text-primary" />
            <p className="font-medium">Cancel anytime</p>
            <p className="text-muted-foreground text-xs">No lock-in contracts</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 flex-wrap">
          <CreditCard className="size-4" /> We accept UPI, Net Banking, Credit/Debit Card
        </p>
        <div className="flex items-center justify-center gap-4 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          <span>Visa</span>
          <span>Mastercard</span>
          <span>RuPay</span>
          <span className="text-primary">UPI</span>
        </div>
      </div>
    </section>
  );
}

function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [calcClients, setCalcClients] = useState(25);
  const [perClientSlider, setPerClientSlider] = useState(18);

  const rec = useMemo(() => recommendPlan(calcClients), [calcClients]);

  return (
    <div className="min-h-screen bg-background">
      <PricingNav />

      <div className="mx-auto max-w-7xl px-6 py-16 md:py-24">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted/40 text-xs font-medium tracking-wide uppercase text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> Indian CA pricing
          </div>
          <h1 className="mt-5 font-display text-4xl md:text-5xl font-semibold">
            Simple pricing that grows with your practice
          </h1>
          <p className="mt-4 text-muted-foreground text-lg">
            Start free. Pay only for what you use. No hidden fees.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2">
            <span className={!annual ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>Monthly</span>
            <Switch checked={annual} onCheckedChange={setAnnual} aria-label="Toggle annual billing" />
            <span className={annual ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>
              Annual{" "}
              <Badge className="ml-1 bg-emerald-600 hover:bg-emerald-600 text-white border-0">Save 2 months</Badge>
            </span>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5">
          {PLAN_KEYS.map((key) => (
            <PlanCard
              key={key}
              planKey={key}
              annual={annual}
              perClientCount={perClientSlider}
              onPerClientCount={setPerClientSlider}
            />
          ))}
        </div>

        <CostCalculator
          clients={calcClients}
          onClients={setCalcClients}
          annual={annual}
          recommendation={rec.message}
          rows={[
            {
              plan: "Per Client (₹99)",
              monthly: rec.perClientMonthly,
              annual: rec.perClientAnnual,
              best: rec.best === "PER_CLIENT",
            },
            {
              plan: "Growth (₹2,999)",
              monthly: rec.growthMonthly,
              annual: rec.growthAnnual,
              best: rec.best === "GROWTH",
            },
            {
              plan: "Professional",
              monthly: rec.professionalMonthly,
              annual: PLAN_CATALOG.PROFESSIONAL.annual,
              best: rec.best === "PROFESSIONAL",
            },
          ]}
          crossover={PER_CLIENT_CROSSOVER}
        />

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Active client = document uploaded or task activity in the last 30 days. Prices in INR; GST extra as applicable.
        </p>
      </div>

      <TrustFooter />
    </div>
  );
}

function PlanCard({
  planKey,
  annual,
  perClientCount,
  onPerClientCount,
}: {
  planKey: PlanKey;
  annual: boolean;
  perClientCount: number;
  onPerClientCount: (n: number) => void;
}) {
  const p = PLAN_CATALOG[planKey];
  const isGrowth = planKey === "GROWTH";
  const isPerClient = planKey === "PER_CLIENT";
  const isFree = planKey === "FREE";
  const isPro = planKey === "PROFESSIONAL";
  const badge = "badge" in p ? (p as { badge?: string }).badge : undefined;

  let priceMain = "";
  let priceSub = "";
  let saveBadge: string | null = null;

  if (isFree) {
    priceMain = "₹0 forever";
    priceSub = p.tagline;
  } else if (isPerClient) {
    const monthly = perClientMonthlyTotal(perClientCount);
    const annualTotal = perClientAnnualTotal(perClientCount);
    priceMain = annual
      ? `₹990 / client / year`
      : `₹99 / client / month`;
    priceSub = annual
      ? `You have ${perClientCount} clients? Pay ${formatInr(annualTotal)}/year`
      : `You have ${perClientCount} clients? Pay ${formatInr(monthly)}/month`;
    if (annual) saveBadge = "Save ₹198 per client / year";
  } else if (isPro) {
    const row = p as typeof PLAN_CATALOG.PROFESSIONAL;
    priceMain = annual ? `${formatInr(row.annual)} / year` : `${formatInr(row.monthly)} / month`;
    priceSub = annual ? `Save ${formatInr(row.annualSave)}` : "Unlimited clients";
    if (annual) saveBadge = `Save ${formatInr(row.annualSave)}`;
  } else {
    const row = p as typeof PLAN_CATALOG.STARTER;
    priceMain = annual ? `${formatInr(row.annual)} / year` : `${formatInr(row.monthly)} / month`;
    const clients =
      planKey === "STARTER" ? "15 clients included" : planKey === "GROWTH" ? "60 clients included" : "";
    priceSub = clients;
    if (annual && "annualSave" in row) saveBadge = `Save ${formatInr(row.annualSave)}`;
  }

  const ctaTo = isFree ? "/signup/ca" : isPro ? "mailto:sales@gstify.in" : "/signup/ca";
  const ctaLabel = "cta" in p ? p.cta : "Start";

  return (
    <div
      className={
        "relative rounded-3xl border p-6 flex flex-col " +
        (isGrowth ? "border-primary bg-card shadow-lg shadow-primary/10 xl:scale-[1.02]" : "border-border bg-card")
      }
    >
      {badge && (
        <div
          className={
            "absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider whitespace-nowrap " +
            (isGrowth ? "bg-gold text-gold-foreground" : "bg-primary text-primary-foreground")
          }
        >
          {badge}
        </div>
      )}
      <div className="font-display text-lg font-semibold">{p.label}</div>
      <p className="text-xs text-muted-foreground mt-1 min-h-[2.5rem]">{p.tagline}</p>

      <div className="mt-4">
        <div className="font-display text-2xl md:text-3xl font-semibold tracking-tight leading-tight">{priceMain}</div>
        {saveBadge && (
          <Badge className="mt-2 bg-emerald-600 hover:bg-emerald-600 text-white border-0">{saveBadge}</Badge>
        )}
        <p className="mt-2 text-sm text-primary font-medium">{priceSub}</p>
      </div>

      {isPerClient && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">Try your client count</p>
          <Slider
            value={[perClientCount]}
            onValueChange={(v) => onPerClientCount(v[0] ?? 1)}
            min={1}
            max={60}
            step={1}
          />
        </div>
      )}

      <ul className="mt-5 space-y-2 text-sm flex-1">
        {p.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="size-4 mt-0.5 text-primary shrink-0" />
            <span className="text-foreground/90">{f}</span>
          </li>
        ))}
      </ul>

      {isPro ? (
        <a href={ctaTo} className="mt-6 block">
          <Button variant="outline" className="w-full" size="lg">
            {ctaLabel}
          </Button>
        </a>
      ) : (
        <Link to={ctaTo as "/signup/ca"} className="mt-6 block">
          <Button
            className={
              "w-full " +
              (isFree || isGrowth
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "")
            }
            variant={isFree || isGrowth ? "default" : "outline"}
            size="lg"
          >
            {ctaLabel} <ArrowRight className="ml-2 size-4" />
          </Button>
        </Link>
      )}
    </div>
  );
}

function CostCalculator({
  clients,
  onClients,
  annual,
  recommendation,
  rows,
  crossover,
}: {
  clients: number;
  onClients: (n: number) => void;
  annual: boolean;
  recommendation: string;
  rows: { plan: string; monthly: number; annual: number; best: boolean }[];
  crossover: number;
}) {
  const ticks = [10, 25, 50, 100, 150, 200];

  return (
    <section className="mt-20 rounded-3xl border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-background p-8 md:p-12">
      <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
        How many clients do you manage?
      </h2>
      <p className="text-center text-muted-foreground mt-2">
        Compare Per Client vs flat plans — crossover at ~{crossover} active clients
      </p>

      <div className="mt-10 max-w-2xl mx-auto">
        <div className="flex justify-between text-sm font-medium mb-2">
          <span>{clients} clients</span>
          <span className="text-muted-foreground">{annual ? "Annual view" : "Monthly view"}</span>
        </div>
        <Slider value={[clients]} onValueChange={(v) => onClients(v[0] ?? 1)} min={1} max={200} step={1} />
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-3 pr-4 font-medium">Plan</th>
              <th className="py-3 pr-4 font-medium">Monthly cost</th>
              <th className="py-3 pr-4 font-medium">Annual cost</th>
              <th className="py-3 font-medium">Best for you</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.plan} className="border-b border-border/60">
                <td className="py-4 pr-4 font-medium">{r.plan}</td>
                <td className="py-4 pr-4">{formatInr(r.monthly)}</td>
                <td className="py-4 pr-4">{formatInr(r.annual)}</td>
                <td className="py-4">{r.best ? "✅ Best value" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-center text-base font-medium text-primary max-w-xl mx-auto">{recommendation}</p>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        Showing {annual ? "annual" : "monthly"} totals. Per Client bills on active clients at month end.
      </p>
    </section>
  );
}
