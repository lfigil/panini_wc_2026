"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Team, Sticker, Variant, parseStickerRef } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { X, Plus, Minus, Loader2 } from "lucide-react";

interface CollectionRow {
  sticker_id: string;
  variant: Variant;
  quantity: number;
}

interface Props {
  userId: string;
  teams: Team[];
  stickers: Sticker[];
  collection: CollectionRow[];
}

// All supported variants
const VARIANTS: { value: Variant; label: string; color: string }[] = [
  { value: "standard", label: "Standard", color: "#3b82f6" },
  { value: "orange",   label: "Orange",   color: "#f97316" },
  { value: "blue",     label: "Blue",     color: "#60a5fa" },
  { value: "red",      label: "Red",      color: "#ef4444" },
  { value: "green",    label: "Green",    color: "#22c55e" },
  { value: "purple",   label: "Purple",   color: "#a855f7" },
  { value: "black",    label: "Black",    color: "#d4d4d8" },
];

interface ModalState {
  sticker: Sticker;
  rows: CollectionRow[]; // current collection rows for this sticker
}

export default function AlbumGrid({ userId, teams, stickers, collection: initialCollection }: Props) {
  const supabase = createClient();

  const sortedTeams = useMemo(() => {
    const fwc = teams.filter((t) => t.code === "FWC");
    const rest = teams.filter((t) => t.code !== "FWC").sort((a, b) => a.code.localeCompare(b.code));
    return [...fwc, ...rest];
  }, [teams]);

  const [activeTeam, setActiveTeam] = useState<string>(sortedTeams[0]?.code ?? "");
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState<CollectionRow[]>(initialCollection);
  const [modal, setModal] = useState<ModalState | null>(null);
  // Modal state: selected variant + quantity per variant being edited
  const [modalVariant, setModalVariant] = useState<Variant>("standard");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Build owned map from local collection state
  const owned = useMemo(() => {
    const map = new Map<string, CollectionRow[]>();
    for (const row of collection) {
      if (!map.has(row.sticker_id)) map.set(row.sticker_id, []);
      map.get(row.sticker_id)!.push(row);
    }
    return map;
  }, [collection]);

  const filteredTeams = useMemo(() => {
    if (!search) return sortedTeams;
    const q = search.toLowerCase();
    return sortedTeams.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)
    );
  }, [sortedTeams, search]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    function onScroll() {
      const containerTop = container!.getBoundingClientRect().top;
      let current = sortedTeams[0]?.code ?? "";
      for (const team of sortedTeams) {
        const el = document.getElementById(`team-${team.code}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top - containerTop <= 48) current = team.code;
      }
      setActiveTeam(current);
    }
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [sortedTeams]);

  useEffect(() => {
    const btn = sidebarRef.current?.querySelector<HTMLElement>(`[data-team="${activeTeam}"]`);
    btn?.scrollIntoView({ block: "nearest" });
  }, [activeTeam]);

  function scrollToTeam(code: string) {
    document.getElementById(`team-${code}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setSearch("");
  }

  function openModal(sticker: Sticker) {
    const rows = owned.get(sticker.id) ?? [];
    setModal({ sticker, rows: [...rows] });
    setModalVariant("standard");
    setModalError(null);
  }

  function closeModal() {
    setModal(null);
    setModalError(null);
  }

  // Get quantity for a specific variant in the modal
  function getModalQty(variant: Variant): number {
    return modal?.rows.find((r) => r.variant === variant)?.quantity ?? 0;
  }

  // Adjust quantity for a variant in modal state (local only, not saved yet)
  function adjustQty(variant: Variant, delta: number) {
    if (!modal) return;
    const current = getModalQty(variant);
    const next = Math.max(0, current + delta);
    const existing = modal.rows.find((r) => r.variant === variant);

    let newRows: CollectionRow[];
    if (next === 0) {
      // Remove this variant row
      newRows = modal.rows.filter((r) => r.variant !== variant);
    } else if (existing) {
      newRows = modal.rows.map((r) => r.variant === variant ? { ...r, quantity: next } : r);
    } else {
      // Add new variant row
      newRows = [...modal.rows, { sticker_id: modal.sticker.id, variant, quantity: next }];
    }
    setModal({ ...modal, rows: newRows });
  }

  async function saveModal() {
    if (!modal) return;
    setSaving(true);
    setModalError(null);

    const stickerId = modal.sticker.id;

    // Figure out what changed vs original collection
    const originalRows = owned.get(stickerId) ?? [];

    try {
      // Process each variant
      for (const v of VARIANTS) {
        const newQty = modal.rows.find((r) => r.variant === v.value)?.quantity ?? 0;
        const origRow = originalRows.find((r) => r.variant === v.value);
        const origQty = origRow?.quantity ?? 0;

        if (newQty === origQty) continue; // no change

        if (newQty === 0 && origRow) {
          // Delete row
          const { error } = await supabase
            .from("collections")
            .delete()
            .eq("user_id", userId)
            .eq("sticker_id", stickerId)
            .eq("variant", v.value);
          if (error) throw error;
        } else if (newQty > 0 && !origRow) {
          // Insert new row
          const { error } = await supabase
            .from("collections")
            .insert({ user_id: userId, sticker_id: stickerId, variant: v.value, quantity: newQty });
          if (error) throw error;
        } else if (newQty > 0 && origRow) {
          // Update existing row
          const { error } = await supabase
            .from("collections")
            .update({ quantity: newQty })
            .eq("user_id", userId)
            .eq("sticker_id", stickerId)
            .eq("variant", v.value);
          if (error) throw error;
        }
      }

      // Update local collection state
      setCollection((prev) => {
        const without = prev.filter((r) => r.sticker_id !== stickerId);
        return [...without, ...modal.rows];
      });

      closeModal();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 7.5rem)" }}>

        {/* Search */}
        <div style={{ background: "#27272a", borderBottom: "1px solid #3f3f46", padding: "8px 12px" }}>
          <input
            type="text"
            placeholder="Jump to team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", fontSize: "14px",
              borderRadius: "8px", border: "none", background: "#3f3f46",
              color: "#fafafa", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* Sidebar */}
          <div
            ref={sidebarRef}
            style={{ width: "64px", flexShrink: 0, overflowY: "auto", background: "#27272a", borderRight: "1px solid #3f3f46" }}
          >
            {filteredTeams.map((team) => {
              const ts = stickers.filter((s) => s.team_code === team.code);
              const tc = ts.filter((s) => owned.has(s.id)).length;
              const isComplete = tc === ts.length && ts.length > 0;
              const active = activeTeam === team.code;
              const isFWC = team.code === "FWC";
              return (
                <button
                  key={team.code}
                  data-team={team.code}
                  onClick={() => scrollToTeam(team.code)}
                  style={{
                    width: "100%", padding: "10px 4px", textAlign: "center",
                    borderBottom: "1px solid #3f3f46",
                    borderLeft: active ? "3px solid #60a5fa" : "3px solid transparent",
                    background: active ? "#1e3a5f" : isFWC ? "#2d2a1a" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <p style={{ fontSize: "11px", fontWeight: 700, lineHeight: 1, color: active ? "#93c5fd" : isFWC ? "#fcd34d" : "#a1a1aa" }}>
                    {team.code}
                  </p>
                  <p style={{ fontSize: "10px", marginTop: "2px", color: isComplete ? "#4ade80" : "#52525b" }}>
                    {tc}/{ts.length}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Sticker scroll area */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0 0 16px" }}>
            {sortedTeams.map((team) => {
              const teamStickers = stickers.filter((s) => s.team_code === team.code).sort((a, b) => a.number - b.number);
              const teamCollected = teamStickers.filter((s) => owned.has(s.id)).length;
              const pct = teamStickers.length > 0 ? Math.round(teamCollected / teamStickers.length * 100) : 0;

              return (
                <div key={team.code} id={`team-${team.code}`} style={{ padding: "12px 10px 4px" }}>
                  {/* Team header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: "14px", color: "#f4f4f5" }}>{team.name}</p>
                      <p style={{ fontSize: "11px", color: "#71717a", marginTop: "1px" }}>
                        {teamCollected}/{teamStickers.length} collected{team.group ? ` · Group ${team.group}` : ""}
                      </p>
                    </div>
                    <span style={{ fontSize: "15px", fontWeight: 700, color: pct === 100 ? "#4ade80" : "#60a5fa" }}>{pct}%</span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ width: "100%", height: "3px", background: "#3f3f46", borderRadius: "99px", marginBottom: "8px" }}>
                    <div style={{ height: "3px", borderRadius: "99px", width: `${pct}%`, background: pct === 100 ? "#4ade80" : "#3b82f6" }} />
                  </div>

                  {/* Sticker grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                    {teamStickers.map((sticker) => {
                      const ownedRows = owned.get(sticker.id) ?? [];
                      const isOwned = ownedRows.length > 0;
                      const totalQty = ownedRows.reduce((s, r) => s + r.quantity, 0);
                      const hasDupe = totalQty > 1;

                      return (
                        <div
                          key={sticker.id}
                          onClick={() => openModal(sticker)}
                          style={{
                            position: "relative",
                            borderRadius: "10px",
                            border: sticker.is_foil
                              ? isOwned ? "1.5px solid #d97706" : "1.5px solid #78350f"
                              : isOwned ? "1.5px solid #1d4ed8" : "1.5px solid #3f3f46",
                            background: sticker.is_foil
                              ? isOwned ? "linear-gradient(135deg, #451a03, #78350f, #451a03)" : "linear-gradient(135deg, #1c1208, #2d1f08)"
                              : isOwned ? "#1e3a5f" : "#27272a",
                            opacity: isOwned ? 1 : 0.5,
                            padding: "10px 4px 8px",
                            textAlign: "center",
                            minHeight: "60px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "3px",
                            cursor: "pointer",
                            transition: "opacity 0.15s, border-color 0.15s",
                          }}
                        >
                          {hasDupe && (
                            <div style={{
                              position: "absolute", top: "-5px", right: "-5px",
                              background: "#d97706", color: "white",
                              width: "17px", height: "17px", borderRadius: "99px",
                              fontSize: "9px", fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {totalQty}
                            </div>
                          )}
                          <p style={{
                            fontFamily: "monospace", fontWeight: 700, fontSize: "12px",
                            color: sticker.is_foil
                              ? isOwned ? "#fcd34d" : "#78350f"
                              : isOwned ? "#93c5fd" : "#52525b",
                            lineHeight: 1,
                          }}>
                            {sticker.id}
                          </p>
                          {isOwned && (
                            <div style={{ width: "5px", height: "5px", borderRadius: "99px", background: hasDupe ? "#d97706" : "#3b82f6" }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── STICKER MODAL ── */}
      {modal && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#27272a",
              borderRadius: "20px 20px 0 0",
              width: "100%",
              maxWidth: "480px",
              padding: "20px 20px 32px",
              border: "1px solid #3f3f46",
            }}
          >
            {/* Handle */}
            <div style={{ width: "40px", height: "4px", background: "#52525b", borderRadius: "99px", margin: "0 auto 16px" }} />

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <p style={{ fontFamily: "monospace", fontSize: "20px", fontWeight: 700, color: "#f4f4f5" }}>
                  {modal.sticker.id}
                  {modal.sticker.is_foil && (
                    <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: 700, background: "linear-gradient(135deg, #fde68a, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                      FOIL
                    </span>
                  )}
                </p>
                <p style={{ fontSize: "12px", color: "#71717a", marginTop: "2px" }}>{modal.sticker.description}</p>
              </div>
              <button onClick={closeModal} style={{ background: "#3f3f46", border: "none", borderRadius: "99px", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#a1a1aa" }}>
                <X size={14} />
              </button>
            </div>

            {/* Variant rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              {VARIANTS.map((v) => {
                const qty = modal.rows.find((r) => r.variant === v.value)?.quantity ?? 0;
                return (
                  <div key={v.value} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: qty > 0 ? "#18181b" : "transparent",
                    border: qty > 0 ? `1px solid ${v.color}40` : "1px solid #3f3f46",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    transition: "background 0.15s",
                  }}>
                    {/* Variant label */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "99px", background: v.color, flexShrink: 0 }} />
                      <span style={{ fontSize: "13px", fontWeight: 500, color: qty > 0 ? "#f4f4f5" : "#71717a" }}>{v.label}</span>
                    </div>
                    {/* Quantity controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <button
                        onClick={() => adjustQty(v.value, -1)}
                        disabled={qty === 0}
                        style={{
                          width: "28px", height: "28px", borderRadius: "99px",
                          background: qty > 0 ? "#3f3f46" : "transparent",
                          border: "1px solid #52525b",
                          color: qty > 0 ? "#f4f4f5" : "#3f3f46",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: qty > 0 ? "pointer" : "not-allowed",
                        }}
                      >
                        <Minus size={12} />
                      </button>
                      <span style={{ fontSize: "15px", fontWeight: 700, color: qty > 0 ? "#f4f4f5" : "#52525b", minWidth: "16px", textAlign: "center" }}>
                        {qty}
                      </span>
                      <button
                        onClick={() => adjustQty(v.value, 1)}
                        style={{
                          width: "28px", height: "28px", borderRadius: "99px",
                          background: "#3b82f6",
                          border: "none",
                          color: "white",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary line */}
            <p style={{ fontSize: "12px", color: "#71717a", marginBottom: "12px", textAlign: "center" }}>
              {(() => {
                const total = modal.rows.reduce((s, r) => s + r.quantity, 0);
                if (total === 0) return "Not collected";
                const dupes = total - 1;
                return dupes > 0 ? `${total} copies · ${dupes} duplicate${dupes > 1 ? "s" : ""}` : "1 copy · no duplicates";
              })()}
            </p>

            {modalError && (
              <p style={{ fontSize: "12px", color: "#f87171", marginBottom: "12px", textAlign: "center" }}>{modalError}</p>
            )}

            {/* Save button */}
            <button
              onClick={saveModal}
              disabled={saving}
              style={{
                width: "100%", padding: "14px",
                background: saving ? "#1d4ed8" : "#2563eb",
                border: "none", borderRadius: "12px",
                color: "white", fontSize: "14px", fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              }}
            >
              {saving && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
