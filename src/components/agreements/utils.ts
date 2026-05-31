export type AgreementStatus =
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "SIGNED"
  | "EXPIRED"
  | "CANCELLED";

export const AGREEMENT_STATUS_META: Record<
  AgreementStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  SENT: { label: "Sent", className: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  VIEWED: { label: "Viewed", className: "bg-purple-500/15 text-purple-700 border-purple-500/30" },
  SIGNED: { label: "Signed", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  EXPIRED: { label: "Expired", className: "bg-muted text-muted-foreground border-border" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground line-through border-border" },
};

export const AGREEMENT_TYPE_LABELS: Record<string, string> = {
  ENGAGEMENT_LETTER: "Engagement Letter",
  SERVICE_AGREEMENT: "Service Agreement",
  NDA: "NDA",
  AUTHORIZATION_LETTER: "Authorization Letter",
  CUSTOM: "Custom",
};

export const FEE_FREQUENCY_LABELS: Record<string, string> = {
  ONE_TIME: "One-time",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Annual",
};

export const TEMPLATE_CARDS = [
  {
    type: "ENGAGEMENT_LETTER" as const,
    name: "Engagement Letter",
    description: "Formal letter confirming CA engagement scope and fees.",
    useCase: "New client onboarding",
    readMins: 3,
  },
  {
    type: "SERVICE_AGREEMENT" as const,
    name: "GST Service Agreement",
    description: "Covers GST filing, returns, and compliance obligations.",
    useCase: "GST-only clients",
    readMins: 5,
  },
  {
    type: "SERVICE_AGREEMENT" as const,
    name: "Full CA Services Agreement",
    description: "Comprehensive agreement for multi-service engagements.",
    useCase: "Retainer / full-service clients",
    readMins: 8,
  },
  {
    type: "NDA" as const,
    name: "NDA",
    description: "Mutual confidentiality for sensitive business information.",
    useCase: "Before sharing financial data",
    readMins: 4,
  },
  {
    type: "AUTHORIZATION_LETTER" as const,
    name: "Authorization Letter",
    description: "Authorizes CA to act on client's behalf with authorities.",
    useCase: "GST portal / tax representation",
    readMins: 2,
  },
  {
    type: "CUSTOM" as const,
    name: "Custom",
    description: "Start from a blank template you define.",
    useCase: "Special arrangements",
    readMins: 0,
  },
];
