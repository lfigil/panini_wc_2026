"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Team, Sticker } from "@/lib/types";

interface CollectionRow {
  sticker_id: string;
  variant: string;
  quantity: number;
}

interface Props {
  teams: Team[];
  stickers: Sticker[];
  collection: CollectionRow[];
}

export default function AlbumGrid({ teams, stickers, collection }: Props) {
  const sortedTeams = useMemo(() => {
    const fwc = teams.filter((t) => t.code === "FWC");
    const rest = teams.filter((t) => t.code !== "FWC").sort((a, b) => a.code.localeCompare(b.code));
    return [...fwc, ...rest];
  }, [teams]);

  const [activeTeam, setActiveTeam] = useState<string>(sortedTeams[0]?.code ?? "");
  const [search, setSearch] = useState("");
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

  return (
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

        {/* Sidebar — jump nav */}
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
                <p style={{
                  fontSize: "11px", fontWeight: 700, lineHeight: 1,
                  color: active ? "#93c5fd" : isFWC ? "#fcd34d" : "#a1a1aa",
                }}>
                  {team.code}
                </p>
                <p style={{ fontSize: "10px", marginTop: "2px", color: isComplete ? "#4ade80" : "#52525b" }}>
                  {tc}/{ts.length}
                </p>
              </button>
            );
          })}
        </div>

        {/* All teams — continuous vertical scroll */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0 10px 32px", background: "#18181b" }}>
          {sortedTeams.map((team) => {
            const teamStickers = stickers
              .filter((s) => s.team_code === team.code)
              .sort((a, b) => a.number - b.number);
            const teamCollected = teamStickers.filter((s) => owned.has(s.id)).length;
            const pct = teamStickers.length > 0
              ? Math.round((teamCollected / teamStickers.length) * 100)
              : 0;

            return (
              <div key={team.code} id={`team-${team.code}`} style={{ paddingTop: "14px", marginBottom: "8px" }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "5px" }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: "14px", color: "#fafafa" }}>{team.name}</p>
                    <p style={{ fontSize: "11px", color: "#71717a", marginTop: "1px" }}>
                      {teamCollected}/{teamStickers.length} collected{team.group ? ` · Group ${team.group}` : ""}
                    </p>
                  </div>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: pct === 100 ? "#4ade80" : "#60a5fa" }}>
                    {pct}%
                  </span>
                </div>

                <div style={{ width: "100%", height: "3px", background: "#3f3f46", borderRadius: "99px", marginBottom: "8px" }}>
                  <div style={{
                    height: "3px", borderRadius: "99px",
                    width: `${pct}%`,
                    background: pct === 100 ? "#4ade80" : "#3b82f6",
                  }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                  {teamStickers.map((sticker) => {
                    const ownedRows = owned.get(sticker.id) ?? [];
                    const isOwned = ownedRows.length > 0;
                    const totalQty = ownedRows.reduce((s, r) => s + r.quantity, 0);
                    const hasDupe = totalQty > 1;

                    return (
                      <div
                        key={sticker.id}
                        style={{
                          position: "relative",
                          borderRadius: "10px",
                          border: sticker.is_foil
                            ? isOwned ? "1.5px solid #d97706" : "1.5px solid #78350f"
                            : isOwned ? "1.5px solid #1d4ed8" : "1.5px solid #27272a",
                          background: sticker.is_foil
                            ? isOwned
                              ? "linear-gradient(135deg, #451a03, #78350f, #451a03)"
                              : "linear-gradient(135deg, #1c1208, #2d1f08)"
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
                          <div style={{
                            width: "5px", height: "5px", borderRadius: "99px",
                            background: hasDupe ? "#d97706" : "#3b82f6",
                          }} />
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
  );
}
