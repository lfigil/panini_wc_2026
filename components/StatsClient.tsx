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
  quantity: number;
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
}

// Box type colors
const BOX_COLORS: Record<string, string> = {
  regular: "#3b82f6",
  amazon_orange: "#f97316",
  panini_exclusive: "#a855f7",
  tin: "#22c55e",
};

function StatCard({ label, value, sub, color = "#60a5fa" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#27272a", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
      <p style={{ fontSize: "24px", fontWeight: 700, color }}>{value}</p>
      <p style={{ fontSize: "11px", color: "#71717a", marginTop: "4px" }}>{label}</p>
      {sub && <p style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>{sub}</p>}
    </div>
  );
}

// Simple inline bar chart row
function BarRow({ label, value, max, color, suffix = "" }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "12px", color: "#a1a1aa" }}>{label}</span>
        <span style={{ fontSize: "12px", fontWeight: 600, color }}>{value}{suffix}</span>
      </div>
      <div style={{ width: "100%", height: "6px", background: "#3f3f46", borderRadius: "99px" }}>
        <div style={{ width: `${pct}%`, height: "6px", background: color, borderRadius: "99px", transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

// Mini sparkline using SVG
function Sparkline({ data, color = "#3b82f6", height = 40 }: { data: number[]; color?: string; height?: number }) {
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

export default function StatsClient({ packLogs, boxes, collection, completion }: Props) {
  const totalPacks = packLogs.length;
  const totalStickers = totalPacks * 7;
  const totalDuplicates = collection.reduce((s, r) => s + Math.max(0, r.quantity - 1), 0);
  const totalNew = packLogs.reduce((s, p) => s + p.new_count, 0);
  const avgNewPerPack = totalPacks > 0 ? (totalNew / totalPacks).toFixed(1) : "0";
  const dupeRate = totalStickers > 0 ? Math.round((totalDuplicates / totalStickers) * 100) : 0;

  // Estimate packs to complete (based on current hit rate)
  const remaining = completion.total_stickers - completion.unique_collected;
  const hitRate = totalPacks > 0 ? totalNew / totalPacks : 3.5;
  const estimatedPacksLeft = hitRate > 0 ? Math.ceil(remaining / hitRate) : 0;

  // Per box type stats
  const boxTypeStats = useMemo(() => {
    const stats: Record<string, { packs: number; newTotal: number; dupeTotal: number }> = {};
    for (const log of packLogs) {
      const box = boxes.find((b) => b.id === log.box_id);
      const bt = box?.box_type ?? "loose";
      if (!stats[bt]) stats[bt] = { packs: 0, newTotal: 0, dupeTotal: 0 };
      stats[bt].packs++;
      stats[bt].newTotal += log.new_count;
      stats[bt].dupeTotal += (7 - log.new_count);
    }
    return Object.entries(stats).map(([type, s]) => ({
      type,
      packs: s.packs,
      avgNew: s.packs > 0 ? (s.newTotal / s.packs).toFixed(1) : "0",
      avgDupe: s.packs > 0 ? (s.dupeTotal / s.packs).toFixed(1) : "0",
      hitRate: s.packs > 0 ? Math.round((s.newTotal / (s.packs * 7)) * 100) : 0,
    })).sort((a, b) => b.packs - a.packs);
  }, [packLogs]);

  // Completion curve over time — cumulative unique stickers per day
  const completionCurve = useMemo(() => {
    if (packLogs.length === 0) return [];
    const seen = new Set<string>();
    return packLogs.map((log) => {
      log.sticker_ids.forEach((sid) => {
        const base = sid.split("-")[0];
        seen.add(base);
      });
      return seen.size;
    });
  }, [packLogs]);

  // New vs dupe per pack (last 20)
  const recentPacks = packLogs.slice(-20);
  const newPerPack = recentPacks.map((p) => p.new_count);
  const dupePerPack = recentPacks.map((p) => 7 - p.new_count);

  // Packs opened by day of week
  const byDayOfWeek = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const counts = Array(7).fill(0);
    packLogs.forEach((log) => {
      counts[new Date(log.opened_at).getDay()]++;
    });
    return days.map((d, i) => ({ day: d, count: counts[i] }));
  }, [packLogs]);

  const maxDayCount = Math.max(...byDayOfWeek.map((d) => d.count), 1);

  // Boxes progress
  const boxProgress = useMemo(() => {
    return boxes.map((box) => {
      const opened = packLogs.filter((l) => l.box_id === box.id).length;
      const newFromBox = packLogs.filter((l) => l.box_id === box.id).reduce((s, l) => s + l.new_count, 0);
      return { ...box, opened, newFromBox, pct: Math.round((opened / box.total_packs) * 100) };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [boxes, packLogs]);

  const sectionStyle = { background: "#27272a", borderRadius: "16px", padding: "16px", marginBottom: "12px" };
  const headingStyle = { fontSize: "13px", fontWeight: 600, color: "#f4f4f5", marginBottom: "12px" };

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

      {/* Top stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
        <StatCard label="Packs opened" value={totalPacks} color="#60a5fa" />
        <StatCard label="Unique collected" value={completion.unique_collected} sub={`of ${completion.total_stickers}`} color="#4ade80" />
        <StatCard label="Avg new / pack" value={avgNewPerPack} sub="stickers" color="#a78bfa" />
        <StatCard label="Duplicates" value={totalDuplicates} sub={`${dupeRate}% dupe rate`} color="#f87171" />
      </div>

      {/* Completion estimate */}
      <div style={{ ...sectionStyle, background: "#1e3a5f", border: "1px solid #1d4ed8" }}>
        <p style={{ ...headingStyle, color: "#93c5fd" }}>🎯 Completion estimate</p>
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
        <div style={sectionStyle}>
          <p style={headingStyle}>📈 Unique stickers over time</p>
          <Sparkline data={completionCurve} color="#4ade80" height={50} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
            <span style={{ fontSize: "10px", color: "#52525b" }}>Pack 1</span>
            <span style={{ fontSize: "10px", color: "#52525b" }}>Pack {totalPacks}</span>
          </div>
        </div>
      )}

      {/* New vs dupe trend (last 20 packs) */}
      {recentPacks.length > 1 && (
        <div style={sectionStyle}>
          <p style={headingStyle}>🆕 New stickers per pack (last {recentPacks.length})</p>
          <Sparkline data={newPerPack} color="#60a5fa" height={44} />
          <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "10px", height: "3px", background: "#60a5fa", borderRadius: "99px" }} />
              <span style={{ fontSize: "11px", color: "#71717a" }}>New (avg {avgNewPerPack})</span>
            </div>
          </div>
        </div>
      )}

      {/* By box type */}
      {boxTypeStats.length > 0 && (
        <div style={sectionStyle}>
          <p style={headingStyle}>📦 Performance by box type</p>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  <div style={{ background: "#18181b", borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                    <p style={{ fontSize: "16px", fontWeight: 700, color }}>{bt.avgNew}</p>
                    <p style={{ fontSize: "10px", color: "#52525b" }}>avg new</p>
                  </div>
                  <div style={{ background: "#18181b", borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                    <p style={{ fontSize: "16px", fontWeight: 700, color: "#f87171" }}>{bt.avgDupe}</p>
                    <p style={{ fontSize: "10px", color: "#52525b" }}>avg dupe</p>
                  </div>
                  <div style={{ background: "#18181b", borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                    <p style={{ fontSize: "16px", fontWeight: 700, color: "#4ade80" }}>{bt.hitRate}%</p>
                    <p style={{ fontSize: "10px", color: "#52525b" }}>hit rate</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Box progress */}
      {boxProgress.length > 0 && (
        <div style={sectionStyle}>
          <p style={headingStyle}>🗃️ Boxes</p>
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

      {/* Packs by day of week */}
      <div style={sectionStyle}>
        <p style={headingStyle}>📅 Packs by day of week</p>
        <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", height: "60px" }}>
          {byDayOfWeek.map(({ day, count }) => {
            const h = maxDayCount > 0 ? Math.max(4, Math.round((count / maxDayCount) * 52)) : 4;
            return (
              <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "100%", height: `${h}px`, background: count > 0 ? "#3b82f6" : "#3f3f46", borderRadius: "4px 4px 0 0", transition: "height 0.3s" }} />
                <span style={{ fontSize: "9px", color: "#52525b" }}>{day}</span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
