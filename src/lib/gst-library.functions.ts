import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getClientsAffectedByNotification,
  getGstNotification,
  getHsnDetail,
  getSacDetail,
  listGstNotifications,
  lookupByCode,
  searchGstLibrary,
} from "./gst-library.server";

async function getCaFirmId(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("ca_firm_id")
    .eq("user_id", userId)
    .in("role", ["ca_owner", "ca_staff"])
    .limit(1)
    .maybeSingle();
  if (!data?.ca_firm_id) throw new Error("CA workspace required");
  return data.ca_firm_id;
}

export const searchGstLibraryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().max(120), limit: z.number().int().min(1).max(30).optional() }).parse(d))
  .handler(async ({ data }) => {
    const results = await searchGstLibrary(data.query, data.limit ?? 15);
    return { results };
  });

export const lookupGstCodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().max(20) }).parse(d))
  .handler(async ({ data }) => {
    const row = await lookupByCode(data.code);
    return { row };
  });

export const getHsnDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hsnCode: z.string().max(12) }).parse(d))
  .handler(async ({ data }) => getHsnDetail(data.hsnCode));

export const getSacDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sacCode: z.string().max(12) }).parse(d))
  .handler(async ({ data }) => getSacDetail(data.sacCode));

export const listGstNotificationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ category: z.string().optional(), limit: z.number().int().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const notifications = await listGstNotifications({
      category: data.category,
      limit: data.limit ?? 25,
    });

    const { data: reads } = await supabaseAdmin
      .from("gst_notification_reads")
      .select("notification_id")
      .eq("user_id", context.userId);

    const readSet = new Set((reads ?? []).map((r) => r.notification_id));

    return {
      notifications: notifications.map((n) => ({
        ...n,
        isRead: readSet.has(n.id),
      })),
    };
  });

export const getGstNotificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const notification = await getGstNotification(data.id);
    if (!notification) throw new Error("Notification not found");

    const firmId = await getCaFirmId(context.userId);
    const affected = await getClientsAffectedByNotification(
      firmId,
      notification.affected_hsn_codes ?? [],
    );

    return { notification, affected };
  });

export const getAffectedClientsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ notificationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const notification = await getGstNotification(data.notificationId);
    if (!notification) throw new Error("Notification not found");
    const firmId = await getCaFirmId(context.userId);
    const affected = await getClientsAffectedByNotification(
      firmId,
      notification.affected_hsn_codes ?? [],
    );
    return { affected, codes: notification.affected_hsn_codes ?? [] };
  });

export const markGstNotificationReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ notificationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin.from("gst_notification_reads").upsert({
      notification_id: data.notificationId,
      user_id: context.userId,
      read_at: new Date().toISOString(),
    });
    return { ok: true };
  });

export const setGstUpdatesSubscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ subscribed: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await getCaFirmId(context.userId);
    const { error } = await supabaseAdmin
      .from("ca_firms")
      .update({ gst_updates_subscribed: data.subscribed })
      .eq("id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true, subscribed: data.subscribed };
  });

export const getGstLibraryPrefsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await getCaFirmId(context.userId);
    const { data: firm } = await supabaseAdmin
      .from("ca_firms")
      .select("gst_updates_subscribed")
      .eq("id", firmId)
      .single();
    return { subscribed: firm?.gst_updates_subscribed ?? false };
  });
