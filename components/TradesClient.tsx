"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trade, Profile, TradeStatus, parseStickerRef } from "@/lib/types";
import { ArrowLeftRight, Check, X, Loader2, Clock } from "lucide-react";

interface Duplicate {
  sticker_id: string;
  variant: string;
  quantity: number;
  description: string;
  team_code: string;
  is_foil: boolean;
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
}

type Tab = "incoming" | "outgoing" | "propose" | "history";

function StickerChip({
  raw,
  stickerMap,
}: {
  raw: string;
  stickerMap: Map<string, string>;
}) {
  const ref = parseStickerRef(raw);
  const desc = stickerMap.get(ref.id);
  const variantColors: Record<string, string> = {
    standard: "bg-zinc-700 border-zinc-600 text-zinc-200",
    orange: "bg-orange-100 border-orange-400 text-orange-900",
    blue: "bg-blue-100 border-blue-400 text-blue-900",
    other: "bg-purple-100 border-purple-400 text-purple-900",
  };
  const cls = variantColors[ref.variant] ?? variantColors.standard;
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${cls}`}>
      <p className="font-mono text-xs font-bold">{raw}</p>
      {desc && <p className="text-xs opacity-70 truncate">{desc}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: TradeStatus }) {
  const styles: Record<TradeStatus, string> = {
    pending: "bg-amber-900/40 text-amber-400",
    accepted: "bg-blue-900/40 text-blue-400",
    completed: "bg-green-900/40 text-green-400",
    declined: "bg-zinc-700 text-zinc-400",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function TradesClient({
  userId,
  profiles,
  trades: initialTrades,
  duplicates,
  stickers,
}: Props) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("incoming");
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [receiverId, setReceiverId] = useState("");
  const [offeredInput, setOfferedInput] = useState("");
  const [wantedInput, setWantedInput] = useState("");
  const [notes, setNotes] = useState("");
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  const stickerMap = useMemo(
    () => new Map(stickers.map((s) => [s.id, s.description])),
    [stickers]
  );
  const stickerIds = useMemo(() => new Set(stickers.map((s) => s.id)), [stickers]);
  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.display_name])),
    [profiles]
  );

  function isValidSticker(raw: string): boolean {
    if (!raw.trim()) return false;
    return stickerIds.has(parseStickerRef(raw.trim()).id);
  }

  function getStickerLabel(raw: string): string {
    const ref = parseStickerRef(raw);
    const desc = stickerMap.get(ref.id);
    return desc ? `${raw} — ${desc}` : raw;
  }

  const enrichedTrades: EnrichedTrade[] = useMemo(
    () =>
      trades.map((t) => ({
        ...t,
        offerer_name:
          t.offerer_id === userId ? "You" : (profileMap.get(t.offerer_id) ?? "Unknown"),
        receiver_name:
          t.receiver_id === userId ? "You" : (profileMap.get(t.receiver_id) ?? "Unknown"),
      })),
    [trades, profileMap, userId]
  );

  const incoming = enrichedTrades.filter(
    (t) => t.receiver_id === userId && t.status === "pending"
  );
  const outgoing = enrichedTrades.filter(
    (t) => t.offerer_id === userId && t.status === "pending"
  );
  const history = enrichedTrades
    .filter((t) => t.status !== "pending")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  function switchTab(t: Tab) {
    setTab(t);
    setError(null);
    setSuccess(null);
  }

  async function updateTradeStatus(id: string, status: TradeStatus) {
    setLoadingId(id);
    setError(null);
    const { error: err } = await supabase.from("trades").update({ status }).eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    }
    setLoadingId(null);
  }

  async function proposeTrade() {
    setProposeError(null);
    if (!receiverId) { setProposeError("Select a friend."); return; }
    const offeredNorm = offeredInput.trim().toUpperCase();
    const wantedNorm = wantedInput.trim().toUpperCase();
    if (!isValidSticker(offeredNorm)) { setProposeError("Invalid offered sticker ID."); return; }
    if (!isValidSticker(wantedNorm)) { setProposeError("Invalid wanted sticker ID."); return; }
    setProposing(true);
    const { data, error: err } = await supabase
      .from("trades")
      .insert({
        offerer_id: userId,
        receiver_id: receiverId,
        offered_sticker: offeredNorm,
        wanted_sticker: wantedNorm,
        notes: notes.trim() || null,
      })
      .select()
      .single();
    if (err) {
      setProposeError(err.message);
    } else {
      setTrades((prev) => [data, ...prev]);
      setReceiverId("");
      setOfferedInput("");
      setWantedInput("");
      setNotes("");
      setSuccess("Trade proposed!");
      switchTab("outgoing");
    }
    setProposing(false);
  }

  const cardCls = "bg-[#27272a] rounded-xl p-4";
  const inputCls =
    "w-full text-sm px-3 py-2 rounded-lg bg-zinc-700 border border-zinc-600 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <div className="max-w-lg mx-auto">
      {/* Tabs */}
      <div className="flex border-b border-zinc-700 bg-[#27272a] sticky top-14 z-10">
        {(["incoming", "outgoing", "propose", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`flex-1 py-3 text-xs font-medium capitalize transition-colors border-b-2 -mb-px relative ${
              tab === t
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
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

      {error && (
        <div className="mx-4 mt-4 bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}
      {success && (
        <div className="mx-4 mt-4 bg-green-900/30 border border-green-700 text-green-400 text-sm rounded-xl px-4 py-3">
          {success}
        </div>
      )}

      {/* ── INCOMING ── */}
      {tab === "incoming" && (
        <div className="px-4 py-5 space-y-3">
          {incoming.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <ArrowLeftRight size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No incoming proposals</p>
            </div>
          ) : (
            incoming.map((trade) => (
              <div key={trade.id} className={cardCls}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">
                      {trade.offerer_name} proposes a trade
                    </p>
                    <p className="text-xs text-zinc-500">
                      {new Date(trade.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={trade.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">They offer</p>
                    <StickerChip raw={trade.offered_sticker} stickerMap={stickerMap} />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">They want</p>
                    <StickerChip raw={trade.wanted_sticker} stickerMap={stickerMap} />
                  </div>
                </div>
                {trade.notes && (
                  <p className="text-xs text-zinc-400 italic mb-3">"{trade.notes}"</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => updateTradeStatus(trade.id, "accepted")}
                    disabled={loadingId === trade.id}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                  >
                    {loadingId === trade.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}{" "}
                    Accept
                  </button>
                  <button
                    onClick={() => updateTradeStatus(trade.id, "declined")}
                    disabled={loadingId === trade.id}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 text-xs font-semibold py-2 rounded-lg transition-colors"
                  >
                    <X size={13} /> Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── OUTGOING ── */}
      {tab === "outgoing" && (
        <div className="px-4 py-5 space-y-3">
          {outgoing.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <ArrowLeftRight size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No pending proposals</p>
              <button
                onClick={() => switchTab("propose")}
                className="mt-3 text-xs text-blue-400 hover:text-blue-300"
              >
                Propose a trade →
              </button>
            </div>
          ) : (
            outgoing.map((trade) => (
              <div key={trade.id} className={cardCls}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">To {trade.receiver_name}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(trade.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={trade.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">You offer</p>
                    <StickerChip raw={trade.offered_sticker} stickerMap={stickerMap} />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">You want</p>
                    <StickerChip raw={trade.wanted_sticker} stickerMap={stickerMap} />
                  </div>
                </div>
                {trade.notes && (
                  <p className="text-xs text-zinc-400 italic mb-3">"{trade.notes}"</p>
                )}
                <button
                  onClick={() => updateTradeStatus(trade.id, "declined")}
                  disabled={loadingId === trade.id}
                  className="w-full flex items-center justify-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-300 text-xs font-semibold py-2 rounded-lg transition-colors"
                >
                  {loadingId === trade.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <X size={13} />
                  )}{" "}
                  Cancel proposal
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── PROPOSE ── */}
      {tab === "propose" && (
        <div className="px-4 py-5 space-y-4">
          {profiles.length === 0 ? (
            <div className={`${cardCls} text-center py-8`}>
              <p className="text-sm text-zinc-400">No friends to trade with.</p>
              <p className="text-xs text-zinc-600 mt-1">
                Profiles are created automatically when accounts are added.
              </p>
            </div>
          ) : (
            <>
              <div className={cardCls}>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  Trade with
                </label>
                <select
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Select friend —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={cardCls}>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  You offer
                </label>
                <input
                  type="text"
                  value={offeredInput}
                  onChange={(e) => setOfferedInput(e.target.value.toUpperCase())}
                  placeholder="e.g. ARG17 or ARG2-ORANGE"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="characters"
                  className={`${inputCls} font-mono mb-2 ${
                    offeredInput
                      ? isValidSticker(offeredInput)
                        ? "border-green-500 focus:ring-green-500"
                        : "border-red-500 focus:ring-red-500"
                      : ""
                  }`}
                />
                {offeredInput && isValidSticker(offeredInput) && (
                  <p className="text-xs text-zinc-400 mb-2">{getStickerLabel(offeredInput)}</p>
                )}
                {duplicates.length > 0 && (
                  <>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1.5">
                      Your duplicates — tap to select
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {duplicates.map((d) => {
                        const raw =
                          d.variant === "standard"
                            ? d.sticker_id
                            : `${d.sticker_id}-${d.variant.toUpperCase()}`;
                        const selected = offeredInput === raw;
                        const variantCls =
                          d.variant === "orange"
                            ? "bg-orange-100 border-orange-400 text-orange-900"
                            : d.variant === "blue"
                            ? "bg-blue-100 border-blue-400 text-blue-900"
                            : d.variant === "other"
                            ? "bg-purple-100 border-purple-400 text-purple-900"
                            : "bg-zinc-700 border-zinc-600 text-zinc-200";
                        return (
                          <button
                            key={`${d.sticker_id}-${d.variant}`}
                            onClick={() => setOfferedInput(raw)}
                            className={`font-mono text-xs border rounded px-1.5 py-0.5 transition-all ${variantCls} ${
                              selected
                                ? "ring-2 ring-blue-400 ring-offset-1 ring-offset-[#27272a]"
                                : "hover:opacity-80"
                            }`}
                          >
                            {raw} ×{d.quantity - 1}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className={cardCls}>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  You want
                </label>
                <input
                  type="text"
                  value={wantedInput}
                  onChange={(e) => setWantedInput(e.target.value.toUpperCase())}
                  placeholder="e.g. ESP15 or BRA8-BLUE"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="characters"
                  className={`${inputCls} font-mono mb-1 ${
                    wantedInput
                      ? isValidSticker(wantedInput)
                        ? "border-green-500 focus:ring-green-500"
                        : "border-red-500 focus:ring-red-500"
                      : ""
                  }`}
                />
                {wantedInput && isValidSticker(wantedInput) && (
                  <p className="text-xs text-zinc-400">{getStickerLabel(wantedInput)}</p>
                )}
              </div>

              <div className={cardCls}>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  Notes{" "}
                  <span className="text-zinc-600 normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any context for your friend…"
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              </div>

              {proposeError && (
                <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-xl px-4 py-3">
                  {proposeError}
                </div>
              )}

              <button
                onClick={proposeTrade}
                disabled={proposing}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-blue-400 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                {proposing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Proposing…
                  </>
                ) : (
                  <>
                    <ArrowLeftRight size={16} /> Propose trade
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── HISTORY ── */}
      {tab === "history" && (
        <div className="px-4 py-5 space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <Clock size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No trade history yet</p>
            </div>
          ) : (
            history.map((trade) => {
              const isOfferer = trade.offerer_id === userId;
              const counterparty = isOfferer ? trade.receiver_name : trade.offerer_name;
              return (
                <div key={trade.id} className={cardCls}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">
                        {isOfferer ? `To ${counterparty}` : `From ${counterparty}`}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(trade.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge status={trade.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
                        {isOfferer ? "You offered" : "They offered"}
                      </p>
                      <StickerChip raw={trade.offered_sticker} stickerMap={stickerMap} />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
                        {isOfferer ? "You wanted" : "They wanted"}
                      </p>
                      <StickerChip raw={trade.wanted_sticker} stickerMap={stickerMap} />
                    </div>
                  </div>
                  {trade.notes && (
                    <p className="text-xs text-zinc-400 italic mt-2">"{trade.notes}"</p>
                  )}
                  {trade.status === "accepted" && (
                    <button
                      onClick={() => updateTradeStatus(trade.id, "completed")}
                      disabled={loadingId === trade.id}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 bg-green-800 hover:bg-green-700 disabled:opacity-50 text-green-200 text-xs font-semibold py-2 rounded-lg transition-colors"
                    >
                      {loadingId === trade.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}{" "}
                      Mark as completed
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
