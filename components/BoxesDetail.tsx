"use client";

import { useMemo, useState } from "react";
import { BOX_TYPE_LABELS, BoxType, parseStickerRef } from "@/lib/types";
import { ChevronDown, ChevronUp, Package, TrendingUp, TrendingDown } from "lucide-react";

interface PackLog {
  id: string;
  box_id: string | null;
  pack_number: number | null;
  sticker_ids: string[];
  new_count: number;
  opened_at: string;
}

interface Box {
  id: string;
  box_type: string;
  total_packs: number;
  notes: string | null;
  created_at: string;
}

interface Props {
  boxes: Box[];
  logs: PackLog[];
  stickers: { id: string; description: string; team_code: string }[];
  expandedBoxId: string | null;
  setExpandedBoxId: (id: string | null) => void;
}

const BOX_COLORS: Record<string, string> = {
  regular: "#3b82f6",
  amazon_orange: "#f97316",
  panini_exclusive: "#a855f7",
  tin: "#22c55e",
};

// Mini sparkline SVG
function MiniSparkline({ data, color, height = 36 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = 0;
  const range = max - min;
  const w = 280;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height: `${height}px` }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

// Pack position heatmap — groups packs into buckets and shows avg new per bucket
function PositionHeatmap({ boxLogs, color }: { boxLogs: PackLog[]; color: string }) {
  const bucketSize = 5;
  const buckets = useMemo(() => {
    const sorted = [...boxLogs].sort((a, b) => (a.pack_number ?? 0) - (b.pack_number ?? 0));
    const groups: { label: string; avg: number; count: number }[] = [];
    for (let i = 0; i < sorted.length; i += bucketSize) {
      const slice = sorted.slice(i, i + bucketSize);
      const avg = slice.reduce((s, l) => s + l.new_count, 0) / slice.length;
      const start = slice[0].pack_number ?? i + 1;
      const end = slice[slice.length - 1].pack_number ?? i + slice.length;
      groups.push({ label: `${start}-${end}`, avg: parseFloat(avg.toFixed(1)), count: slice.length });
    }
    return groups;
  }, [boxLogs]);

  if (buckets.length < 2) return null;
  const maxAvg = Math.max(...buckets.map((b) => b.avg), 7);

  return (
    <div>
      <p style={{ fontSize: "11px", color: "#71717a", marginBottom: "8px" }}>
        Avg new stickers by pack position (groups of {bucketSize})
      </p>
      <div style={{ display: "flex", gap: "3px", alignItems: "flex-end", height: "48px" }}>
        {buckets.map((b, i) => {
          const h = Math.max(4, Math.round((b.avg / maxAvg) * 44));
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
              <span style={{ fontSize: "9px", color: "#52525b" }}>{b.avg}</span>
              <div style={{ width: "100%", height: `${h}px`, background: color, borderRadius: "3px 3px 0 0", opacity: 0.8 }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "3px", marginTop: "2px" }}>
        {buckets.map((b, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <span style={{ fontSize: "8px", color: "#52525b" }}>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BoxDetailCard({ box, boxLogs, stickers }: {
  box: Box;
  boxLogs: PackLog[];
  stickers: { id: string; description: string; team_code: string }[];
}) {
  const color = BOX_COLORS[box.box_type] ?? "#71717a";
  const opened = boxLogs.length;
  const totalNew = boxLogs.reduce((s, l) => s + l.new_count, 0);
  const avgNew = opened > 0 ? (totalNew / opened).toFixed(1) : "0";
  const totalDupes = boxLogs.reduce((s, l) => s + (7 - l.new_count), 0);

  // Best and worst packs
  const best = opened > 0 ? boxLogs.reduce((a, b) => a.new_count >= b.new_count ? a : b) : null;
  const worst = opened > 0 ? boxLogs.reduce((a, b) => a.new_count <= b.new_count ? a : b) : null;

  // Foils from this box
  const foilIds = new Set(stickers.filter((s) => {
    // Approximate foil detection from sticker id patterns — rely on pack log data
    return false; // placeholder, actual foil data comes from stickers master
  }).map(s => s.id));

  // Pack-by-pack new count sparkline (sorted by pack_number)
  const sparkData = useMemo(() => {
    return [...boxLogs]
      .sort((a, b) => (a.pack_number ?? 0) - (b.pack_number ?? 0))
      .map((l) => l.new_count);
  }, [boxLogs]);

  // Top teams from this box
  const teamCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of boxLogs) {
      for (const raw of log.sticker_ids) {
        const id = parseStickerRef(raw).id;
        const sticker = stickers.find(s => s.id === id);
        if (sticker) counts[sticker.team_code] = (counts[sticker.team_code] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([team, count]) => ({ team, count }));
  }, [boxLogs, stickers]);

  // Trend: is the hit rate improving or declining?
  const trend = useMemo(() => {
    if (sparkData.length < 6) return null;
    const firstHalf = sparkData.slice(0, Math.floor(sparkData.length / 2));
    const secondHalf = sparkData.slice(Math.floor(sparkData.length / 2));
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const diff = secondAvg - firstAvg;
    if (Math.abs(diff) < 0.3) return null;
    return { direction: diff > 0 ? "up" : "down", diff: Math.abs(diff).toFixed(1) };
  }, [sparkData]);

  return (
    <div style={{ padding: "0 0 12px" }}>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "12px" }}>
        {[
          { v: opened, l: `of ${box.total_packs} opened`, c: color },
          { v: avgNew, l: "avg new/pack", c: "#4ade80" },
          { v: totalDupes, l: "total dupes", c: "#f87171" },
        ].map(({ v, l, c }) => (
          <div key={l} style={{ background: "#18181b", borderRadius: "8px", padding: "8px", textAlign: "center" }}>
            <p style={{ fontSize: "16px", fontWeight: 700, color: c }}>{v}</p>
            <p style={{ fontSize: "9px", color: "#52525b", marginTop: "2px" }}>{l}</p>
          </div>
        ))}
      </div>

      {/* Pack-by-pack sparkline */}
      {sparkData.length > 1 && (
        <div style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <p style={{ fontSize: "11px", color: "#71717a" }}>New stickers per pack</p>
            {trend && (
              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                {trend.direction === "up"
                  ? <TrendingUp size={11} color="#4ade80" />
                  : <TrendingDown size={11} color="#f87171" />
                }
                <span style={{ fontSize: "10px", color: trend.direction === "up" ? "#4ade80" : "#f87171" }}>
                  {trend.direction === "up" ? "+" : "-"}{trend.diff} vs early packs
                </span>
              </div>
            )}
          </div>
          <MiniSparkline data={sparkData} color={color} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "9px", color: "#52525b" }}>Pack 1</span>
            <span style={{ fontSize: "9px", color: "#52525b" }}>Pack {opened}</span>
          </div>
        </div>
      )}

      {/* Pack position analysis */}
      {boxLogs.length >= 10 && (
        <div style={{ marginBottom: "12px" }}>
          <PositionHeatmap boxLogs={boxLogs} color={color} />
        </div>
      )}

      {/* Best / worst packs */}
      {best && worst && opened >= 3 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <p style={{ fontSize: "10px", color: "#4ade80", fontWeight: 600, marginBottom: "4px" }}>🏆 Best pack</p>
            <p style={{ fontSize: "20px", fontWeight: 700, color: "#4ade80" }}>{best.new_count}</p>
            <p style={{ fontSize: "9px", color: "#16a34a" }}>
              {best.pack_number ? `Pack #${best.pack_number}` : "new stickers"}
            </p>
          </div>
          <div style={{ background: "#450a0a", border: "1px solid #991b1b", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
            <p style={{ fontSize: "10px", color: "#f87171", fontWeight: 600, marginBottom: "4px" }}>💀 Worst pack</p>
            <p style={{ fontSize: "20px", fontWeight: 700, color: "#f87171" }}>{worst.new_count}</p>
            <p style={{ fontSize: "9px", color: "#ef4444" }}>
              {worst.pack_number ? `Pack #${worst.pack_number}` : "new stickers"}
            </p>
          </div>
        </div>
      )}

      {/* Top teams */}
      {teamCounts.length > 0 && (
        <div>
          <p style={{ fontSize: "11px", color: "#71717a", marginBottom: "6px" }}>Most stickers from</p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {teamCounts.map(({ team, count }) => (
              <div key={team} style={{ background: "#18181b", borderRadius: "6px", padding: "4px 8px", display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: color }}>{team}</span>
                <span style={{ fontSize: "10px", color: "#52525b" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {opened === 0 && (
        <p style={{ fontSize: "12px", color: "#52525b", textAlign: "center", padding: "16px 0" }}>
          No packs opened yet — start logging!
        </p>
      )}
    </div>
  );
}

export default function BoxesDetail({ boxes, logs, stickers, expandedBoxId, setExpandedBoxId }: Props) {
  if (boxes.length === 0) {
    return (
      <div className="text-center py-10 text-zinc-500 px-4">
        <Package size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No boxes yet</p>
        <p className="text-xs mt-1">Add one in the Log tab</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-3">
      {boxes.map((box) => {
        const boxLogs = logs.filter((l) => l.box_id === box.id);
        const opened = boxLogs.length;
        const pct = Math.round((opened / box.total_packs) * 100);
        const color = BOX_COLORS[box.box_type] ?? "#71717a";
        const isExpanded = expandedBoxId === box.id;

        return (
          <div
            key={box.id}
            className="bg-[#27272a] rounded-xl border border-zinc-700 overflow-hidden"
          >
            {/* Box header — always visible, tap to expand */}
            <button
              onClick={() => setExpandedBoxId(isExpanded ? null : box.id)}
              className="w-full p-4 text-left"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div style={{ width: "8px", height: "8px", borderRadius: "99px", background: color, flexShrink: 0 }} />
                    <p className="text-sm font-semibold text-zinc-100">
                      {BOX_TYPE_LABELS[box.box_type as BoxType] ?? box.box_type}
                    </p>
                  </div>
                  {box.notes && <p className="text-xs text-zinc-500 mt-0.5 ml-3.5">{box.notes}</p>}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
                  {isExpanded
                    ? <ChevronUp size={14} className="text-zinc-500" />
                    : <ChevronDown size={14} className="text-zinc-500" />
                  }
                </div>
              </div>
              <div className="w-full bg-zinc-700 rounded-full h-1.5 mb-1">
                <div style={{ width: `${pct}%`, height: "6px", background: color, borderRadius: "99px" }} />
              </div>
              <p className="text-xs text-zinc-500">{opened}/{box.total_packs} packs opened</p>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-4 pb-2 border-t border-zinc-700/50">
                <div className="pt-3">
                  <BoxDetailCard box={box} boxLogs={boxLogs} stickers={stickers} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
