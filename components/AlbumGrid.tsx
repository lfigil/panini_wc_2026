"use client";

import { useState, useMemo } from "react";
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

// Variant color config
const VARIANT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  orange: { bg: "bg-orange-100", text: "text-orange-700", label: "ORA" },
  blue:   { bg: "bg-blue-100",   text: "text-blue-700",   label: "BLU" },
  other:  { bg: "bg-gray-100",   text: "text-gray-600",   label: "ALT" },
};

export default function AlbumGrid({ teams, stickers, collection }: Props) {
  // FWC first, then alphabetical
  const sortedTeams = useMemo(() => {
    const fwc = teams.filter(t => t.code === "FWC");
    const rest = teams.filter(t => t.code !== "FWC").sort((a, b) => a.code.localeCompare(b.code));
    return [...fwc, ...rest];
  }, [teams]);

  const [selectedTeam, setSelectedTeam] = useState<string>(sortedTeams[0]?.code ?? "");
  const [search, setSearch] = useState("");

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
    return sortedTeams.filter(
      t => t.name.toLowerCase().includes(search.toLowerCase()) ||
           t.code.toLowerCase().includes(search.toLowerCase())
    );
  }, [sortedTeams, search]);

  const teamStickers = useMemo(
    () => stickers.filter(s => s.team_code === selectedTeam).sort((a, b) => a.number - b.number),
    [stickers, selectedTeam]
  );

  const teamCollected = useMemo(
    () => teamStickers.filter(s => owned.has(s.id)).length,
    [teamStickers, owned]
  );

  const currentTeam = teams.find(t => t.code === selectedTeam);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 7.5rem)" }}>
      {/* Search bar */}
      <div className="bg-white border-b border-gray-100 px-3 py-2">
        <input
          type="text"
          placeholder="Search teams..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg bg-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
        />
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Team sidebar — independently scrollable */}
        <div style={{ width: "64px", flexShrink: 0, overflowY: "auto", background: "white", borderRight: "1px solid #f3f4f6" }}>
          {filteredTeams.map(team => {
            const ts = stickers.filter(s => s.team_code === team.code);
            const tc = ts.filter(s => owned.has(s.id)).length;
            const isComplete = tc === ts.length && ts.length > 0;
            const active = selectedTeam === team.code;
            const isFWC = team.code === "FWC";

            return (
              <button
                key={team.code}
                onClick={() => setSelectedTeam(team.code)}
                style={{
                  width: "100%",
                  padding: "10px 4px",
                  textAlign: "center",
                  borderBottom: "1px solid #f9fafb",
                  borderLeft: active ? "3px solid #2563eb" : "3px solid transparent",
                  background: active ? "#eff6ff" : isFWC ? "#fefce8" : "white",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
              >
                <p style={{ fontSize: "11px", fontWeight: 700, color: active ? "#1d4ed8" : isFWC ? "#92400e" : "#374151", lineHeight: 1 }}>
                  {team.code}
                </p>
                <p style={{ fontSize: "10px", color: isComplete ? "#16a34a" : "#9ca3af", marginTop: "2px" }}>
                  {tc}/{ts.length}
                </p>
              </button>
            );
          })}
        </div>

        {/* Sticker grid — independently scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          {/* Team header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">{currentTeam?.name}</h2>
              <p className="text-xs text-gray-500">
                {teamCollected}/{teamStickers.length} collected
                {currentTeam?.group ? ` · Group ${currentTeam.group}` : ""}
              </p>
            </div>
            <span className={`text-sm font-bold ${teamCollected === teamStickers.length ? "text-green-600" : "text-blue-600"}`}>
              {teamStickers.length > 0 ? Math.round(teamCollected / teamStickers.length * 100) : 0}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
            <div
              className={`h-1.5 rounded-full ${teamCollected === teamStickers.length ? "bg-green-500" : "bg-blue-500"}`}
              style={{ width: `${teamStickers.length > 0 ? teamCollected / teamStickers.length * 100 : 0}%` }}
            />
          </div>

          {/* Sticker cards — 4 columns */}
          <div className="grid grid-cols-4 gap-1.5">
            {teamStickers.map(sticker => {
              const ownedRows = owned.get(sticker.id) ?? [];
              const isOwned = ownedRows.length > 0;
              const totalQty = ownedRows.reduce((s, r) => s + r.quantity, 0);
              const hasDupe = totalQty > 1;
              const variants = ownedRows.map(r => r.variant).filter(v => v !== "standard");

              return (
                <div
                  key={sticker.id}
                  className={`relative rounded-lg border text-center transition-all ${
                    isOwned ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200"
                  }`}
                  style={{ padding: "6px 4px", opacity: isOwned ? 1 : 0.45 }}
                >
                  {/* Dupe badge */}
                  {hasDupe && (
                    <div className="absolute -top-1 -right-1 bg-amber-400 text-white rounded-full flex items-center justify-center font-bold"
                         style={{ width: "16px", height: "16px", fontSize: "9px" }}>
                      {totalQty}
                    </div>
                  )}
                  {/* Foil — small gold diamond pill instead of emoji */}
                  {sticker.is_foil && (
                    <div className="absolute top-0.5 left-0.5 bg-yellow-400 text-yellow-900 rounded"
                         style={{ fontSize: "8px", fontWeight: 700, padding: "1px 3px", lineHeight: 1.2 }}>
                      FOIL
                    </div>
                  )}
                  {/* Sticker ID — primary info */}
                  <p className={`font-bold font-mono ${isOwned ? "text-blue-700" : "text-gray-500"}`}
                     style={{ fontSize: "11px" }}>
                    {sticker.id}
                  </p>
                  {/* Variant pills */}
                  {variants.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                      {variants.map(v => {
                        const style = VARIANT_STYLES[v] ?? VARIANT_STYLES.other;
                        return (
                          <span key={v} className={`${style.bg} ${style.text} rounded`}
                                style={{ fontSize: "8px", fontWeight: 700, padding: "1px 3px" }}>
                            {style.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
