import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search, Copy, ChevronDown, ChevronUp, ExternalLink, Users, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  searchGstLibraryFn,
  getHsnDetailFn,
  getSacDetailFn,
  listGstNotificationsFn,
  getGstNotificationFn,
  getAffectedClientsFn,
  markGstNotificationReadFn,
  setGstUpdatesSubscriptionFn,
  getGstLibraryPrefsFn,
} from "@/lib/gst-library.functions";
import {
  EXAMPLE_SEARCHES,
  IMPACT_STYLES,
  NOTIFICATION_FILTER_LABELS,
  QUICK_SEARCH_CATEGORIES,
} from "@/lib/gst-library.content";
import {
  codeLabel,
  descriptionLabel,
  formatGstTotal,
  GstRateLines,
} from "@/components/gst-library/GstRateBadge";
import type { GstSearchResult } from "@/lib/gst-library.utils";
import { formatRateLabel } from "@/lib/gst-library.utils";

type Search = { q?: string; notification?: string };

export const Route = createFileRoute("/_authenticated/ca/gst-library")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === "string" ? s.q : undefined,
    notification: typeof s.notification === "string" ? s.notification : undefined,
  }),
  component: GstLibraryPage,
});

function GstLibraryPage() {
  const { q: initialQ, notification: notifId } = Route.useSearch();
  const searchFn = useServerFn(searchGstLibraryFn);
  const listNotif = useServerFn(listGstNotificationsFn);
  const getNotif = useServerFn(getGstNotificationFn);
  const affectedFn = useServerFn(getAffectedClientsFn);
  const markRead = useServerFn(markGstNotificationReadFn);
  const setSub = useServerFn(setGstUpdatesSubscriptionFn);
  const getPrefs = useServerFn(getGstLibraryPrefsFn);
  const hsnDetailFn = useServerFn(getHsnDetailFn);
  const sacDetailFn = useServerFn(getSacDetailFn);

  const [query, setQuery] = useState(initialQ ?? "");
  const [committed, setCommitted] = useState(initialQ ?? "");
  const [dropdown, setDropdown] = useState<GstSearchResult[]>([]);
  const [results, setResults] = useState<GstSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [notifFilter, setNotifFilter] = useState("ALL");
  const [notifModal, setNotifModal] = useState<any>(null);
  const [affected, setAffected] = useState<any[]>([]);
  const [showAffected, setShowAffected] = useState(false);

  const runSearch = useCallback(
    async (text: string, forResults: boolean) => {
      if (text.trim().length < 3) {
        setDropdown([]);
        if (forResults) setResults([]);
        return;
      }
      setSearching(true);
      try {
        const r = await searchFn({ data: { query: text, limit: forResults ? 25 : 8 } });
        const list = r.results as GstSearchResult[];
        if (forResults) setResults(list);
        else setDropdown(list);
      } catch {
        if (forResults) setResults([]);
        else setDropdown([]);
      } finally {
        setSearching(false);
      }
    },
    [searchFn],
  );

  useEffect(() => {
    const t = setTimeout(() => runSearch(query, false), 150);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    if (initialQ && initialQ.length >= 3) {
      setQuery(initialQ);
      setCommitted(initialQ);
      runSearch(initialQ, true);
    }
  }, [initialQ, runSearch]);

  useEffect(() => {
    if (!notifId) return;
    getNotif({ data: { id: notifId } })
      .then((r: any) => {
        setNotifModal(r.notification);
        setAffected(r.affected ?? []);
      })
      .catch(() => {});
  }, [notifId, getNotif]);

  const { data: notifData, refetch: refetchNotif } = useQuery({
    queryKey: ["gst-notifications", notifFilter],
    queryFn: () => listNotif({ data: { category: notifFilter === "ALL" ? undefined : notifFilter } }),
  });

  const { data: prefs, refetch: refetchPrefs } = useQuery({
    queryKey: ["gst-library-prefs"],
    queryFn: () => getPrefs({ data: undefined as any }),
  });

  const submitSearch = () => {
    setCommitted(query);
    runSearch(query, true);
    setDropdown([]);
  };

  const openDetail = async (row: GstSearchResult) => {
    const key = row.kind === "HSN" ? row.hsn_code : row.sac_code;
    if (expanded === key) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(key);
    try {
      if (row.kind === "HSN") {
        setDetail(await hsnDetailFn({ data: { hsnCode: row.hsn_code } }));
      } else {
        setDetail(await sacDetailFn({ data: { sacCode: row.sac_code } }));
      }
    } catch {
      setDetail(null);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Copied to clipboard");
  };

  const openNotification = async (id: string) => {
    const r = await getNotif({ data: { id } });
    setNotifModal(r.notification);
    setAffected(r.affected ?? []);
    setShowAffected(false);
  };

  const loadAffected = async () => {
    if (!notifModal?.id) return;
    const r = await affectedFn({ data: { notificationId: notifModal.id } });
    setAffected(r.affected ?? []);
    setShowAffected(true);
  };

  const ResultCard = ({ row }: { row: GstSearchResult }) => {
    const code = codeLabel(row);
    const isOpen = expanded === code;
    return (
      <article className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">{code}</div>
            <p className="text-sm font-medium mt-1">{descriptionLabel(row)}</p>
            <GstRateLines row={row} />
            <p className="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-300">
              Total GST: {formatGstTotal(row)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Effective from:{" "}
              {new Date(row.effective_from).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openDetail(row)}>
              {isOpen ? "Hide" : "View"} Details
              {isOpen ? <ChevronUp className="size-4 ml-1" /> : <ChevronDown className="size-4 ml-1" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => copyCode(code)}>
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
        {isOpen && detail && (
          <div className="mt-4 pt-4 border-t border-border text-sm space-y-3">
            {row.kind === "HSN" && detail.current?.notes && (
              <p className="text-muted-foreground">{detail.current.notes}</p>
            )}
            {row.kind === "SAC" && detail.current?.exemption_condition && (
              <p className="text-amber-800 dark:text-amber-300">{detail.current.exemption_condition}</p>
            )}
            {detail.history?.length > 0 && (
              <div>
                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Rate history</p>
                <ul className="mt-1 space-y-1 text-xs">
                  {detail.history.map((h: any) => (
                    <li key={h.id}>
                      {formatRateLabel(h.cgst_rate, h.sgst_rate, h.igst_rate, h.cess_rate)} until{" "}
                      {h.effective_to
                        ? new Date(h.effective_to).toLocaleDateString("en-IN")
                        : "present"}{" "}
                      (from {new Date(h.effective_from).toLocaleDateString("en-IN")})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detail.related?.length > 0 && (
              <div>
                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Related codes</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {detail.related.map((r: any) => (
                    <button
                      key={r.id}
                      type="button"
                      className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-primary/10"
                    onClick={() => {
                      setQuery(r.hsn_code);
                      setCommitted(r.hsn_code);
                      runSearch(r.hsn_code, true);
                    }}
                    >
                      {r.hsn_code}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground italic">
              Refer: CBIC GST rate schedule for official notification text.
            </p>
          </div>
        )}
      </article>
    );
  };

  const displayResults = committed.length >= 3 ? results : [];

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold">GST Library</h1>
        <p className="text-muted-foreground mt-1">HSN &amp; SAC rate finder + latest GST law updates</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Left: Rate finder */}
        <div className="lg:col-span-3 space-y-6">
          <div className="relative md:sticky md:top-20 z-10">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
              placeholder="Search by product name, HSN code, or service type…"
              className="pl-12 h-14 text-base rounded-2xl shadow-sm"
            />
            {dropdown.length > 0 && query.length >= 3 && !committed && (
              <div className="absolute left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-lg max-h-64 overflow-y-auto z-20">
                {dropdown.map((row) => (
                  <button
                    key={`${row.kind}-${codeLabel(row)}`}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-muted border-b border-border last:border-0"
                    onClick={() => {
                      setQuery(codeLabel(row));
                      setCommitted(codeLabel(row));
                      setResults([row]);
                      setDropdown([]);
                    }}
                  >
                    <span className="font-mono font-bold text-emerald-600">{codeLabel(row)}</span>
                    <span className="text-sm ml-2">{descriptionLabel(row).slice(0, 60)}…</span>
                    <span className="float-right text-sm font-semibold text-emerald-700">{formatGstTotal(row)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Try: {EXAMPLE_SEARCHES.map((ex) => (
              <button key={ex} type="button" className="underline mx-1 hover:text-foreground" onClick={() => { setQuery(ex); setCommitted(ex); runSearch(ex, true); }}>
                {ex}
              </button>
            ))}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {QUICK_SEARCH_CATEGORIES.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  setQuery(c.query);
                  setCommitted(c.query);
                  runSearch(c.query, true);
                }}
                className="rounded-xl border border-border bg-card p-3 text-left text-xs hover:border-primary/40 transition"
              >
                <span className="text-lg">{c.emoji}</span>
                <div className="font-medium mt-1 leading-tight">{c.label}</div>
              </button>
            ))}
          </div>

          <div className="space-y-3 min-h-[200px]">
            {searching && <p className="text-sm text-muted-foreground">Searching…</p>}
            {!searching && committed.length >= 3 && displayResults.length === 0 && (
              <p className="text-sm text-muted-foreground">No matches. Try an HSN code or broader product name.</p>
            )}
            {displayResults.map((row) => (
              <ResultCard key={`${row.kind}-${row.id}`} row={row} />
            ))}
          </div>
        </div>

        {/* Right: Updates feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-display text-xl font-semibold">Latest GST updates</h2>
            <div className="flex items-center gap-2 text-xs">
              <Bell className="size-3.5" />
              <span>Subscribe</span>
              <Switch
                checked={prefs?.subscribed ?? false}
                onCheckedChange={async (v) => {
                  await setSub({ data: { subscribed: v } });
                  refetchPrefs();
                  toast.success(v ? "Subscribed to GST updates" : "Unsubscribed");
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {Object.entries(NOTIFICATION_FILTER_LABELS).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setNotifFilter(k)}
                className={
                  "px-2.5 py-1 rounded-full text-[11px] font-medium border transition " +
                  (notifFilter === k ? "bg-primary text-primary-foreground border-primary" : "border-border")
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {(notifData?.notifications ?? []).map((n: any) => (
              <article
                key={n.id}
                className={
                  "rounded-2xl border p-4 cursor-pointer hover:border-primary/30 transition " +
                  (n.isRead ? "opacity-80" : "border-primary/20 bg-card")
                }
                onClick={() => openNotification(n.id)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${IMPACT_STYLES[n.impact_level] ?? ""}`}>
                    {n.impact_level} IMPACT
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(n.effective_date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <h3 className="font-semibold text-sm mt-2">{n.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{n.notification_number}</p>
                <p className="text-sm mt-2 line-clamp-2">{n.summary}</p>
                {n.affected_hsn_codes?.length > 0 && (
                  <p className="text-xs text-primary mt-2">Affects HSN: {n.affected_hsn_codes.join(", ")}</p>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={!!notifModal} onOpenChange={(o) => !o && setNotifModal(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {notifModal && (
            <>
              <DialogHeader>
                <span className={`inline-flex w-fit text-[10px] font-bold px-2 py-0.5 rounded border ${IMPACT_STYLES[notifModal.impact_level]}`}>
                  {notifModal.impact_level} IMPACT
                </span>
                <DialogTitle className="font-display text-left">{notifModal.title}</DialogTitle>
                <p className="text-xs text-muted-foreground">{notifModal.notification_number}</p>
              </DialogHeader>
              <div className="text-sm space-y-3">
                <p>{notifModal.full_summary || notifModal.summary}</p>
                {notifModal.affected_hsn_codes?.length > 0 && (
                  <p className="text-xs">
                    <strong>Affected HSN:</strong> {notifModal.affected_hsn_codes.join(", ")}
                  </p>
                )}
                <Button className="w-full gap-2" variant="default" onClick={loadAffected}>
                  <Users className="size-4" />
                  Which of my clients does this affect?
                </Button>
                {showAffected && (
                  <div className="rounded-lg border border-border p-3 bg-muted/30">
                    {affected.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No clients matched yet based on invoice HSN data. Review clients in affected industries manually.
                      </p>
                    ) : (
                      <ul className="text-sm space-y-2">
                        {affected.map((c: any) => (
                          <li key={c.id}>
                            <Link to="/ca/clients/$clientId" params={{ clientId: c.id }} className="font-medium hover:underline">
                              {c.business_name}
                            </Link>
                            <span className="text-xs text-muted-foreground ml-2">
                              HSN {c.hsnMatches?.join(", ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {notifModal.full_text_url && (
                  <a
                    href={notifModal.full_text_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary underline"
                  >
                    Download official PDF <ExternalLink className="size-3.5" />
                  </a>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      await markRead({ data: { notificationId: notifModal.id } });
                      refetchNotif();
                      toast.success("Marked as read");
                    }}
                  >
                    Mark as Read
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
