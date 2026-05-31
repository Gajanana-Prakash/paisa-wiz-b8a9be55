import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import en from "@/locales/en.json";
import hi from "@/locales/hi.json";
import { getClientLanguagePreference, saveClientLanguagePreference } from "@/lib/client-language.functions";

export type ClientLanguage = "EN" | "HI";

type Dict = Record<string, string>;

const DICTS: Record<ClientLanguage, Dict> = { EN: en as Dict, HI: hi as Dict };
const LS_KEY = "gstify_client_language";

type LanguageContextValue = {
  language: ClientLanguage;
  setLanguage: (lang: ClientLanguage) => void;
  t: (key: keyof typeof en | string) => string;
  formatDate: (date: string | Date) => string;
  isHindi: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const loadPref = useServerFn(getClientLanguagePreference);
  const savePref = useServerFn(saveClientLanguagePreference);

  const [language, setLanguageState] = useState<ClientLanguage>(() => {
    if (typeof window === "undefined") return "EN";
    const stored = localStorage.getItem(LS_KEY);
    return stored === "HI" ? "HI" : "EN";
  });

  useEffect(() => {
    loadPref({ data: undefined as any })
      .then((r) => {
        if (r?.language === "HI" || r?.language === "EN") {
          setLanguageState(r.language);
          localStorage.setItem(LS_KEY, r.language);
        }
      })
      .catch(() => {});
  }, [loadPref]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (language === "HI") {
      root.classList.add("client-portal-hi");
    } else {
      root.classList.remove("client-portal-hi");
    }
  }, [language]);

  const setLanguage = useCallback(
    (lang: ClientLanguage) => {
      setLanguageState(lang);
      if (typeof window !== "undefined") localStorage.setItem(LS_KEY, lang);
      savePref({ data: { language: lang } }).catch(() => {});
    },
    [savePref],
  );

  const t = useCallback(
    (key: string) => DICTS[language][key] ?? DICTS.EN[key] ?? key,
    [language],
  );

  const formatDate = useCallback(
    (date: string | Date) =>
      new Date(date).toLocaleDateString(language === "HI" ? "hi-IN" : "en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      formatDate,
      isHindi: language === "HI",
    }),
    [language, setLanguage, t, formatDate],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

/** Safe hook for shared components that may render outside client layout. */
export function useLanguageOptional() {
  return useContext(LanguageContext);
}
