/**
 * Heuristic + AI mapping suggestions for Tally ledger names.
 */
import type { ParsedRow } from "./tally.parsers.server";

export type GstCategory = "SALES" | "PURCHASE" | "EXPENSE" | "ASSET";
export type Suggestion = { category: GstCategory; rate: number; hsn: string | null; source: "heuristic" | "history" | "ai" };

export function extractLedgers(rows: ParsedRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) if (r.ledger) set.add(r.ledger.trim());
  return Array.from(set).sort();
}

const RATE_RE = /(\d{1,2})\s*%/;

export function heuristicSuggest(ledger: string): Suggestion | null {
  const n = ledger.toLowerCase();
  const rateMatch = ledger.match(RATE_RE);
  const rate = rateMatch ? Number(rateMatch[1]) : 18;

  if (/sale|sales|sold|revenue|income/.test(n)) {
    return { category: "SALES", rate, hsn: "998231", source: "heuristic" };
  }
  if (/purchase|bought|procurement|raw material/.test(n)) {
    return { category: "PURCHASE", rate, hsn: null, source: "heuristic" };
  }
  if (/freight|carriage|transport|courier|delivery/.test(n)) {
    return { category: "EXPENSE", rate: rateMatch ? rate : 5, hsn: "996511", source: "heuristic" };
  }
  if (/rent|electricity|telephone|internet|professional|salary|wages|stationery|office/.test(n)) {
    return { category: "EXPENSE", rate: rateMatch ? rate : 18, hsn: null, source: "heuristic" };
  }
  if (/capital|machinery|equipment|asset|furniture|computer/.test(n)) {
    return { category: "ASSET", rate: rateMatch ? rate : 18, hsn: null, source: "heuristic" };
  }
  if (/cgst|sgst|igst|tax/.test(n)) return null; // skip tax ledgers
  return null;
}

export async function aiSuggestMapping(ledger: string): Promise<Suggestion | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You classify Indian Tally ledger names. Reply ONLY with strict JSON: {\"category\":\"SALES|PURCHASE|EXPENSE|ASSET\",\"rate\":0|5|12|18|28,\"hsn\":string|null}. No prose.",
          },
          { role: "user", content: `Ledger name: "${ledger}"` },
        ],
      }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (!["SALES", "PURCHASE", "EXPENSE", "ASSET"].includes(parsed.category)) return null;
    return { category: parsed.category, rate: Number(parsed.rate ?? 18), hsn: parsed.hsn ?? null, source: "ai" };
  } catch {
    return null;
  }
}

export async function suggestForLedger(ledger: string): Promise<Suggestion> {
  return (
    heuristicSuggest(ledger) ??
    (await aiSuggestMapping(ledger)) ??
    { category: "EXPENSE", rate: 18, hsn: null, source: "heuristic" }
  );
}
