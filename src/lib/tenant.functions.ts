import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureDefaultComplianceProfile, regenerateDeadlines } from "@/lib/compliance.server";


// ---------- CA OWNER ONBOARDING ----------

export const finalizeCAOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      firmName: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Idempotent: if user already has any role, return what they have.
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id, role, ca_firm_id, client_id")
      .eq("user_id", userId)
      .limit(1);
    if (existing && existing.length > 0) {
      return { ok: true, alreadyOnboarded: true, role: existing[0].role };
    }

    const { data: firm, error: fErr } = await supabaseAdmin
      .from("ca_firms")
      .insert({ name: data.firmName, owner_user_id: userId, phone: data.phone || null })
      .select("id")
      .single();
    if (fErr || !firm) throw new Error(fErr?.message || "Could not create firm");

    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "ca_owner", ca_firm_id: firm.id });
    if (rErr) throw new Error(rErr.message);

    return { ok: true, caFirmId: firm.id, role: "ca_owner" as const };
  });

// ---------- INVITE CLIENT ----------

function genToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const inviteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      businessName: z.string().trim().min(2).max(200),
      gstin: z.string().trim().max(20).optional(),
      contactName: z.string().trim().max(120).optional(),
      contactEmail: z.string().trim().email().max(255).optional().or(z.literal("")),
      contactPhone: z.string().trim().max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: firm } = await supabaseAdmin
      .from("user_roles")
      .select("ca_firm_id")
      .eq("user_id", userId)
      .eq("role", "ca_owner")
      .limit(1)
      .maybeSingle();
    if (!firm?.ca_firm_id) throw new Error("Only CA owners can invite clients");

    const { data: client, error: cErr } = await supabaseAdmin
      .from("clients")
      .insert({
        ca_firm_id: firm.ca_firm_id,
        business_name: data.businessName,
        gstin: data.gstin || null,
        contact_name: data.contactName || null,
        contact_email: data.contactEmail || null,
        contact_phone: data.contactPhone || null,
        status: "pending_invite",
      })
      .select("id")
      .single();
    if (cErr || !client) throw new Error(cErr?.message || "Failed to create client");

    const token = genToken();
    const { error: iErr } = await supabaseAdmin
      .from("client_invites")
      .insert({
        ca_firm_id: firm.ca_firm_id,
        client_id: client.id,
        token,
        email: data.contactEmail || null,
        created_by: userId,
      });
    if (iErr) throw new Error(iErr.message);

    return { ok: true, clientId: client.id, token };
  });

// ---------- PUBLIC INVITE LOOKUP ----------

export const getInvitePublic = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(10).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { data: inv } = await supabaseAdmin
      .from("client_invites")
      .select("id, ca_firm_id, client_id, email, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { ok: false as const, reason: "not_found" as const };
    if (inv.accepted_at) return { ok: false as const, reason: "accepted" as const };
    if (new Date(inv.expires_at).getTime() < Date.now())
      return { ok: false as const, reason: "expired" as const };

    const [{ data: client }, { data: firm }] = await Promise.all([
      supabaseAdmin.from("clients").select("business_name, gstin").eq("id", inv.client_id).single(),
      supabaseAdmin.from("ca_firms").select("name").eq("id", inv.ca_firm_id).single(),
    ]);

    return {
      ok: true as const,
      businessName: client?.business_name ?? "Your business",
      gstin: client?.gstin ?? null,
      firmName: firm?.name ?? "Your CA firm",
      email: inv.email,
    };
  });

// ---------- ACCEPT INVITE (authed) ----------

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(10).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: inv } = await supabaseAdmin
      .from("client_invites")
      .select("id, ca_firm_id, client_id, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) throw new Error("Invite not found");
    if (inv.accepted_at) throw new Error("Invite already used");
    if (new Date(inv.expires_at).getTime() < Date.now()) throw new Error("Invite expired");

    // Insert client_owner role (idempotent via on-conflict)
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "client_owner",
      client_id: inv.client_id,
    });
    if (rErr && !String(rErr.message).toLowerCase().includes("duplicate")) {
      throw new Error(rErr.message);
    }

    await supabaseAdmin
      .from("clients")
      .update({ status: "active", owner_user_id: userId })
      .eq("id", inv.client_id);

    await supabaseAdmin
      .from("client_invites")
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", inv.id);

    return { ok: true, clientId: inv.client_id, caFirmId: inv.ca_firm_id };
  });

// ---------- LOAD TENANT CONTEXT ----------

export const loadTenantContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role, ca_firm_id, client_id")
      .eq("user_id", userId);

    const rolesList = roles ?? [];
    const caOwner = rolesList.find((r) => r.role === "ca_owner");
    const caStaff = rolesList.find((r) => r.role === "ca_staff");
    const clientRole = rolesList.find((r) => r.role === "client_owner" || r.role === "client_employee");

    let firm: { id: string; name: string; logo_url: string | null; primary_color: string | null; subdomain_slug: string | null } | null = null;
    let availableClients: Array<{ id: string; business_name: string; gstin: string | null; status: string }> = [];
    const firmCols = "id, name, logo_url, primary_color, subdomain_slug";

    if (caOwner?.ca_firm_id) {
      const { data: f } = await supabaseAdmin.from("ca_firms").select(firmCols).eq("id", caOwner.ca_firm_id).single();
      firm = f as any;
      const { data: cs } = await supabaseAdmin
        .from("clients")
        .select("id, business_name, gstin, status")
        .eq("ca_firm_id", caOwner.ca_firm_id)
        .order("business_name");
      availableClients = cs ?? [];
    } else if (caStaff?.ca_firm_id) {
      const { data: f } = await supabaseAdmin.from("ca_firms").select(firmCols).eq("id", caStaff.ca_firm_id).single();
      firm = f as any;
      const { data: assigns } = await supabaseAdmin
        .from("ca_staff_assignments")
        .select("client_id, clients!inner(id, business_name, gstin, status)")
        .eq("staff_user_id", userId);
      availableClients = (assigns ?? []).map((a: any) => a.clients);
    } else if (clientRole?.client_id) {
      const { data: c } = await supabaseAdmin
        .from("clients")
        .select("id, business_name, gstin, status, ca_firm_id")
        .eq("id", clientRole.client_id)
        .single();
      if (c) {
        availableClients = [{ id: c.id, business_name: c.business_name, gstin: c.gstin, status: c.status }];
        const { data: f } = await supabaseAdmin.from("ca_firms").select(firmCols).eq("id", c.ca_firm_id).single();
        firm = f as any;
      }
    }

    const role: "ca_owner" | "ca_staff" | "client_owner" | "client_employee" | null =
      (caOwner?.role as any) ?? (caStaff?.role as any) ?? (clientRole?.role as any) ?? null;

    return { role, firm, availableClients };
  });

// ---------- UPDATE FIRM BRANDING (CA OWNER) ----------

export const updateFirmBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(2).max(120).optional(),
      logoUrl: z.string().trim().max(2000).nullable().optional(),
      primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      subdomainSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: firm } = await supabaseAdmin
      .from("user_roles")
      .select("ca_firm_id")
      .eq("user_id", userId)
      .eq("role", "ca_owner")
      .limit(1)
      .maybeSingle();
    if (!firm?.ca_firm_id) throw new Error("Only CA owners can update branding");

    const patch: Record<string, any> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.logoUrl !== undefined) patch.logo_url = data.logoUrl;
    if (data.primaryColor !== undefined) patch.primary_color = data.primaryColor;
    if (data.subdomainSlug !== undefined) patch.subdomain_slug = data.subdomainSlug;

    const { error } = await supabaseAdmin.from("ca_firms").update(patch as any).eq("id", firm.ca_firm_id);
    if (error) throw new Error(error.message);
    return { ok: true, caFirmId: firm.ca_firm_id };
  });
