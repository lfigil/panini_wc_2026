"use client";

import { useMemo, useState } from "react";
import { BOX_TYPE_LABELS, BoxType } from "@/lib/types";
import { Loader2, Sparkles, ChevronRight } from "lucide-react";

interface PackLog {
  id: string;
  new_count: number;
  opened_at: string;
  box_id: string | null;
  sticker_ids: string[];
}
interface Box { id: string; box_type: string; total_packs: number; created_at: string; }
interface CollectionRow { sticker_id: string; variant: string; quantity: number; }
interface StickerMeta { id: string; is_foil: boolean; team_code: string; }
interface Completion { unique_collected: number; total_stickers: number; completion_pct: number; }
interface Props {
  packLogs: PackLog[]; boxes: Box[]; collection: CollectionRow[];
  completion: Completion; stickers: StickerMeta[];
}

const BOX_COLORS: Record<string, string> = {
  regular: "#3b82f6", amazon_orange: "#f97316", panini_exclusive: "#a855f7", tin: "#22c55e",
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

const QUICK_QUESTIONS = [
  "How many more packs do I need to finish?",
  "Should I buy another box?",
  "What's my best trading strategy?",
  "Am I on track with 4 boxes total?",
];

function StatCard({ label, value, sub, color = "#60a5fa" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#27272a", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
      <p style={{ fontSize: "24px", fontWeight: 700, color }}>{value}</p>
      <p style={{ fontSize: "11px", color: "#71717a", marginTop: "4px" }}>{label}</p>
      {sub && <p style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>{sub}</p>}
    </div>
  );
}

function Sparkline({ data, color = "#3b82f6", height = 40 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1, w = 300;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height: `${height}px` }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Renders basic markdown (bold, bullets, line breaks) without any library
function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    // Bullet points
    const isBullet = /^[-*]\s/.test(line);
    const content = isBullet ? line.replace(/^[-*]\s/, "") : line;

    // Bold: **text** or __text__
    const parts = content.split(/\*\*(.+?)\*\*|__(.+?)__/g);
    const rendered = parts.map((part, j) => {
      if (j % 3 === 1 || j % 3 === 2) {
        return part ? <strong key={j} style={{ color: "#f4f4f5", fontWeight: 700 }}>{part}</strong> : null;
      }
      return part || null;
    });

    if (isBullet) {
      return (
        <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
          <span style={{ color: "#a78bfa", flexShrink: 0, marginTop: "1px" }}>•</span>
          <span>{rendered}</span>
        </div>
      );
    }
    if (!content.trim()) return <div key={i} style={{ height: "6px" }} />;
    return <p key={i} style={{ margin: "0 0 6px 0" }}>{rendered}</p>;
  });
}

export default function StatsClient({ packLogs, boxes, collection, completion, stickers }: Props) {
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const totalPacks = packLogs.length;
  const totalStickersLogged = totalPacks * 7;
  const totalDuplicates = collection.reduce((s, r) => s + Math.max(0, r.quantity - 1), 0);
  const totalNew = packLogs.reduce((s, p) => s + p.new_count, 0);
  const avgNewPerPack = totalPacks > 0 ? totalNew / totalPacks : 3.5;
  const avgNewPerPackStr = avgNewPerPack.toFixed(1);
  const dupeRate = totalStickersLogged > 0 ? Math.round((totalDuplicates / totalStickersLogged) * 100) : 0;
  const remaining = completion.total_stickers - completion.unique_collected;
  const estimatedPacksLeft = avgNewPerPack > 0 ? Math.ceil(remaining / avgNewPerPack) : 0;

  // 4-box projection
  const boxProjection = useMemo(() => {
    const totalPacksInBoxes = boxes.reduce((s, b) => s + b.total_packs, 0);
    const packsRemainingInBoxes = boxes.reduce((s, b) => {
      const opened = packLogs.filter((l) => l.box_id === b.id).length;
      return s + Math.max(0, b.total_packs - opened);
    }, 0);
    const projectedNewFromRemaining = Math.round(packsRemainingInBoxes * avgNewPerPack);
    const projectedTotal = Math.min(completion.total_stickers, completion.unique_collected + projectedNewFromRemaining);
    const projectedPct = Math.round((projectedTotal / completion.total_stickers) * 100);
    const theoreticalPacks = 1045; // coupon collector for 980 stickers
    const vsTheory = totalPacksInBoxes - theoreticalPacks;
    return { totalPacksInBoxes, packsRemainingInBoxes, projectedTotal, projectedPct, theoreticalPacks, vsTheory };
  }, [boxes, packLogs, avgNewPerPack, completion]);

  // Box type stats
  const boxTypeStats = useMemo(() => {
    const foilIds = new Set(stickers.filter((s) => s.is_foil).map((s) => s.id));
    const stats: Record<string, { packs: number; newTotal: number; dupeTotal: number; foilTotal: number; remaining: number }> = {};
    for (const box of boxes) {
      const bt = box.box_type;
      if (!stats[bt]) stats[bt] = { packs: 0, newTotal: 0, dupeTotal: 0, foilTotal: 0, remaining: 0 };
      const opened = packLogs.filter((l) => l.box_id === box.id).length;
      stats[bt].remaining += Math.max(0, box.total_packs - opened);
    }
    for (const log of packLogs) {
      const box = boxes.find((b) => b.id === log.box_id);
      const bt = box?.box_type ?? "loose";
      if (!stats[bt]) stats[bt] = { packs: 0, newTotal: 0, dupeTotal: 0, foilTotal: 0, remaining: 0 };
      stats[bt].packs++;
      stats[bt].newTotal += log.new_count;
      stats[bt].dupeTotal += (7 - log.new_count);
      stats[bt].foilTotal += log.sticker_ids.filter((sid) => foilIds.has(sid.split("-")[0])).length;
    }
    return Object.entries(stats).map(([type, s]) => ({
      type, packs: s.packs, remaining: s.remaining,
      avgNew: s.packs > 0 ? (s.newTotal / s.packs).toFixed(1) : "0",
      avgDupe: s.packs > 0 ? (s.dupeTotal / s.packs).toFixed(1) : "0",
      hitRate: s.packs > 0 ? Math.round((s.newTotal / (s.packs * 7)) * 100) : 0,
      foilRate: s.packs > 0 ? ((s.foilTotal / (s.packs * 7)) * 100).toFixed(1) : "0",
    })).sort((a, b) => b.packs - a.packs);
  }, [packLogs, boxes, stickers]);

  // Foil stats
  const foilIds = useMemo(() => new Set(stickers.filter((s) => s.is_foil).map((s) => s.id)), [stickers]);
  const totalFoils = foilIds.size;
  const foilStats = useMemo(() => {
    const ownedFoils = collection.filter((r) => foilIds.has(r.sticker_id));
    const uniqueFoilsOwned = new Set(ownedFoils.map((r) => r.sticker_id)).size;
    const foilDupes = ownedFoils.reduce((s, r) => s + Math.max(0, r.quantity - 1), 0);
    let foilsPulled = 0;
    for (const log of packLogs) for (const sid of log.sticker_ids) if (foilIds.has(sid.split("-")[0])) foilsPulled++;
    const foilHitRate = totalStickersLogged > 0 ? ((foilsPulled / totalStickersLogged) * 100).toFixed(1) : "0";
    return { uniqueFoilsOwned, foilDupes, foilHitRate };
  }, [collection, foilIds, packLogs, totalStickersLogged]);

  // Parallel pulls
  const parallelStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of packLogs) for (const sid of log.sticker_ids) {
      const parts = sid.split("-");
      const v = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "standard";
      counts[v] = (counts[v] ?? 0) + 1;
    }
    const order = ["black", "purple", "green", "red", "blue", "orange", "standard"];
    return Object.entries(counts).map(([variant, count]) => ({ variant, count }))
      .sort((a, b) => order.indexOf(a.variant) - order.indexOf(b.variant));
  }, [packLogs]);

  // Dupe hotspots
  const dupeHotspots = useMemo(() =>
    collection.filter((r) => r.quantity > 1)
      .map((r) => ({ sticker_id: r.sticker_id, variant: r.variant, dupes: r.quantity - 1 }))
      .sort((a, b) => b.dupes - a.dupes).slice(0, 5),
    [collection]);

  // Lucky packs
  const luckyPacks = useMemo(() => {
    if (!packLogs.length) return { best: null, worst: null };
    return {
      best: packLogs.reduce((a, b) => a.new_count >= b.new_count ? a : b),
      worst: packLogs.reduce((a, b) => a.new_count <= b.new_count ? a : b),
    };
  }, [packLogs]);

  const completionCurve = useMemo(() => {
    const seen = new Set<string>();
    return packLogs.map((log) => { log.sticker_ids.forEach((sid) => seen.add(sid.split("-")[0])); return seen.size; });
  }, [packLogs]);

  const boxProgress = useMemo(() =>
    boxes.map((box) => {
      const opened = packLogs.filter((l) => l.box_id === box.id).length;
      const newFromBox = packLogs.filter((l) => l.box_id === box.id).reduce((s, l) => s + l.new_count, 0);
      return { ...box, opened, newFromBox, pct: Math.round((opened / box.total_packs) * 100) };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [boxes, packLogs]);

  const recentPacks = packLogs.slice(-20);

  // AI assistant
  async function askAI(question: string) {
    if (!question.trim()) return;
    setAiLoading(true);
    setAiAnswer(null);
    setAiError(null);
    try {
      const context = {
        totalPacks,
        totalBoxes: boxes.length,
        uniqueCollected: completion.unique_collected,
        totalStickers: completion.total_stickers,
        completionPct: completion.completion_pct,
        remaining,
        avgNewPerPack: parseFloat(avgNewPerPackStr),
        totalDuplicates,
        totalPacksInAllBoxes: boxProjection.totalPacksInBoxes,
        packsRemainingInBoxes: boxProjection.packsRemainingInBoxes,
        projectedFromBoxes: boxProjection.projectedTotal,
        boxBreakdown: boxTypeStats.map((b) => ({
          type: BOX_TYPE_LABELS[b.type as BoxType] ?? b.type,
          packs: b.packs,
          avgNew: parseFloat(b.avgNew),
          remaining: b.remaining,
        })),
      };
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI failed");
      setAiAnswer(data.answer);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "Failed to get answer");
    } finally {
      setAiLoading(false);
    }
  }

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

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
        <StatCard label="Packs opened" value={totalPacks} color="#60a5fa" />
        <StatCard label="Unique collected" value={completion.unique_collected} sub={`of ${completion.total_stickers}`} color="#4ade80" />
        <StatCard label="Avg new / pack" value={avgNewPerPackStr} sub="stickers" color="#a78bfa" />
        <StatCard label="Duplicates" value={totalDuplicates} sub={`${dupeRate}% dupe rate`} color="#f87171" />
      </div>

      {/* Completion estimate + box projection */}
      <div style={{ ...ss, background: "#1e3a5f", border: "1px solid #1d4ed8", marginBottom: "12px" }}>
        <p style={{ ...hs, color: "#93c5fd" }}>🎯 Completion outlook</p>

        {/* Current progress */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <div>
            <p style={{ fontSize: "26px", fontWeight: 700, color: "#60a5fa" }}>{estimatedPacksLeft}</p>
            <p style={{ fontSize: "11px", color: "#93c5fd" }}>estimated packs to finish</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "22px", fontWeight: 700, color: "#4ade80" }}>{completion.completion_pct}%</p>
            <p style={{ fontSize: "11px", color: "#86efac" }}>{remaining} stickers left</p>
          </div>
        </div>
        <div style={{ width: "100%", height: "5px", background: "#1d4ed8", borderRadius: "99px", marginBottom: "14px" }}>
          <div style={{ width: `${completion.completion_pct}%`, height: "5px", background: "#4ade80", borderRadius: "99px" }} />
        </div>

        {/* Box projection */}
        {boxes.length > 0 && (
          <div style={{ borderTop: "1px solid #1d4ed8", paddingTop: "12px" }}>
            <p style={{ fontSize: "11px", fontWeight: 600, color: "#93c5fd", marginBottom: "8px" }}>
              📦 {boxes.length} box projection
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginBottom: "8px" }}>
              {[
                { v: boxProjection.totalPacksInBoxes, l: "total packs", c: "#60a5fa" },
                { v: boxProjection.packsRemainingInBoxes, l: "packs left", c: "#a78bfa" },
                { v: `${boxProjection.projectedPct}%`, l: "projected", c: "#4ade80" },
              ].map(({ v, l, c }) => (
                <div key={l} style={{ background: "#172554", borderRadius: "8px", padding: "8px 4px", textAlign: "center" }}>
                  <p style={{ fontSize: "15px", fontWeight: 700, color: c }}>{v}</p>
                  <p style={{ fontSize: "9px", color: "#1d4ed8", marginTop: "2px" }}>{l}</p>
                </div>
              ))}
            </div>
            <div style={{ width: "100%", height: "4px", background: "#1d4ed8", borderRadius: "99px" }}>
              <div style={{ width: `${boxProjection.projectedPct}%`, height: "4px", background: "#a78bfa", borderRadius: "99px" }} />
            </div>
            <p style={{ fontSize: "10px", color: "#3b82f6", marginTop: "6px" }}>
              Theory (coupon collector): ~{boxProjection.theoreticalPacks} packs total ·{" "}
              your {boxProjection.totalPacksInBoxes} packs is{" "}
              {boxProjection.vsTheory < 0
                ? `${Math.abs(boxProjection.vsTheory)} fewer than theory`
                : `${boxProjection.vsTheory} more than theory`}
            </p>
          </div>
        )}
      </div>

      {/* 🤖 AI ASSISTANT */}
      <div style={{ ...ss, border: "1px solid #3f3f46" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <Sparkles size={14} color="#a78bfa" />
          <p style={{ ...hs, margin: 0 }}>AI assistant</p>
        </div>

        {/* Quick question pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => { setAiQuestion(q); askAI(q); }}
              disabled={aiLoading}
              style={{
                padding: "5px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 500,
                border: "1px solid #3f3f46", background: "transparent", color: "#a1a1aa",
                cursor: aiLoading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: "4px",
              }}
            >
              {q} <ChevronRight size={10} />
            </button>
          ))}
        </div>

        {/* Free-text input */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askAI(aiQuestion)}
            placeholder="Ask anything about your collection…"
            style={{
              flex: 1, padding: "9px 12px", fontSize: "13px",
              borderRadius: "10px", border: "1px solid #3f3f46",
              background: "#18181b", color: "#f4f4f5",
              outline: "none",
            }}
          />
          <button
            onClick={() => askAI(aiQuestion)}
            disabled={aiLoading || !aiQuestion.trim()}
            style={{
              padding: "9px 14px", borderRadius: "10px",
              background: aiLoading || !aiQuestion.trim() ? "#3f3f46" : "#7c3aed",
              border: "none", color: "white", fontSize: "13px", fontWeight: 600,
              cursor: aiLoading || !aiQuestion.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            {aiLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={14} />}
          </button>
        </div>

        {/* AI response */}
        {aiLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px", background: "#18181b", borderRadius: "10px", color: "#a78bfa" }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
            <span style={{ fontSize: "12px" }}>Analyzing your collection…</span>
          </div>
        )}
        {aiError && (
          <div style={{ padding: "12px", background: "#450a0a", borderRadius: "10px" }}>
            <p style={{ fontSize: "12px", color: "#f87171" }}>{aiError}</p>
          </div>
        )}
        {aiAnswer && !aiLoading && (
          <div style={{ padding: "12px", background: "#18181b", borderRadius: "10px", border: "1px solid #3f3f46" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <Sparkles size={12} color="#a78bfa" />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#a78bfa" }}>Claude says</span>
            </div>
            <div style={{ fontSize: "13px", color: "#d4d4d8", lineHeight: 1.7 }}>{renderMarkdown(aiAnswer)}</div>
          </div>
        )}
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
          <Sparkline data={recentPacks.map((p) => p.new_count)} color="#60a5fa" height={44} />
          <p style={{ fontSize: "11px", color: "#52525b", marginTop: "6px" }}>avg {avgNewPerPackStr} new per pack</p>
        </div>
      )}

      {/* Foil stats */}
      <div style={ss}>
        <p style={hs}>✨ Foil collection</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          {[
            { v: foilStats.uniqueFoilsOwned, l: `of ${totalFoils} foils`, c: "#fbbf24" },
            { v: `${foilStats.foilHitRate}%`, l: "hit rate", c: "#f59e0b" },
            { v: foilStats.foilDupes, l: "foil dupes", c: "#d97706" },
          ].map(({ v, l, c }) => (
            <div key={l} style={{ background: "#18181b", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <p style={{ fontSize: "20px", fontWeight: 700, color: c }}>{v}</p>
              <p style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>{l}</p>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
          <span style={{ fontSize: "11px", color: "#a1a1aa" }}>Foil completion</span>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#fbbf24" }}>
            {totalFoils > 0 ? Math.round((foilStats.uniqueFoilsOwned / totalFoils) * 100) : 0}%
          </span>
        </div>
        <div style={{ width: "100%", height: "6px", background: "#3f3f46", borderRadius: "99px" }}>
          <div style={{ width: `${totalFoils > 0 ? (foilStats.uniqueFoilsOwned / totalFoils) * 100 : 0}%`, height: "6px", background: "linear-gradient(90deg,#d97706,#fbbf24)", borderRadius: "99px" }} />
        </div>
      </div>

      {/* Parallel pulls */}
      {parallelStats.length > 0 && (
        <div style={ss}>
          <p style={hs}>🎨 Parallel pulls</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {parallelStats.map(({ variant, count }) => {
              const vs = VARIANT_COLORS[variant] ?? VARIANT_COLORS.standard;
              const maxC = Math.max(...parallelStats.map((p) => p.count));
              return (
                <div key={variant} style={{ background: vs.bg, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "99px", background: vs.dot }} />
                      <span style={{ fontSize: "13px", fontWeight: 500, color: vs.text }}>{variant.charAt(0).toUpperCase() + variant.slice(1)}</span>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: vs.text }}>{count}</span>
                  </div>
                  <div style={{ width: "100%", height: "3px", background: "#18181b", borderRadius: "99px" }}>
                    <div style={{ width: `${maxC > 0 ? (count / maxC) * 100 : 0}%`, height: "3px", background: vs.dot, borderRadius: "99px" }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: "10px", color: "#52525b", marginTop: "8px", textAlign: "center" }}>
            {parallelStats.find((p) => p.variant === "black") ? "🖤 Black parallel pulled — extremely rare!" : "No black parallel yet — keep opening!"}
          </p>
        </div>
      )}

      {/* Lucky / unlucky packs */}
      {luckyPacks.best && luckyPacks.worst && (
        <div style={ss}>
          <p style={hs}>🎲 Pack highlights</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: "12px", padding: "12px", textAlign: "center" }}>
              <p style={{ fontSize: "11px", color: "#4ade80", marginBottom: "6px", fontWeight: 600 }}>🏆 Best pack</p>
              <p style={{ fontSize: "28px", fontWeight: 700, color: "#4ade80" }}>{luckyPacks.best.new_count}</p>
              <p style={{ fontSize: "10px", color: "#16a34a" }}>new stickers</p>
              <p style={{ fontSize: "10px", color: "#15803d", marginTop: "4px" }}>{new Date(luckyPacks.best.opened_at).toLocaleDateString()}</p>
            </div>
            <div style={{ background: "#450a0a", border: "1px solid #991b1b", borderRadius: "12px", padding: "12px", textAlign: "center" }}>
              <p style={{ fontSize: "11px", color: "#f87171", marginBottom: "6px", fontWeight: 600 }}>💀 Worst pack</p>
              <p style={{ fontSize: "28px", fontWeight: 700, color: "#f87171" }}>{luckyPacks.worst.new_count}</p>
              <p style={{ fontSize: "10px", color: "#ef4444" }}>new stickers</p>
              <p style={{ fontSize: "10px", color: "#dc2626", marginTop: "4px" }}>{new Date(luckyPacks.worst.opened_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate hotspots */}
      {dupeHotspots.length > 0 && (
        <div style={ss}>
          <p style={hs}>🃏 Duplicate hotspots</p>
          <p style={{ fontSize: "11px", color: "#52525b", marginBottom: "10px" }}>Prime trade candidates</p>
          {dupeHotspots.map(({ sticker_id, variant, dupes }, i) => {
            const vs = VARIANT_COLORS[variant] ?? VARIANT_COLORS.standard;
            const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
            return (
              <div key={`${sticker_id}-${variant}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#18181b", borderRadius: "8px", marginBottom: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "16px" }}>{medals[i]}</span>
                  <span style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "#f4f4f5" }}>
                    {sticker_id}{variant !== "standard" ? `-${variant.toUpperCase()}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "99px", background: vs.dot }} />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#f87171" }}>+{dupes}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Box type performance */}
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
                  <span style={{ fontSize: "11px", color: "#71717a" }}>{bt.packs} opened · {bt.remaining} left</span>
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
                  <span style={{ fontSize: "12px", color: "#a1a1aa" }}>{BOX_TYPE_LABELS[box.box_type as BoxType] ?? box.box_type}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color }}>{box.opened}/{box.total_packs} · {box.newFromBox} new</span>
                </div>
                <div style={{ width: "100%", height: "5px", background: "#3f3f46", borderRadius: "99px" }}>
                  <div style={{ width: `${box.pct}%`, height: "5px", background: color, borderRadius: "99px" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
