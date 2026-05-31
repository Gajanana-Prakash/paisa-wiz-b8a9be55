import { useLanguage } from "@/hooks/useLanguage";
import type { ClientLanguage } from "@/hooks/useLanguage";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();

  const pill = (lang: ClientLanguage, label: string) => {
    const active = language === lang;
    return (
      <button
        type="button"
        onClick={() => setLanguage(lang)}
        className={`min-w-[44px] min-h-[40px] px-3 rounded-full text-sm font-semibold transition-colors ${
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "border border-border bg-background text-foreground hover:bg-muted"
        }`}
        aria-pressed={active}
        aria-label={lang === "EN" ? "English" : "Hindi"}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className={`inline-flex items-center gap-1 p-1 rounded-full bg-muted/50 border border-border/60 ${className}`}
      role="group"
      aria-label="Language"
    >
      {pill("EN", t("language_en"))}
      {pill("HI", t("language_hi"))}
    </div>
  );
}
