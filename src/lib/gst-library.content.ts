export const QUICK_SEARCH_CATEGORIES = [
  { emoji: "🍽", label: "Restaurant & Food", query: "restaurant food" },
  { emoji: "💊", label: "Medicines", query: "medicaments" },
  { emoji: "🏗", label: "Construction", query: "cement construction" },
  { emoji: "👔", label: "Textiles", query: "cotton fabric" },
  { emoji: "💻", label: "Electronics", query: "computer laptop" },
  { emoji: "🚗", label: "Vehicles", query: "motor car" },
  { emoji: "📦", label: "Packaging", query: "plastic packaging" },
  { emoji: "🏥", label: "Healthcare", query: "medical instruments" },
] as const;

export const EXAMPLE_SEARCHES = [
  "Restaurant services",
  "84713010",
  "Gold jewellery",
  "Software development",
];

export const NOTIFICATION_FILTER_LABELS: Record<string, string> = {
  ALL: "All",
  RATE_CHANGE: "Rate Changes",
  DEADLINE_EXTENSION: "Deadline Extensions",
  PROCEDURE: "Procedural",
  FORM: "Forms",
  EXEMPTION: "Exemptions",
  OTHER: "Other",
};

export const IMPACT_STYLES: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300",
  MEDIUM: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  LOW: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
};
