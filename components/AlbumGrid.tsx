"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Team, Sticker, Variant } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { X, Plus, Minus, Loader2, Copy, Check } from "lucide-react";

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

type FilterMode = "all" | "missing" | "duplicates";

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
  rows: CollectionRow[];
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
  const [filter, setFilter] = useState<FilterMode>("all");
  const [collection, setCollection] = useState<CollectionRow[]>(initialCollection);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

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

  // Filter stickers for a team based on current filter mode
  const getFilteredStickers = useCallback((teamCode: string) => {
    const ts = stickers
      .filter((s) => s.team_code === teamCode)
      .sort((a, b) => a.number - b.number);

    if (filter === "missing") return ts.filter((s) => !owned.has(s.id));
    if (filter === "duplicates") return ts.filter((s) => {
      const rows = owned.get(s.id) ?? [];
      return rows.reduce((sum, r) => sum + r.quantity, 0) > 1;
    });
    return ts;
  }, [stickers, owned, filter]);

  // Sidebar count based on filter
  const getSidebarCount = useCallback((teamCode: string) => {
    const ts = stickers.filter((s) => s.team_code === teamCode);
    if (filter === "missing") {
      const missing = ts.filter((s) => !owned.has(s.id)).length;
      return { count: missing, label: `${missing}`, sub: "miss" };
    }
    if (filter === "duplicates") {
      const dupes = ts.filter((s) => {
        const rows = owned.get(s.id) ?? [];
        return rows.reduce((sum, r) => sum + r.quantity, 0) > 1;
      }).length;
      return { count: dupes, label: `${dupes}`, sub: "dupe" };
    }
    const collected = ts.filter((s) => owned.has(s.id)).length;
    return { count: collected, label: `${collected}/${ts.length}`, sub: "" };
  }, [stickers, owned, filter]);

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

  // Copy missing IDs for current active team to clipboard
  async function copyMissingIds() {
    const teamStickers = stickers.filter((s) => s.team_code === activeTeam).sort((a, b) => a.number - b.number);
    const missing = teamStickers.filter((s) => !owned.has(s.id)).map((s) => s.id);
    if (missing.length === 0) return;
    await navigator.clipboard.writeText(missing.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openModal(sticker: Sticker) {
    const rows = owned.get(sticker.id) ?? [];
    setModal({ sticker, rows: [...rows] });
    setModalError(null);
  }

  function closeModal() {
    setModal(null);
    setModalError(null);
  }

  function getModalQty(variant: Variant): number {
    return modal?.rows.find((r) => r.variant === variant)?.quantity ?? 0;
  }

  function adjustQty(variant: Variant, delta: number) {
    if (!modal) return;
    const current = getModalQty(variant);
    const next = Math.max(0, current + delta);
    const existing = modal.rows.find((r) => r.variant === variant);
    let newRows: CollectionRow[];
    if (next === 0) {
      newRows = modal.rows.filter((r) => r.variant !== variant);
    } else if (existing) {
      newRows = modal.rows.map((r) => r.variant === variant ? { ...r, quantity: next } : r);
    } else {
      newRows = [...modal.rows, { sticker_id: modal.sticker.id, variant, quantity: next }];
    }
    setModal({ ...modal, rows: newRows });
  }

  async function saveModal() {
    if (!modal) return;
    setSaving(true);
    setModalError(null);
    const stickerId = modal.sticker.id;
    const originalRows = owned.get(stickerId) ?? [];
    try {
      for (const v of VARIANTS) {
        const newQty = modal.rows.find((r) => r.variant === v.value)?.quantity ?? 0;
        const origRow = originalRows.find((r) => r.variant === v.value);
        const origQty = origRow?.quantity ?? 0;
        if (newQty === origQty) continue;
        if (newQty === 0 && origRow) {
          const { error } = await supabase.from("collections").delete()
            .eq("user_id", userId).eq("sticker_id", stickerId).eq("variant", v.value);
          if (error) throw error;
        } else if (newQty > 0 && !origRow) {
          const { error } = await supabase.from("collections")
            .insert({ user_id: userId, sticker_id: stickerId, variant: v.value, quantity: newQty });
          if (error) throw error;
        } else if (newQty > 0 && origRow) {
          const { error } = await supabase.from("collections").update({ quantity: newQty })
            .eq("user_id", userId).eq("sticker_id", stickerId).eq("variant", v.value);
          if (error) throw error;
        }
      }
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

  const FILTER_OPTIONS: { mode: FilterMode; label: string; activeColor: string }[] = [
    { mode: "all",        label: "All",        activeColor: "#3b82f6" },
    { mode: "missing",    label: "Missing",    activeColor: "#f87171" },
    { mode: "duplicates", label: "Duplicates", activeColor: "#f59e0b" },
  ];

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 7.5rem)" }}>

        {/* Search + Filter bar */}
        <div style={{ background: "#27272a", borderBottom: "1px solid #3f3f46", padding: "8px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <input
            type="text"
            placeholder="Jump to team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", fontSize: "16px",
              borderRadius: "8px", border: "none", background: "#3f3f46",
              color: "#fafafa", outline: "none", boxSizing: "border-box",
            }}
          />

          {/* Filter pills */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {FILTER_OPTIONS.map(({ mode, label, activeColor }) => (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                style={{
                  padding: "5px 14px", borderRadius: "99px", fontSize: "12px", fontWeight: 600,
                  border: `1px solid ${filter === mode ? activeColor : "#3f3f46"}`,
                  background: filter === mode ? `${activeColor}20` : "transparent",
                  color: filter === mode ? activeColor : "#71717a",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}

            {/* Copy missing button — only shown in missing mode */}
            {filter === "missing" && (
              <button
                onClick={copyMissingIds}
                style={{
                  marginLeft: "auto", padding: "5px 10px", borderRadius: "99px",
                  fontSize: "11px", fontWeight: 600, border: "1px solid #3f3f46",
                  background: copied ? "#052e16" : "transparent",
                  color: copied ? "#4ade80" : "#71717a",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                  transition: "all 0.15s",
                }}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? "Copied!" : "Copy IDs"}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* Sidebar */}
          <div
            ref={sidebarRef}
            style={{ width: "64px", flexShrink: 0, overflowY: "auto", background: "#27272a", borderRight: "1px solid #3f3f46" }}
          >
            {filteredTeams.map((team) => {
              const { label, sub } = getSidebarCount(team.code);
              const ts = stickers.filter((s) => s.team_code === team.code);
              const tc = ts.filter((s) => owned.has(s.id)).length;
              const isComplete = tc === ts.length && ts.length > 0;
              const active = activeTeam === team.code;
              const isFWC = team.code === "FWC";

              // Sidebar indicator color based on filter
              const dotColor = filter === "missing"
                ? "#f87171"
                : filter === "duplicates"
                ? "#f59e0b"
                : isComplete ? "#4ade80" : "#52525b";

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
                  <p style={{ fontSize: "10px", marginTop: "2px", color: dotColor }}>
                    {label}
                  </p>
                  {sub && (
                    <p style={{ fontSize: "9px", color: "#52525b", marginTop: "1px" }}>{sub}</p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sticker scroll area */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0 0 16px" }}>
            {sortedTeams.map((team) => {
              const allTeamStickers = stickers.filter((s) => s.team_code === team.code).sort((a, b) => a.number - b.number);
              const filteredStickers = getFilteredStickers(team.code);
              const teamCollected = allTeamStickers.filter((s) => owned.has(s.id)).length;
              const pct = allTeamStickers.length > 0 ? Math.round(teamCollected / allTeamStickers.length * 100) : 0;

              // In filtered modes, hide teams with no matching stickers
              if (filter !== "all" && filteredStickers.length === 0) return null;

              // Sub-label changes per filter
              const subLabel = filter === "missing"
                ? `${filteredStickers.length} missing`
                : filter === "duplicates"
                ? `${filteredStickers.length} duplicates`
                : `${teamCollected}/${allTeamStickers.length} collected`;

              return (
                <div key={team.code} id={`team-${team.code}`} style={{ padding: "12px 10px 4px" }}>
                  {/* Team header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: "14px", color: "#f4f4f5" }}>{team.name}</p>
                      <p style={{ fontSize: "11px", color: "#71717a", marginTop: "1px" }}>
                        {subLabel}{team.group ? ` · Group ${team.group}` : ""}
                      </p>
                    </div>
                    <span style={{ fontSize: "15px", fontWeight: 700, color: pct === 100 ? "#4ade80" : "#60a5fa" }}>{pct}%</span>
                  </div>

                  {/* Progress bar — always shows overall progress regardless of filter */}
                  <div style={{ width: "100%", height: "3px", background: "#3f3f46", borderRadius: "99px", marginBottom: "8px" }}>
                    <div style={{ height: "3px", borderRadius: "99px", width: `${pct}%`, background: pct === 100 ? "#4ade80" : "#3b82f6" }} />
                  </div>

                  {/* Sticker grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                    {filteredStickers.map((sticker) => {
                      const ownedRows = owned.get(sticker.id) ?? [];
                      const isOwned = ownedRows.length > 0;
                      const totalQty = ownedRows.reduce((s, r) => s + r.quantity, 0);
                      const hasDupe = totalQty > 1;

                      // In missing mode flip opacity — missing = full, owned = faded
                      const opacity = filter === "missing"
                        ? 1  // only missing shown, all full opacity
                        : isOwned ? 1 : 0.4;

                      // Card accent color per filter
                      const borderColor = filter === "missing"
                        ? "#991b1b"
                        : filter === "duplicates"
                        ? "#d97706"
                        : sticker.is_foil
                          ? isOwned ? "#d97706" : "#78350f"
                          : isOwned ? "#1d4ed8" : "#3f3f46";

                      const bgColor = filter === "missing"
                        ? "#450a0a"
                        : filter === "duplicates"
                        ? "#451a03"
                        : sticker.is_foil
                          ? isOwned ? "linear-gradient(135deg,#451a03,#78350f,#451a03)" : "linear-gradient(135deg,#1c1208,#2d1f08)"
                          : isOwned ? "#1e3a5f" : "#27272a";

                      const textColor = filter === "missing"
                        ? "#f87171"
                        : filter === "duplicates"
                        ? "#fbbf24"
                        : sticker.is_foil
                          ? isOwned ? "#fcd34d" : "#78350f"
                          : isOwned ? "#93c5fd" : "#52525b";

                      return (
                        <div
                          key={sticker.id}
                          onClick={() => openModal(sticker)}
                          style={{
                            position: "relative", borderRadius: "10px",
                            border: `1.5px solid ${borderColor}`,
                            background: bgColor,
                            opacity,
                            padding: "10px 4px 8px", textAlign: "center",
                            minHeight: "60px", display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center", gap: "3px",
                            cursor: "pointer", transition: "opacity 0.15s, border-color 0.15s",
                          }}
                        >
                          {hasDupe && filter !== "missing" && (
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
                          {/* Foil dot */}
                          {sticker.is_foil && (
                            <div style={{
                              position: "absolute", top: "3px", left: "3px",
                              background: "linear-gradient(135deg,#fde68a,#fbbf24)",
                              borderRadius: "4px", width: "8px", height: "8px",
                            }} />
                          )}
                          <p style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "12px", color: textColor, lineHeight: 1 }}>
                            {sticker.id}
                          </p>
                          {isOwned && filter !== "missing" && (
                            <div style={{ width: "5px", height: "5px", borderRadius: "99px", background: hasDupe ? "#d97706" : "#3b82f6" }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Empty state for filtered views */}
            {filter !== "all" && sortedTeams.every((t) => getFilteredStickers(t.code).length === 0) && (
              <div style={{ padding: "60px 16px", textAlign: "center" }}>
                <p style={{ fontSize: "32px", marginBottom: "12px" }}>
                  {filter === "missing" ? "🎉" : "🔄"}
                </p>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f4f4f5" }}>
                  {filter === "missing" ? "Album complete!" : "No duplicates yet"}
                </p>
                <p style={{ fontSize: "13px", color: "#71717a", marginTop: "6px" }}>
                  {filter === "missing" ? "You have every sticker" : "Open more packs to get duplicates for trading"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL */}
      {modal && (
        <div
          onClick={closeModal}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#27272a",
              borderRadius: "20px 20px 0 0",
              width: "100%",
              maxWidth: "480px",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "20px 20px 88px", /* 88px = nav height (64px) + extra breathing room */
              border: "1px solid #3f3f46",
            }}
          >
            <div style={{ width: "40px", height: "4px", background: "#52525b", borderRadius: "99px", margin: "0 auto 16px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <p style={{ fontFamily: "monospace", fontSize: "20px", fontWeight: 700, color: "#f4f4f5" }}>
                  {modal.sticker.id}
                  {modal.sticker.is_foil && (
                    <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: 700, background: "linear-gradient(135deg,#fde68a,#f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
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

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              {VARIANTS.map((v) => {
                const qty = getModalQty(v.value);
                return (
                  <div key={v.value} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: qty > 0 ? "#18181b" : "transparent",
                    border: qty > 0 ? `1px solid ${v.color}40` : "1px solid #3f3f46",
                    borderRadius: "10px", padding: "10px 12px", transition: "background 0.15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "99px", background: v.color, flexShrink: 0 }} />
                      <span style={{ fontSize: "13px", fontWeight: 500, color: qty > 0 ? "#f4f4f5" : "#71717a" }}>{v.label}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <button onClick={() => adjustQty(v.value, -1)} disabled={qty === 0}
                        style={{ width: "28px", height: "28px", borderRadius: "99px", background: qty > 0 ? "#3f3f46" : "transparent", border: "1px solid #52525b", color: qty > 0 ? "#f4f4f5" : "#3f3f46", display: "flex", alignItems: "center", justifyContent: "center", cursor: qty > 0 ? "pointer" : "not-allowed" }}>
                        <Minus size={12} />
                      </button>
                      <span style={{ fontSize: "15px", fontWeight: 700, color: qty > 0 ? "#f4f4f5" : "#52525b", minWidth: "16px", textAlign: "center" }}>{qty}</span>
                      <button onClick={() => adjustQty(v.value, 1)}
                        style={{ width: "28px", height: "28px", borderRadius: "99px", background: "#3b82f6", border: "none", color: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={{ fontSize: "12px", color: "#71717a", marginBottom: "12px", textAlign: "center" }}>
              {(() => {
                const total = modal.rows.reduce((s, r) => s + r.quantity, 0);
                if (total === 0) return "Not collected";
                const dupes = total - 1;
                return dupes > 0 ? `${total} copies · ${dupes} duplicate${dupes > 1 ? "s" : ""}` : "1 copy · no duplicates";
              })()}
            </p>

            {modalError && <p style={{ fontSize: "12px", color: "#f87171", marginBottom: "12px", textAlign: "center" }}>{modalError}</p>}

            <button onClick={saveModal} disabled={saving}
              style={{ width: "100%", padding: "14px", background: saving ? "#1d4ed8" : "#2563eb", border: "none", borderRadius: "12px", color: "white", fontSize: "14px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
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
