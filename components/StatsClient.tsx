"use client";

import { useMemo } from "react";
import { BOX_TYPE_LABELS, BoxType } from "@/lib/types";

interface PackLog {
  id: string;
  new_count: number;
  opened_at: string;
  box_id: string | null;
  sticker_ids: string[];
}

interface Box {
  id: string;
  box_type: string;
  total_packs: number;
  created_at: string;
}

interface CollectionRow {
  sticker_id: string;
  variant: string;
  quantity: number;
}

interface StickerMeta {
  id: string;
  is_foil: boolean;
  team_code: string;
}

interface Completion {
  unique_collected: number;
  total_stickers: number;
  completion_pct: number;
}

interface Props {
  packLogs: PackLog[];
  boxes: Box[];
  collection: CollectionRow[];
  completion: Completion;
  stickers: StickerMeta[];
}

const BOX_COLORS: Record<string, string> = {
  regular: "#3b82f6",
  amazon_orange: "#f97316",
  panini_exclusive: "#a855f7",
  tin: "#22c55e",
};

const VARIANT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  standard: { bg: "#27272a", text: "#a1a1aa", dot: "#52525b" },
  orange:   { bg: "#431407", text: "#fb923c", dot: "#f97316" },
  blue:     { bg: "#172554", text: "#60a5fa", dot: "#3b82f6" },
  red:      { bg: "#450a0a", text: "#f87171", dot: "#ef4444" },
  green:    { bg: "#052e16", text: "#4ade80", dot: "#22c55e" },
  purple:   { bg: "#2e1065", text: "#c084fc", dot: "#a855f7" },
  black:    { bg: "#09090b", text: "#d4d4d8", dot: "#71717a" },
};

function StatCard({ label, value, sub, color = "#60a5fa" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{ background: "#27272a", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
      <p style={{ fontSize: "24px", fontWeight: 700, color }}>{value}</p>
      <p style={{ fontSize: "11px", color: "#71717a", marginTop: "4px" }}>{label}</p>
      {sub && <p style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>{sub}</p>}
    </div>
  );
}

function Sparkline({ data, color = "#3b82f6", height = 40 }: {
  data: number[]; color?: string; height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 300;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height: `${height}px` }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function StatsClient({ packLogs, boxes, collection, completion, stickers }: Props) {
  const totalPacks = packLogs.length;
  const totalStickersLogged = totalPacks * 7;
  const totalDuplicates = collection.reduce((s, r) => s + Math.max(0, r.quantity - 1), 0);
  const totalNew = packLogs.reduce((s, p) => s + p.new_count, 0);
  const avgNewPerPack = totalPacks > 0 ? (totalNew / totalPacks).toFixed(1) : "0";
  const dupeRate = totalStickersLogged > 0 ? Math.round((totalDuplicates / totalStickersLogged) * 100) : 0;
  const remaining = completion.total_stickers - completion.unique_collected;
  const hitRate = totalPacks > 0 ? totalNew / totalPacks : 3.5;
  const estimatedPacksLeft = hitRate > 0 ? Math.ceil(remaining / hitRate) : 0;

  // Build foil lookup
  const foilIds = useMemo(() => new Set(stickers.filter((s) => s.is_foil).map((s) => s.id)), [stickers]);
  const totalFoils = foilIds.size;

  // Foil collection stats
  const foilStats = useMemo(() => {
    const ownedFoils = collection.filter((r) => foilIds.has(r.sticker_id));
    const uniqueFoilsOwned = new Set(ownedFoils.map((r) => r.sticker_id)).size;
    const foilDupes = ownedFoils.reduce((s, r) => s + Math.max(0, r.quantity - 1), 0);

    // Foils pulled from pack logs
    let foilsPulledFromPacks = 0;
    for (const log of packLogs) {
      for (const sid of log.sticker_ids) {
        const base = sid.split("-")[0];
        if (foilIds.has(base)) foilsPulledFromPacks++;
      }
    }
    const foilHitRate = totalStickersLogged > 0
      ? ((foilsPulledFromPacks / totalStickersLogged) * 100).toFixed(1)
      : "0";

    return { uniqueFoilsOwned, foilDupes, foilsPulledFromPacks, foilHitRate };
  }, [collection, foilIds, packLogs, totalStickersLogged]);

  // Parallel pulls breakdown
  const parallelStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of packLogs) {
      for (const sid of log.sticker_ids) {
        const parts = sid.split("-");
        const variant = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "standard";
        counts[variant] = (counts[variant] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([variant, count]) => ({ variant, count }))
      .sort((a, b) => {
        // Order: standard last, black first (rarest)
        const order = ["black", "purple", "green", "red", "blue", "orange", "standard"];
        return order.indexOf(a.variant) - order.indexOf(b.variant);
      });
  }, [packLogs]);

  // Duplicate hotspots — top 5 most duped stickers
  const dupeHotspots = useMemo(() => {
    return collection
      .filter((r) => r.quantity > 1)
      .map((r) => ({ sticker_id: r.sticker_id, variant: r.variant, dupes: r.quantity - 1 }))
      .sort((a, b) => b.dupes - a.dupes)
      .slice(0, 5);
  }, [collection]);

  // Luckiest / unluckiest packs
  const luckyPacks = useMemo(() => {
    if (packLogs.length === 0) return { best: null, worst: null };
    const best = packLogs.reduce((a, b) => a.new_count >= b.new_count ? a : b);
    const worst = packLogs.reduce((a, b) => a.new_count <= b.new_count ? a : b);
    return { best, worst };
  }, [packLogs]);

  // Per box type stats
  const boxTypeStats = useMemo(() => {
    const stats: Record<string, { packs: number; newTotal: number; dupeTotal: number; foilTotal: number }> = {};
    for (const log of packLogs) {
      const box = boxes.find((b) => b.id === log.box_id);
      const bt = box?.box_type ?? "loose";
      if (!stats[bt]) stats[bt] = { packs: 0, newTotal: 0, dupeTotal: 0, foilTotal: 0 };
      stats[bt].packs++;
      stats[bt].newTotal += log.new_count;
      stats[bt].dupeTotal += (7 - log.new_count);
      stats[bt].foilTotal += log.sticker_ids.filter((sid) => foilIds.has(sid.split("-")[0])).length;
    }
    return Object.entries(stats).map(([type, s]) => ({
      type,
      packs: s.packs,
      avgNew: s.packs > 0 ? (s.newTotal / s.packs).toFixed(1) : "0",
      avgDupe: s.packs > 0 ? (s.dupeTotal / s.packs).toFixed(1) : "0",
      hitRate: s.packs > 0 ? Math.round((s.newTotal / (s.packs * 7)) * 100) : 0,
      foilRate: s.packs > 0 ? ((s.foilTotal / (s.packs * 7)) * 100).toFixed(1) : "0",
    })).sort((a, b) => b.packs - a.packs);
  }, [packLogs, boxes, foilIds]);

  // Completion curve
  const completionCurve = useMemo(() => {
    if (packLogs.length === 0) return [];
    const seen = new Set<string>();
    return packLogs.map((log) => {
      log.sticker_ids.forEach((sid) => seen.add(sid.split("-")[0]));
      return seen.size;
    });
  }, [packLogs]);

  // Box progress
  const boxProgress = useMemo(() => {
    return boxes.map((box) => {
      const opened = packLogs.filter((l) => l.box_id === box.id).length;
      const newFromBox = packLogs.filter((l) => l.box_id === box.id).reduce((s, l) => s + l.new_count, 0);
      return { ...box, opened, newFromBox, pct: Math.round((opened / box.total_packs) * 100) };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [boxes, packLogs]);

  const recentPacks = packLogs.slice(-20);
  const newPerPack = recentPacks.map((p) => p.new_count);

  const ss = { background: "#27272a", borderRadius: "16px", padding: "16px", marginBottom: "12px" };
  const hs = { fontSize: "13px", fontWeight: 600 as const, color: "#f4f4f5", marginBottom: "12px" };

  if (totalPacks === 0) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center" }}>
        <p style={{ fontSize: "32px", marginBottom: "12px" }}>📊</p>
        <p style={{ fontSize: "15px", fontWeight: 600, color: "#f4f4f5" }}>No data yet</p>
        <p style={{ fontSize: "13px", color: "#71717a", marginTop: "6px" }}>Log some packs to see your stats</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 12px 24px", maxWidth: "480px", margin: "0 auto" }}>

      {/* Top stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
        <StatCard label="Packs opened" value={totalPacks} color="#60a5fa" />
        <StatCard label="Unique collected" value={completion.unique_collected} sub={`of ${completion.total_stickers}`} color="#4ade80" />
        <StatCard label="Avg new / pack" value={avgNewPerPack} sub="stickers" color="#a78bfa" />
        <StatCard label="Duplicates" value={totalDuplicates} sub={`${dupeRate}% dupe rate`} color="#f87171" />
      </div>

      {/* Completion estimate */}
      <div style={{ ...ss, background: "#1e3a5f", border: "1px solid #1d4ed8", marginBottom: "12px" }}>
        <p style={{ ...hs, color: "#93c5fd" }}>🎯 Completion estimate</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: "28px", fontWeight: 700, color: "#60a5fa" }}>{estimatedPacksLeft}</p>
            <p style={{ fontSize: "12px", color: "#93c5fd" }}>packs to finish</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "22px", fontWeight: 700, color: "#4ade80" }}>{completion.completion_pct}%</p>
            <p style={{ fontSize: "12px", color: "#86efac" }}>{remaining} stickers left</p>
          </div>
        </div>
        <div style={{ width: "100%", height: "6px", background: "#1d4ed8", borderRadius: "99px", marginTop: "12px" }}>
          <div style={{ width: `${completion.completion_pct}%`, height: "6px", background: "#4ade80", borderRadius: "99px" }} />
        </div>
      </div>

      {/* Completion curve */}
      {completionCurve.length > 1 && (
        <div style={ss}>
          <p style={hs}>📈 Collection growth</p>
          <Sparkline data={completionCurve} color="#4ade80" height={50} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
            <span style={{ fontSize: "10px", color: "#52525b" }}>Pack 1</span>
            <span style={{ fontSize: "10px", color: "#52525b" }}>Pack {totalPacks}</span>
          </div>
        </div>
      )}

      {/* New per pack trend */}
      {recentPacks.length > 1 && (
        <div style={ss}>
          <p style={hs}>🆕 New stickers per pack (last {recentPacks.length})</p>
          <Sparkline data={newPerPack} color="#60a5fa" height={44} />
          <p style={{ fontSize: "11px", color: "#52525b", marginTop: "6px" }}>avg {avgNewPerPack} new per pack</p>
        </div>
      )}

      {/* ✨ FOIL STATS */}
      <div style={ss}>
        <p style={hs}>✨ Foil collection</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          <div style={{ background: "#18181b", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <p style={{ fontSize: "20px", fontWeight: 700, color: "#fbbf24" }}>{foilStats.uniqueFoilsOwned}</p>
            <p style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>of {totalFoils} foils</p>
          </div>
          <div style={{ background: "#18181b", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <p style={{ fontSize: "20px", fontWeight: 700, color: "#f59e0b" }}>{foilStats.foilHitRate}%</p>
            <p style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>hit rate</p>
          </div>
          <div style={{ background: "#18181b", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <p style={{ fontSize: "20px", fontWeight: 700, color: "#d97706" }}>{foilStats.foilDupes}</p>
            <p style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>foil dupes</p>
          </div>
        </div>
        {/* Foil progress bar */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
          <span style={{ fontSize: "11px", color: "#a1a1aa" }}>Foil completion</span>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#fbbf24" }}>
            {totalFoils > 0 ? Math.round((foilStats.uniqueFoilsOwned / totalFoils) * 100) : 0}%
          </span>
        </div>
        <div style={{ width: "100%", height: "6px", background: "#3f3f46", borderRadius: "99px" }}>
          <div style={{
            width: `${totalFoils > 0 ? (foilStats.uniqueFoilsOwned / totalFoils) * 100 : 0}%`,
            height: "6px",
            background: "linear-gradient(90deg, #d97706, #fbbf24)",
            borderRadius: "99px",
          }} />
        </div>
      </div>

      {/* 🎨 PARALLEL PULLS */}
      {parallelStats.length > 0 && (
        <div style={ss}>
          <p style={hs}>🎨 Parallel pulls</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {parallelStats.map(({ variant, count }) => {
              const style = VARIANT_COLORS[variant] ?? VARIANT_COLORS.standard;
              const maxCount = Math.max(...parallelStats.map((p) => p.count));
              const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
              const label = variant.charAt(0).toUpperCase() + variant.slice(1);
              return (
                <div key={variant} style={{ background: style.bg, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "99px", background: style.dot }} />
                      <span style={{ fontSize: "13px", fontWeight: 500, color: style.text }}>{label}</span>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: style.text }}>{count}</span>
                  </div>
                  <div style={{ width: "100%", height: "3px", background: "#18181b", borderRadius: "99px" }}>
                    <div style={{ width: `${pct}%`, height: "3px", background: style.dot, borderRadius: "99px" }} />
                  </div>
                </div>
              );
            })}
          </div>
          {parallelStats.find((p) => p.variant === "black") ? (
            <p style={{ fontSize: "10px", color: "#52525b", marginTop: "8px", textAlign: "center" }}>🖤 Black parallel pulled — extremely rare!</p>
          ) : (
            <p style={{ fontSize: "10px", color: "#52525b", marginTop: "8px", textAlign: "center" }}>No black parallel yet — keep opening!</p>
          )}
        </div>
      )}

      {/* 🏆 LUCKY / UNLUCKY PACKS */}
      {luckyPacks.best && luckyPacks.worst && (
        <div style={ss}>
          <p style={hs}>🎲 Pack highlights</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: "12px", padding: "12px", textAlign: "center" }}>
              <p style={{ fontSize: "11px", color: "#4ade80", marginBottom: "6px", fontWeight: 600 }}>🏆 Best pack</p>
              <p style={{ fontSize: "28px", fontWeight: 700, color: "#4ade80" }}>{luckyPacks.best.new_count}</p>
              <p style={{ fontSize: "10px", color: "#16a34a" }}>new stickers</p>
              <p style={{ fontSize: "10px", color: "#15803d", marginTop: "4px" }}>
                {new Date(luckyPacks.best.opened_at).toLocaleDateString()}
              </p>
            </div>
            <div style={{ background: "#450a0a", border: "1px solid #991b1b", borderRadius: "12px", padding: "12px", textAlign: "center" }}>
              <p style={{ fontSize: "11px", color: "#f87171", marginBottom: "6px", fontWeight: 600 }}>💀 Worst pack</p>
              <p style={{ fontSize: "28px", fontWeight: 700, color: "#f87171" }}>{luckyPacks.worst.new_count}</p>
              <p style={{ fontSize: "10px", color: "#ef4444" }}>new stickers</p>
              <p style={{ fontSize: "10px", color: "#dc2626", marginTop: "4px" }}>
                {new Date(luckyPacks.worst.opened_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 🃏 DUPLICATE HOTSPOTS */}
      {dupeHotspots.length > 0 && (
        <div style={ss}>
          <p style={hs}>🃏 Duplicate hotspots</p>
          <p style={{ fontSize: "11px", color: "#52525b", marginBottom: "10px" }}>Your most-duped stickers — prime trade candidates</p>
          {dupeHotspots.map(({ sticker_id, variant, dupes }, i) => {
            const variantStyle = VARIANT_COLORS[variant] ?? VARIANT_COLORS.standard;
            const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
            return (
              <div key={`${sticker_id}-${variant}`} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 10px", background: "#18181b", borderRadius: "8px", marginBottom: "6px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "16px" }}>{medals[i]}</span>
                  <span style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "#f4f4f5" }}>
                    {sticker_id}{variant !== "standard" ? `-${variant.toUpperCase()}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "99px", background: variantStyle.dot }} />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#f87171" }}>+{dupes}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 📦 Box type performance */}
      {boxTypeStats.length > 0 && (
        <div style={ss}>
          <p style={hs}>📦 Performance by box type</p>
          {boxTypeStats.map((bt) => {
            const label = bt.type === "loose" ? "Loose packs" : BOX_TYPE_LABELS[bt.type as BoxType] ?? bt.type;
            const color = BOX_COLORS[bt.type] ?? "#71717a";
            return (
              <div key={bt.type} style={{ marginBottom: "14px", paddingBottom: "14px", borderBottom: "1px solid #3f3f46" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "99px", background: color }} />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#f4f4f5" }}>{label}</span>
                  </div>
                  <span style={{ fontSize: "11px", color: "#71717a" }}>{bt.packs} packs</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px" }}>
                  {[
                    { v: bt.avgNew, l: "avg new", c: color },
                    { v: bt.avgDupe, l: "avg dupe", c: "#f87171" },
                    { v: `${bt.hitRate}%`, l: "hit rate", c: "#4ade80" },
                    { v: `${bt.foilRate}%`, l: "foil rate", c: "#fbbf24" },
                  ].map(({ v, l, c }) => (
                    <div key={l} style={{ background: "#18181b", borderRadius: "8px", padding: "8px 4px", textAlign: "center" }}>
                      <p style={{ fontSize: "14px", fontWeight: 700, color: c }}>{v}</p>
                      <p style={{ fontSize: "9px", color: "#52525b", marginTop: "2px" }}>{l}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Boxes progress */}
      {boxProgress.length > 0 && (
        <div style={ss}>
          <p style={hs}>🗃️ Boxes</p>
          {boxProgress.map((box) => {
            const color = BOX_COLORS[box.box_type] ?? "#71717a";
            return (
              <div key={box.id} style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#a1a1aa" }}>
                    {BOX_TYPE_LABELS[box.box_type as BoxType] ?? box.box_type}
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color }}>
                    {box.opened}/{box.total_packs} · {box.newFromBox} new
                  </span>
                </div>
                <div style={{ width: "100%", height: "5px", background: "#3f3f46", borderRadius: "99px" }}>
                  <div style={{ width: `${box.pct}%`, height: "5px", background: color, borderRadius: "99px" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
