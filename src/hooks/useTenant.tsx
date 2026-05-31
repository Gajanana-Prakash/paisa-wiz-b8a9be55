import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loadTenantContext } from "@/lib/tenant.functions";

export type TenantRole = "ca_owner" | "ca_staff" | "client_owner" | "client_employee" | null;
export type TenantClient = { id: string; business_name: string; gstin: string | null; status: string };

type TenantState = {
  loading: boolean;
  role: TenantRole;
  userId: string | null;
  firm: {
    id: string;
    name: string;
    logo_url: string | null;
    primary_color: string | null;
    subdomain_slug: string | null;
    show_powered_by_gstify?: boolean | null;
  } | null;
  availableClients: TenantClient[];
  activeClientId: string | null;
  activeClient: TenantClient | null;
  setActiveClientId: (id: string | null) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<TenantState | null>(null);
const LS_KEY = "gstify_active_client_id";

export function TenantProvider({ children }: { children: ReactNode }) {
  const load = useServerFn(loadTenantContext);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TenantRole>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [firm, setFirm] = useState<TenantState["firm"]>(null);
  const [clients, setClients] = useState<TenantClient[]>([]);
  const [activeClientId, setActiveClientIdState] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null,
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await load({ data: undefined as any });
      setRole(r.role);
      setUserId(r.userId ?? null);
      setFirm(r.firm);
      setClients(r.availableClients);
      setActiveClientIdState((prev) => {
        if (prev && r.availableClients.some((c) => c.id === prev)) return prev;
        const fallback = r.availableClients[0]?.id ?? null;
        if (typeof window !== "undefined") {
          if (fallback) localStorage.setItem(LS_KEY, fallback);
          else localStorage.removeItem(LS_KEY);
        }
        return fallback;
      });
    } catch (e) {
      console.error("loadTenantContext failed", e);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  // Apply CA firm primary color as a CSS override so client-facing UI uses firm branding.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const color = firm?.primary_color;
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
      root.style.setProperty("--primary", color);
      root.style.setProperty("--ring", color);
      root.style.setProperty("--sidebar-primary", color);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--sidebar-primary");
    }
  }, [firm?.primary_color]);

  const setActiveClientId = useCallback((id: string | null) => {
    setActiveClientIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(LS_KEY, id);
      else localStorage.removeItem(LS_KEY);
    }
  }, []);

  const value = useMemo<TenantState>(() => ({
    loading, role, userId, firm, availableClients: clients, activeClientId,
    activeClient: clients.find((c) => c.id === activeClientId) ?? null,
    setActiveClientId, refresh,
  }), [loading, role, userId, firm, clients, activeClientId, setActiveClientId, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTenant must be used inside TenantProvider");
  return v;
}