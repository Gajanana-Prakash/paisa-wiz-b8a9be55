import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertFirmAccess } from "./timetracking.server";
import {
  ACTIVITY_CATEGORY,
  computeCpeStatus,
  computePaceInfo,
  getOrCreateCpeProfile,
} from "./cpe.server";

export const getCpeSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const firmId = await assertFirmAccess(context.userId);
      const profile = await getOrCreateCpeProfile(context.userId, firmId);

      const { data: acts, error: actsError } = await supabaseAdmin
        .from("cpe_activities")
        .select("hours_claimed, activity_category")
        .eq("user_id", context.userId);

      if (actsError) throw new Error(actsError.message);

      const structured = (acts ?? [])
        .filter((a) => a.activity_category === "STRUCTURED")
        .reduce((s, a) => s + Number(a.hours_claimed), 0);
      const unstructured = (acts ?? [])
        .filter((a) => a.activity_category === "UNSTRUCTURED")
        .reduce((s, a) => s + Number(a.hours_claimed), 0);
      const total = structured + unstructured;

      const status = computeCpeStatus(
        total,
        profile.cpe_hours_required,
        profile.current_cpe_block_start,
        profile.current_cpe_block_end,
      );
      const pace = computePaceInfo(
        total,
        profile.cpe_hours_required,
        profile.current_cpe_block_start,
        profile.current_cpe_block_end,
      );

      return { profile, structured, unstructured, total, status, pace };
    } catch (e: any) {
      if (e.message?.includes("does not exist") || e.message?.includes("relation")) {
        return null;
      }
      throw e;
    }
  });

export const saveCpeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      membershipNumber: z.string().trim().max(20).optional(),
      membershipType: z.enum(["ASSOCIATE", "FELLOW"]).optional(),
      copNumber: z.string().trim().max(30).optional(),
      copExpiryDate: z.string().optional(),
      blockStart: z.string().optional(),
      blockEnd: z.string().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const profile = await getOrCreateCpeProfile(context.userId, firmId);
    const { error } = await supabaseAdmin
      .from("ca_professional_profiles")
      .update({
        membership_number: data.membershipNumber ?? profile.membership_number,
        membership_type: data.membershipType ?? profile.membership_type,
        cop_number: data.copNumber ?? profile.cop_number,
        cop_expiry_date: data.copExpiryDate ?? profile.cop_expiry_date,
        current_cpe_block_start: data.blockStart ?? profile.current_cpe_block_start,
        current_cpe_block_end: data.blockEnd ?? profile.current_cpe_block_end,
      })
      .eq("id", profile.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const logCpeActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      activityDate: z.string(),
      activityType: z.enum([
        "SEMINAR","WEBINAR","CONFERENCE","SELF_READING","WRITING",
        "TEACHING","ICAI_PROGRAM","E_LEARNING","STUDY_CIRCLE",
      ]),
      title: z.string().trim().min(1).max(500),
      organizer: z.string().trim().max(200).default(""),
      hoursClaimed: z.number().min(0.5).max(24),
      certificateUrl: z.string().url().optional().or(z.literal("")),
      icaiActivityId: z.string().max(60).optional(),
      notes: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const firmId = await assertFirmAccess(context.userId);
    const category = ACTIVITY_CATEGORY[data.activityType];
    const { error } = await supabaseAdmin.from("cpe_activities").insert({
      user_id: context.userId,
      tenant_id: firmId,
      activity_date: data.activityDate,
      activity_type: data.activityType,
      activity_category: category,
      title: data.title,
      organizer: data.organizer,
      hours_claimed: data.hoursClaimed,
      certificate_url: data.certificateUrl || null,
      icai_activity_id: data.icaiActivityId || null,
      notes: data.notes || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCpeActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      activityDate: z.string(),
      activityType: z.enum([
        "SEMINAR","WEBINAR","CONFERENCE","SELF_READING","WRITING",
        "TEACHING","ICAI_PROGRAM","E_LEARNING","STUDY_CIRCLE",
      ]),
      title: z.string().trim().min(1).max(500),
      organizer: z.string().trim().max(200).default(""),
      hoursClaimed: z.number().min(0.5).max(24),
      certificateUrl: z.string().url().optional().or(z.literal("")),
      icaiActivityId: z.string().max(60).optional(),
      notes: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const category = ACTIVITY_CATEGORY[data.activityType];
    const { error } = await supabaseAdmin
      .from("cpe_activities")
      .update({
        activity_date: data.activityDate,
        activity_type: data.activityType,
        activity_category: category,
        title: data.title,
        organizer: data.organizer,
        hours_claimed: data.hoursClaimed,
        certificate_url: data.certificateUrl || null,
        icai_activity_id: data.icaiActivityId || null,
        notes: data.notes || null,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCpeActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("cpe_activities")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCpeActivities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("cpe_activities")
        .select("*")
        .eq("user_id", context.userId)
        .order("activity_date", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    } catch (e: any) {
      if (e.message?.includes("does not exist") || e.message?.includes("relation")) return [];
      throw e;
    }
  });

export const listUpcomingEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabaseAdmin
        .from("icai_upcoming_events")
        .select("*")
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(20);
      return data ?? [];
    } catch {
      return [];
    }
  });
