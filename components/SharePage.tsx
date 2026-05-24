"use client";

import { useState, useMemo } from "react";
import { Copy, Check } from "lucide-react";

interface StickerMeta {
  id: string;
  team_code: string;
  number: number;
  description: string;
  is_foil: boolean;
}

interface DupeRow {
  sticker_id: string;
  variant: string;
  dupes: number;
}

interface Props {
  displayName: string;
  uniqueCollected: number;
  totalStickers: number;
  completionPct: number;
  missingIds: string[];
  duplicates: DupeRow[];
  stickers: StickerMeta[];
}

const VARIANT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  standard: { bg: "#27272a", text: "#d4d4d8", border: "#52525b" },
  orange:   { bg: "#431407", text: "#fb923c", border: "#ea580c" },
  blue:     { bg: "#172554", text: "#60a5fa", border: "#3b82f6" },
  red:      { bg: "#450a0a", text: "#f87171", border: "#ef4444" },
  green:    { bg: "#052e16", text: "#4ade80", border: "#22c55e" },
  purple:   { bg: "#2e1065", text: "#c084fc", border: "#a855f7" },
  black:    { bg: "#09090b", text: "#d4d4d8", border: "#71717a" },
};

type ViewTab = "duplicates" | "missing";

export default function SharePage({
  displayName, uniqueCollected, totalStickers, completionPct,
  missingIds, duplicates, stickers,
}: Props) {
  const [tab, setTab] = useState<ViewTab>("duplicates");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [copied, setCopied] = useState(false);

  const stickerMap = useMemo(
    () => new Map(stickers.map((s) => [s.id, s])),
    [stickers]
  );

  const teams = useMemo(() => {
    const codes = [...new Set(stickers.map((s) => s.team_code))].sort();
    return ["ALL", ...codes];
  }, [stickers]);

  // Group duplicates by team
  const filteredDupes = useMemo(() => {
    return duplicates.filter((d) => {
      if (teamFilter !== "ALL") {
        const sticker = stickerMap.get(d.sticker_id);
        return sticker?.team_code === teamFilter;
      }
      return true;
    }).sort((a, b) => {
      const sa = stickerMap.get(a.sticker_id);
      const sb = stickerMap.get(b.sticker_id);
      if (sa?.team_code !== sb?.team_code) return (sa?.team_code ?? "").localeCompare(sb?.team_code ?? "");
      return (sa?.number ?? 0) - (sb?.number ?? 0);
    });
  }, [duplicates, teamFilter, stickerMap]);

  // Missing stickers filtered by team
  const filteredMissing = useMemo(() => {
    return missingIds.filter((id) => {
      if (teamFilter !== "ALL") return stickerMap.get(id)?.team_code === teamFilter;
      return true;
    }).sort((a, b) => {
      const sa = stickerMap.get(a);
      const sb = stickerMap.get(b);
      if (sa?.team_code !== sb?.team_code) return (sa?.team_code ?? "").localeCompare(sb?.team_code ?? "");
      return (sa?.number ?? 0) - (sb?.number ?? 0);
    });
  }, [missingIds, teamFilter, stickerMap]);

  async function copyList() {
    const list = tab === "duplicates"
      ? filteredDupes.map((d) => d.variant !== "standard" ? `${d.sticker_id}-${d.variant.toUpperCase()}` : d.sticker_id).join(" ")
      : filteredMissing.join(" ");
    await navigator.clipboard.writeText(list);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyFullList() {
    const dupeList = duplicates.map((d) =>
      d.variant !== "standard" ? `${d.sticker_id}-${d.variant.toUpperCase()}` : d.sticker_id
    ).join(" ");
    const missingList = missingIds.join(" ");
    const text = `${displayName}'s WC2026 Album\n\nTO TRADE: ${dupeList || "none"}\n\nI NEED: ${missingList || "none"}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#18181b", color: "#f4f4f5" }}>
      {/* Header */}
      <div style={{ background: "#1c1917", borderBottom: "1px solid #3f3f46", padding: "16px 16px 0" }}>
        <div style={{ maxWidth: "480px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <span style={{ fontSize: "28px" }}>⚽</span>
            <div>
              <p style={{ fontSize: "18px", fontWeight: 700, color: "#f4f4f5" }}>
                {displayName}&apos;s Album
              </p>
              <p style={{ fontSize: "12px", color: "#71717a" }}>Panini WC2026 · Trade list</p>
            </div>
          </div>

          {/* Progress */}
          <div style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "12px", color: "#a1a1aa" }}>
                {uniqueCollected} / {totalStickers} stickers
              </span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#60a5fa" }}>
                {completionPct}%
              </span>
            </div>
            <div style={{ width: "100%", height: "4px", background: "#3f3f46", borderRadius: "99px" }}>
              <div style={{ width: `${completionPct}%`, height: "4px", background: "#3b82f6", borderRadius: "99px" }} />
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "20px", fontWeight: 700, color: "#f59e0b" }}>{duplicates.length}</p>
              <p style={{ fontSize: "10px", color: "#71717a" }}>to trade</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "20px", fontWeight: 700, color: "#f87171" }}>{missingIds.length}</p>
              <p style={{ fontSize: "10px", color: "#71717a" }}>still need</p>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0" }}>
            {(["duplicates", "missing"] as ViewTab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: "10px", fontSize: "13px", fontWeight: 600,
                background: "transparent", border: "none",
                borderBottom: tab === t ? "2px solid #60a5fa" : "2px solid transparent",
                color: tab === t ? "#60a5fa" : "#71717a",
                cursor: "pointer", textTransform: "capitalize",
              }}>
                {t === "duplicates" ? `To trade (${duplicates.length})` : `I need (${missingIds.length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "12px 12px 32px" }}>

        {/* Team filter + copy */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
          <div style={{ flex: 1, overflowX: "auto", display: "flex", gap: "6px" }}>
            {teams.slice(0, 12).map((t) => (
              <button key={t} onClick={() => setTeamFilter(t)} style={{
                padding: "4px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 600,
                border: `1px solid ${teamFilter === t ? "#60a5fa" : "#3f3f46"}`,
                background: teamFilter === t ? "#1e3a5f" : "transparent",
                color: teamFilter === t ? "#60a5fa" : "#71717a",
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={copyList} style={{
            display: "flex", alignItems: "center", gap: "4px",
            padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 600,
            border: "1px solid #3f3f46",
            background: copied ? "#052e16" : "#27272a",
            color: copied ? "#4ade80" : "#a1a1aa",
            cursor: "pointer", flexShrink: 0,
          }}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            Copy
          </button>
        </div>

        {/* Sticker grid */}
        {tab === "duplicates" && (
          filteredDupes.length === 0
            ? <p style={{ textAlign: "center", color: "#52525b", fontSize: "13px", padding: "32px 0" }}>No duplicates yet</p>
            : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {filteredDupes.map((d, i) => {
                  const raw = d.variant !== "standard"
                    ? `${d.sticker_id}-${d.variant.toUpperCase()}`
                    : d.sticker_id;
                  const vs = VARIANT_COLORS[d.variant] ?? VARIANT_COLORS.standard;
                  const sticker = stickerMap.get(d.sticker_id);
                  return (
                    <div key={i} style={{
                      background: vs.bg, border: `1.5px solid ${vs.border}`,
                      borderRadius: "8px", padding: "6px 8px", position: "relative",
                    }}>
                      {d.dupes > 1 && (
                        <div style={{
                          position: "absolute", top: "-5px", right: "-5px",
                          background: "#f59e0b", color: "white", width: "15px", height: "15px",
                          borderRadius: "99px", fontSize: "8px", fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {d.dupes}
                        </div>
                      )}
                      <p style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "12px", color: vs.text, lineHeight: 1 }}>
                        {raw}
                      </p>
                      {sticker?.is_foil && (
                        <div style={{ width: "6px", height: "6px", borderRadius: "99px", background: "#fbbf24", marginTop: "3px" }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )
        )}

        {tab === "missing" && (
          filteredMissing.length === 0
            ? <p style={{ textAlign: "center", color: "#4ade80", fontSize: "13px", padding: "32px 0" }}>
                {teamFilter === "ALL" ? "🎉 Album complete!" : "All collected for this team!"}
              </p>
            : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {filteredMissing.map((id) => {
                  const sticker = stickerMap.get(id);
                  return (
                    <div key={id} style={{
                      background: "#27272a", border: "1.5px solid #3f3f46",
                      borderRadius: "8px", padding: "6px 8px",
                    }}>
                      <p style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "12px", color: "#71717a", lineHeight: 1 }}>
                        {id}
                      </p>
                      {sticker?.is_foil && (
                        <div style={{ width: "6px", height: "6px", borderRadius: "99px", background: "#fbbf24", marginTop: "3px" }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )
        )}

        {/* Copy full list for WhatsApp */}
        <div style={{ marginTop: "24px", padding: "12px", background: "#27272a", borderRadius: "12px", border: "1px solid #3f3f46" }}>
          <p style={{ fontSize: "11px", color: "#71717a", marginBottom: "8px" }}>
            Share your full list (WhatsApp / SMS friendly)
          </p>
          <button onClick={copyFullList} style={{
            width: "100%", padding: "10px", borderRadius: "10px",
            background: copied ? "#052e16" : "#3f3f46",
            border: "none", color: copied ? "#4ade80" : "#f4f4f5",
            fontSize: "13px", fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy full trade list"}
          </button>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", fontSize: "11px", color: "#3f3f46", marginTop: "24px" }}>
          panini.lfigil.com · WC2026 Sticker Tracker
        </p>
      </div>
    </div>
  );
}
