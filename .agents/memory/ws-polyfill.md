---
name: Node.js 20 WebSocket polyfill for Supabase SSR
description: Supabase Realtime client throws on Node.js 20 without native WebSocket; fix and where it lives.
---

## Rule
Any Supabase client initialization during SSR on Node.js 20 will throw "Node.js 20 detected without native WebSocket support" unless `globalThis.WebSocket` is polyfilled before the client is created.

**Why:** Node.js 20 lacks native `globalThis.WebSocket`. Supabase's `@supabase/realtime-js` detects this and throws immediately when the client initializes. The `ws` package (already installed as a dependency) provides the WebSocket implementation.

**How to apply:** The polyfill lives in `src/lib/ws-polyfill.server.ts` (uses `createRequire` from Node's `module` package to synchronously require `ws` and assign to `globalThis.WebSocket`). It is imported as the *very first* import in `src/server.ts` — before `./lib/error-capture` — so it runs before any Supabase client initialization during SSR.

The polyfill is guarded by `typeof globalThis.WebSocket === 'undefined'` so it's a no-op in browsers (which always have WebSocket) and in Node.js 22+ (which has native WebSocket).
