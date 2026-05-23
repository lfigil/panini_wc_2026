"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trade, Profile, TradeStatus, parseStickerRef } from "@/lib/types";
import { ArrowLeftRight, Check, X, Loader2, Clock, Sparkles, Plus, Trash2 } from "lucide-react";

interface Duplicate {
  sticker_id: string;
  variant: string;
  quantity: number;
  description: string;
  team_code: string;
  is_foil: boolean;
}

interface FriendDuplicate {
  user_id: string;
  sticker_id: string;
  variant: string;
  quantity: number;
  description: string;
  team_code: string;
}

interface EnrichedTrade extends Trade {
  offerer_name: string;
  receiver_name: string;
}

interface Props {
  userId: string;
  profiles: Profile[];
  trades: Trade[];
  duplicates: Duplicate[];
  stickers: { id: string; description: string; team_code: string }[];
  myCollection: { sticker_id: string }[];
  friendDuplicates: FriendDuplicate[];
}

type Tab = "incoming" | "outgoing" | "propose" | "history";

const VARIANT_CHIP: Record<string, string> = {
  standard: "bg-zinc-700 border-zinc-600 text-zinc-200",
  orange:   "bg-orange-900/50 border-orange-500 text-orange-300",
  blue:     "bg-blue-900/50 border-blue-500 text-blue-300",
  red:      "bg-red-900/50 border-red-500 text-red-300",
  green:    "bg-green-900/50 border-green-500 text-green-300",
  purple:   "bg-purple-900/50 border-purple-500 text-purple-300",
  black:    "bg-zinc-900 border-zinc-500 text-zinc-300",
  other:    "bg-zinc-700 border-zinc-500 text-zinc-300",
};

function StickerPill({ raw, stickerMap, onRemove }: {
  raw: string;
  stickerMap: Map<string, string>;
  onRemove?: () => void;
}) {
  const ref = parseStickerRef(raw);
  const cls = VARIANT_CHIP[ref.variant] ?? VARIANT_CHIP.other;
  return (
    <span className={`inline-flex items-center gap-1 border rounded-lg px-2 py-1 font-mono text-xs font-bold ${cls}`}>
      {raw}
      {onRemove && (
        <button onClick={onRemove} className="opacity-60 hover:opacity-100 ml-0.5">
          <X size={10} />
        </button>
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: TradeStatus }) {
  const styles: Record<TradeStatus, string> = {
    pending:   "bg-amber-900/40 text-amber-400",
    accepted:  "bg-blue-900/40 text-blue-400",
    completed: "bg-green-900/40 text-green-400",
    declined:  "bg-zinc-700 text-zinc-400",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

function TradeCard({ trade, userId, stickerMap, onAction, loadingId }: {
  trade: EnrichedTrade;
  userId: string;
  stickerMap: Map<string, string>;
  onAction: (id: string, status: TradeStatus) => void;
  loadingId: string | null;
}) {
  const isOfferer = trade.offerer_id === userId;
  const isPending = trade.status === "pending";
  const loading = loadingId === trade.id;

  return (
    <div className="bg-[#27272a] rounded-xl p-4 border border-zinc-700/50">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs font-semibold text-zinc-200">
            {isOfferer ? `To ${trade.receiver_name}` : `From ${trade.offerer_name}`}
          </p>
          <p className="text-xs text-zinc-500">{new Date(trade.created_at).toLocaleDateString()}</p>
        </div>
        <StatusBadge status={trade.status} />
      </div>

      {/* Sticker lists */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1.5">
            {isOfferer ? "You offer" : "They offer"}
          </p>
          <div className="flex flex-wrap gap-1">
            {trade.offered_stickers.map((s, i) => (
              <StickerPill key={i} raw={s} stickerMap={stickerMap} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1.5">
            {isOfferer ? "You want" : "They want"}
          </p>
          <div className="flex flex-wrap gap-1">
            {trade.wanted_stickers.map((s, i) => (
              <StickerPill key={i} raw={s} stickerMap={stickerMap} />
            ))}
          </div>
        </div>
      </div>

      {trade.offered_stickers.length > 1 && (
        <p className="text-[10px] text-zinc-600 mb-2">
          {trade.offered_stickers.length} stickers each side
        </p>
      )}

      {trade.notes && (
        <p className="text-xs text-zinc-400 italic mb-3">"{trade.notes}"</p>
      )}

      {isPending && (
        <div className="flex gap-2">
          {!isOfferer && (
            <button
              onClick={() => onAction(trade.id, "accepted")}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Accept
            </button>
          )}
          <button
            onClick={() => onAction(trade.id, "declined")}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 text-xs font-semibold py-2 rounded-lg transition-colors"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
            {isOfferer ? "Cancel" : "Decline"}
          </button>
          {!isOfferer && trade.status === "accepted" && (
            <button
              onClick={() => onAction(trade.id, "completed")}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
            >
              <Check size={13} /> Done
            </button>
          )}
        </div>
      )}

      {trade.status === "accepted" && (
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => onAction(trade.id, "completed")}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Mark as completed
          </button>
        </div>
      )}
    </div>
  );
}

export default function TradesClient({
  userId, profiles, trades: initialTrades, duplicates,
  stickers, myCollection, friendDuplicates,
}: Props) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("incoming");
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Propose state
  const [receiverId, setReceiverId] = useState("");
  const [offeredStickers, setOfferedStickers] = useState<string[]>([]);
  const [wantedStickers, setWantedStickers] = useState<string[]>([]);
  const [manualOffered, setManualOffered] = useState("");
  const [manualWanted, setManualWanted] = useState("");
  const [notes, setNotes] = useState("");
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  const stickerMap = useMemo(() => new Map(stickers.map((s) => [s.id, s.description])), [stickers]);
  const stickerIds = useMemo(() => new Set(stickers.map((s) => s.id)), [stickers]);
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p.display_name])), [profiles]);
  const myOwnedIds = useMemo(() => new Set(myCollection.map((c) => c.sticker_id)), [myCollection]);

  // Smart match: what friend has as dupes that I need
  const smartTheyOffer = useMemo(() => {
    if (!receiverId) return [];
    return friendDuplicates
      .filter((d) => d.user_id === receiverId && !myOwnedIds.has(d.sticker_id))
      .slice(0, 20);
  }, [receiverId, friendDuplicates, myOwnedIds]);

  // Smart match: what I have as dupes that friend needs
  const smartIOffer = useMemo(() => {
    if (!receiverId) return [];
    const friendOwned = new Set(
      friendDuplicates.filter((d) => d.user_id === receiverId).map((d) => d.sticker_id)
    );
    // Also include stickers friend has at all (from any collection row) — but we only have dupes
    // So we check: my dupes that friend doesn't have ANY of (from friendDuplicates data)
    // This is approximate — we show my dupes that aren't in friend's dup list
    return duplicates.filter((d) => !friendOwned.has(d.sticker_id)).slice(0, 20);
  }, [receiverId, duplicates, friendDuplicates]);

  const enrichedTrades: EnrichedTrade[] = useMemo(
    () => trades.map((t) => ({
      ...t,
      offerer_name: t.offerer_id === userId ? "You" : (profileMap.get(t.offerer_id) ?? "Unknown"),
      receiver_name: t.receiver_id === userId ? "You" : (profileMap.get(t.receiver_id) ?? "Unknown"),
    })),
    [trades, profileMap, userId]
  );

  const incoming = enrichedTrades.filter((t) => t.receiver_id === userId && t.status === "pending");
  const outgoing = enrichedTrades.filter((t) => t.offerer_id === userId && t.status === "pending");
  const history = enrichedTrades
    .filter((t) => t.status !== "pending")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  function switchTab(t: Tab) { setTab(t); setError(null); setSuccess(null); }

  async function updateTradeStatus(id: string, status: TradeStatus) {
    setLoadingId(id);
    setError(null);
    const { error: err } = await supabase.from("trades").update({ status }).eq("id", id);
    if (err) setError(err.message);
    else setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    setLoadingId(null);
  }

  function toggleOffered(raw: string) {
    setOfferedStickers((prev) =>
      prev.includes(raw) ? prev.filter((s) => s !== raw) : [...prev, raw]
    );
  }

  function toggleWanted(raw: string) {
    setWantedStickers((prev) =>
      prev.includes(raw) ? prev.filter((s) => s !== raw) : [...prev, raw]
    );
  }

  function addManualOffered() {
    const norm = manualOffered.trim().toUpperCase();
    if (!norm || !stickerIds.has(parseStickerRef(norm).id)) {
      setProposeError("Unknown sticker ID: " + norm); return;
    }
    if (!offeredStickers.includes(norm)) setOfferedStickers((p) => [...p, norm]);
    setManualOffered("");
    setProposeError(null);
  }

  function addManualWanted() {
    const norm = manualWanted.trim().toUpperCase();
    if (!norm || !stickerIds.has(parseStickerRef(norm).id)) {
      setProposeError("Unknown sticker ID: " + norm); return;
    }
    if (!wantedStickers.includes(norm)) setWantedStickers((p) => [...p, norm]);
    setManualWanted("");
    setProposeError(null);
  }

  async function proposeTrade() {
    setProposeError(null);
    if (!receiverId) { setProposeError("Select a friend."); return; }
    if (offeredStickers.length === 0) { setProposeError("Add at least one sticker to offer."); return; }
    if (wantedStickers.length === 0) { setProposeError("Add at least one sticker to request."); return; }
    if (offeredStickers.length !== wantedStickers.length) {
      setProposeError(`Unbalanced: you're offering ${offeredStickers.length} but requesting ${wantedStickers.length}. Both sides must match.`);
      return;
    }
    setProposing(true);
    const { data, error: err } = await supabase
      .from("trades")
      .insert({
        offerer_id: userId,
        receiver_id: receiverId,
        offered_stickers: offeredStickers,
        wanted_stickers: wantedStickers,
        notes: notes.trim() || null,
      })
      .select()
      .single();
    if (err) {
      setProposeError(err.message);
    } else {
      setTrades((prev) => [data, ...prev]);
      setReceiverId("");
      setOfferedStickers([]);
      setWantedStickers([]);
      setNotes("");
      setSuccess(`Trade proposed! ${offeredStickers.length} sticker${offeredStickers.length > 1 ? "s" : ""} each side.`);
      switchTab("outgoing");
    }
    setProposing(false);
  }

  const cardCls = "bg-[#27272a] rounded-xl p-4 border border-zinc-700/50";
  const inputCls = "w-full text-base px-3 py-2 rounded-lg bg-zinc-700 border border-zinc-600 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <div className="max-w-lg mx-auto">
      {/* Tabs */}
      <div className="flex border-b border-zinc-700 bg-[#27272a] sticky top-14 z-10">
        {(["incoming", "outgoing", "propose", "history"] as Tab[]).map((t) => (
          <button key={t} onClick={() => switchTab(t)}
            className={`flex-1 py-3 text-xs font-medium capitalize transition-colors border-b-2 -mb-px relative ${
              tab === t ? "border-blue-400 text-blue-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "incoming" && incoming.length > 0 && (
              <span className="absolute top-1.5 right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold leading-none">
                {incoming.length}
              </span>
            )}
            {t}
          </button>
        ))}
      </div>

      {error && <div className="mx-4 mt-4 bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}
      {success && <div className="mx-4 mt-4 bg-green-900/30 border border-green-700 text-green-400 text-sm rounded-xl px-4 py-3">{success}</div>}

      {/* INCOMING */}
      {tab === "incoming" && (
        <div className="px-4 py-5 space-y-3">
          {incoming.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <ArrowLeftRight size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No incoming proposals</p>
            </div>
          ) : incoming.map((trade) => (
            <TradeCard key={trade.id} trade={trade} userId={userId} stickerMap={stickerMap}
              onAction={updateTradeStatus} loadingId={loadingId} />
          ))}
        </div>
      )}

      {/* OUTGOING */}
      {tab === "outgoing" && (
        <div className="px-4 py-5 space-y-3">
          {outgoing.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <ArrowLeftRight size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No pending proposals</p>
              <button onClick={() => switchTab("propose")} className="mt-3 text-xs text-blue-400 hover:text-blue-300">
                Propose a trade →
              </button>
            </div>
          ) : outgoing.map((trade) => (
            <TradeCard key={trade.id} trade={trade} userId={userId} stickerMap={stickerMap}
              onAction={updateTradeStatus} loadingId={loadingId} />
          ))}
        </div>
      )}

      {/* PROPOSE */}
      {tab === "propose" && (
        <div className="px-4 py-5 space-y-4">
          {profiles.length === 0 ? (
            <div className={`${cardCls} text-center py-8`}>
              <p className="text-sm text-zinc-400">No friends to trade with yet.</p>
            </div>
          ) : (
            <>
              {/* Friend selector */}
              <div className={cardCls}>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Trade with</label>
                <select value={receiverId} onChange={(e) => { setReceiverId(e.target.value); setOfferedStickers([]); setWantedStickers([]); }}
                  className={inputCls}>
                  <option value="">— Select a friend —</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>

              {receiverId && (
                <>
                  {/* Smart suggestions */}
                  {(smartIOffer.length > 0 || smartTheyOffer.length > 0) && (
                    <div className={cardCls}>
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={13} className="text-amber-400" />
                        <p className="text-xs font-semibold text-amber-400">Smart matches</p>
                        <p className="text-xs text-zinc-500 ml-auto">tap to select</p>
                      </div>

                      {/* What I can offer them */}
                      {smartIOffer.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">
                            Your dupes they might need
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {smartIOffer.map((d) => {
                              const raw = d.variant !== "standard" ? `${d.sticker_id}-${d.variant.toUpperCase()}` : d.sticker_id;
                              const selected = offeredStickers.includes(raw);
                              return (
                                <button key={raw} onClick={() => toggleOffered(raw)}
                                  className={`font-mono text-xs px-2 py-1 rounded-lg border font-bold transition-all ${
                                    selected
                                      ? "bg-blue-600 border-blue-500 text-white"
                                      : "bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-blue-500"
                                  }`}
                                >
                                  {raw}
                                  {selected && " ✓"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* What they can offer me */}
                      {smartTheyOffer.length > 0 && (
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">
                            Their dupes you need
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {smartTheyOffer.map((d) => {
                              const raw = d.variant !== "standard" ? `${d.sticker_id}-${d.variant.toUpperCase()}` : d.sticker_id;
                              const selected = wantedStickers.includes(raw);
                              return (
                                <button key={raw} onClick={() => toggleWanted(raw)}
                                  className={`font-mono text-xs px-2 py-1 rounded-lg border font-bold transition-all ${
                                    selected
                                      ? "bg-green-700 border-green-500 text-white"
                                      : "bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-green-500"
                                  }`}
                                >
                                  {raw}
                                  {selected && " ✓"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual add */}
                  <div className={cardCls}>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Manual add</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-zinc-500 mb-1">I offer</p>
                        <div className="flex gap-1.5">
                          <input type="text" value={manualOffered}
                            onChange={(e) => setManualOffered(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === "Enter" && addManualOffered()}
                            placeholder="ARG17" spellCheck={false} autoCorrect="off" autoCapitalize="characters"
                            className="flex-1 min-w-0 text-base px-2 py-1.5 rounded-lg bg-zinc-700 border border-zinc-600 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                          />
                          <button onClick={addManualOffered} className="bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg px-2 py-1.5">
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 mb-1">I want</p>
                        <div className="flex gap-1.5">
                          <input type="text" value={manualWanted}
                            onChange={(e) => setManualWanted(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === "Enter" && addManualWanted()}
                            placeholder="MEX7" spellCheck={false} autoCorrect="off" autoCapitalize="characters"
                            className="flex-1 min-w-0 text-base px-2 py-1.5 rounded-lg bg-zinc-700 border border-zinc-600 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-green-500 font-mono text-xs"
                          />
                          <button onClick={addManualWanted} className="bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg px-2 py-1.5">
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Trade summary */}
                  {(offeredStickers.length > 0 || wantedStickers.length > 0) && (
                    <div className={cardCls}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-zinc-300">Trade summary</p>
                        {offeredStickers.length === wantedStickers.length && offeredStickers.length > 0 ? (
                          <span className="text-xs text-green-400 font-semibold">
                            {offeredStickers.length} for {wantedStickers.length} ✓
                          </span>
                        ) : (
                          <span className="text-xs text-amber-400">
                            {offeredStickers.length} offered · {wantedStickers.length} wanted
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1.5">You offer</p>
                          <div className="flex flex-wrap gap-1">
                            {offeredStickers.length === 0
                              ? <p className="text-xs text-zinc-600 italic">Nothing yet</p>
                              : offeredStickers.map((s) => (
                                <StickerPill key={s} raw={s} stickerMap={stickerMap}
                                  onRemove={() => setOfferedStickers((p) => p.filter((x) => x !== s))} />
                              ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1.5">You want</p>
                          <div className="flex flex-wrap gap-1">
                            {wantedStickers.length === 0
                              ? <p className="text-xs text-zinc-600 italic">Nothing yet</p>
                              : wantedStickers.map((s) => (
                                <StickerPill key={s} raw={s} stickerMap={stickerMap}
                                  onRemove={() => setWantedStickers((p) => p.filter((x) => x !== s))} />
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div className={cardCls}>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                      Notes <span className="text-zinc-600 normal-case font-normal">(optional)</span>
                    </label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any context for your friend…" rows={2}
                      className={`${inputCls} resize-none`} />
                  </div>

                  {proposeError && (
                    <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-xl px-4 py-3">
                      {proposeError}
                    </div>
                  )}

                  <button onClick={proposeTrade} disabled={proposing || offeredStickers.length === 0 || wantedStickers.length === 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {proposing
                      ? <><Loader2 size={16} className="animate-spin" /> Proposing…</>
                      : <><ArrowLeftRight size={16} /> Propose trade{offeredStickers.length > 1 ? ` (${offeredStickers.length} stickers each)` : ""}</>
                    }
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* HISTORY */}
      {tab === "history" && (
        <div className="px-4 py-5 space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <Clock size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No trade history yet</p>
            </div>
          ) : history.map((trade) => (
            <TradeCard key={trade.id} trade={trade} userId={userId} stickerMap={stickerMap}
              onAction={updateTradeStatus} loadingId={loadingId} />
          ))}
        </div>
      )}
    </div>
  );
}
