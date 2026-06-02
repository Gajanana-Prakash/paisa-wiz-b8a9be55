import { createRequire } from "module";

if (typeof globalThis.WebSocket === "undefined") {
  try {
    const req = createRequire(import.meta.url);
    const ws = req("ws");
    (globalThis as any).WebSocket = ws;
  } catch {
    // ws package unavailable — Supabase Realtime may not function in SSR
  }
}
