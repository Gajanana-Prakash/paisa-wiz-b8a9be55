export type PlanType = "FREE" | "PER_CLIENT" | "STARTER" | "GROWTH" | "PROFESSIONAL";
export type BillingCycle = "MONTHLY" | "ANNUAL";

export const GSTIFY_GSTIN = "27AAAAA0000A1Z5"; // placeholder — update with real GSTIN
export const PER_CLIENT_CROSSOVER = 30;

export const PLAN_CATALOG = {
  FREE: {
    label: "Free Forever",
    tagline: "For individual CA / tax consultant",
    monthly: 0,
    annual: 0,
    clientsIncluded: 3,
    features: [
      "Up to 3 clients",
      "Import your existing client list in minutes",
      "Client document collaboration portal (WhatsApp-friendly)",
      "Compliance deadline calendar for your whole firm",
      "Email support",
    ],
    cta: "Start Free — No card needed",
    ctaVariant: "primary" as const,
  },
  PER_CLIENT: {
    label: "Per Client",
    tagline: "Pay only for active clients",
    perClientMonthly: 99,
    perClientAnnual: 990,
    minMonthly: 99,
    badge: "Most Flexible",
    features: [
      "₹99 per active client / month",
      "Import your existing client list in minutes",
      "Staff task boards & time tracking",
      "Bill your clients professionally with UPI payment links",
      "Export data ready for CompuTax, Spectrum, or Tally",
    ],
    cta: "Start Free Trial",
    ctaVariant: "outline" as const,
  },
  STARTER: {
    label: "Starter",
    tagline: "Small practice, predictable fee",
    monthly: 999,
    annual: 9990,
    annualSave: 1998,
    clientsIncluded: 15,
    features: [
      "Up to 15 clients",
      "Import your existing client list in minutes",
      "Client document collaboration portal (WhatsApp-friendly)",
      "Compliance deadline calendar for your whole firm",
      "Email support",
    ],
    cta: "Start Free Trial",
    ctaVariant: "outline" as const,
  },
  GROWTH: {
    label: "Growth",
    tagline: "For growing CA practices",
    monthly: 2999,
    annual: 29990,
    annualSave: 5998,
    clientsIncluded: 60,
    badge: "Most Popular",
    features: [
      "Up to 60 clients",
      "Staff task boards & time tracking",
      "Bill your clients professionally with UPI payment links",
      "Export data ready for CompuTax, Spectrum, or Tally",
      "Priority support",
    ],
    cta: "Start Free Trial",
    ctaVariant: "primary" as const,
  },
  PROFESSIONAL: {
    label: "Professional",
    tagline: "Established firms at scale",
    monthly: 6999,
    annual: 69990,
    annualSave: 13998,
    clientsIncluded: null as number | null,
    features: [
      "Unlimited clients",
      "Custom domain",
      "Priority WhatsApp support",
      "Dedicated account manager",
      "All Growth features",
    ],
    cta: "Contact Sales",
    ctaVariant: "outline" as const,
  },
} as const;

export function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export function perClientMonthlyTotal(clients: number) {
  const c = Math.max(1, clients);
  return c * PLAN_CATALOG.PER_CLIENT.perClientMonthly;
}

export function perClientAnnualTotal(clients: number) {
  const c = Math.max(1, clients);
  return c * PLAN_CATALOG.PER_CLIENT.perClientAnnual;
}

export function recommendPlan(clientCount: number): {
  perClientMonthly: number;
  perClientAnnual: number;
  growthMonthly: number;
  growthAnnual: number;
  professionalMonthly: number;
  message: string;
  best: PlanType;
} {
  const pcm = perClientMonthlyTotal(clientCount);
  const pca = perClientAnnualTotal(clientCount);
  const gm = PLAN_CATALOG.GROWTH.monthly;
  const ga = PLAN_CATALOG.GROWTH.annual;
  const pm = PLAN_CATALOG.PROFESSIONAL.monthly;

  let message: string;
  let best: PlanType = "PER_CLIENT";

  if (clientCount <= 3) {
    message = "For up to 3 clients, the Free Forever plan covers you at ₹0.";
    best = "FREE";
  } else if (clientCount < PER_CLIENT_CROSSOVER) {
    const save = gm - pcm;
    message = `For ${clientCount} clients: Per Client saves you ${formatInr(save)}/month vs Growth plan.`;
    best = "PER_CLIENT";
  } else if (clientCount === PER_CLIENT_CROSSOVER) {
    message = `At ${PER_CLIENT_CROSSOVER} clients, Per Client and Growth are nearly the same — Growth adds WhatsApp & branding.`;
    best = "GROWTH";
  } else if (clientCount <= 60) {
    const save = pcm - gm;
    message = `For ${clientCount} clients: Growth saves you ${formatInr(save)}/month vs Per Client plan.`;
    best = "GROWTH";
  } else {
    message = `For ${clientCount} clients: compare Growth (${formatInr(gm)}/mo) vs Professional (${formatInr(pm)}/mo) for unlimited clients.`;
    best = clientCount > 100 ? "PROFESSIONAL" : "GROWTH";
  }

  return {
    perClientMonthly: pcm,
    perClientAnnual: pca,
    growthMonthly: gm,
    growthAnnual: ga,
    professionalMonthly: pm,
    message,
    best,
  };
}

export function calculateSubscriptionAmount(
  plan: PlanType,
  cycle: BillingCycle,
  activeClients: number,
) {
  if (plan === "FREE") return 0;
  if (plan === "PER_CLIENT") {
    const count = Math.max(1, activeClients);
    const monthly = count * PLAN_CATALOG.PER_CLIENT.perClientMonthly;
    return cycle === "ANNUAL"
      ? count * PLAN_CATALOG.PER_CLIENT.perClientAnnual
      : monthly;
  }
  const p = PLAN_CATALOG[plan as keyof typeof PLAN_CATALOG] as {
    monthly: number;
    annual: number;
  };
  if (cycle === "ANNUAL") return p.annual;
  return p.monthly;
}
