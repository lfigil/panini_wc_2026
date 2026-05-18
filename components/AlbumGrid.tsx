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

export default function AlbumGrid({ teams, stickers, collection }: Props) {
  const [selectedTeam, setSelectedTeam] = useState<string>(teams[0]?.code ?? "");
  const [search, setSearch] = useState("");

  // Build a lookup: sticker_id -> rows[]
  const owned = useMemo(() => {
    const map = new Map<string, CollectionRow[]>();
    for (const row of collection) {
      if (!map.has(row.sticker_id)) map.set(row.sticker_id, []);
      map.get(row.sticker_id)!.push(row);
    }
    return map;
  }, [collection]);

  const filteredTeams = useMemo(() => {
    if (!search) return teams;
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.code.toLowerCase().includes(search.toLowerCase())
    );
  }, [teams, search]);

  const teamStickers = useMemo(
    () => stickers.filter((s) => s.team_code === selectedTeam),
    [stickers, selectedTeam]
  );

  const teamCollected = useMemo(
    () => teamStickers.filter((s) => owned.has(s.id)).length,
    [teamStickers, owned]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="sticky top-14 z-10 bg-white border-b border-gray-100 px-4 py-2">
        <input
          type="text"
          placeholder="Search teams…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg bg-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Team sidebar */}
        <div className="w-20 flex-shrink-0 bg-white border-r border-gray-100 overflow-y-auto">
          {filteredTeams.map((team) => {
            const ts = stickers.filter((s) => s.team_code === team.code);
            const tc = ts.filter((s) => owned.has(s.id)).length;
            const isComplete = tc === ts.length && ts.length > 0;
            const active = selectedTeam === team.code;

            return (
              <button
                key={team.code}
                onClick={() => setSelectedTeam(team.code)}
                className={`w-full px-2 py-3 text-center border-b border-gray-50 transition-colors ${
                  active
                    ? "bg-blue-50 border-l-2 border-l-blue-600"
                    : "hover:bg-gray-50"
                }`}
              >
                <p className={`text-xs font-bold ${active ? "text-blue-700" : "text-gray-700"}`}>
                  {team.code}
                </p>
                <p className={`text-xs mt-0.5 ${isComplete ? "text-green-600" : "text-gray-400"}`}>
                  {tc}/{ts.length}
                </p>
              </button>
            );
          })}
        </div>

        {/* Sticker grid */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {/* Team header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">
                {teams.find((t) => t.code === selectedTeam)?.name}
              </h2>
              <p className="text-xs text-gray-500">
                {teamCollected}/{teamStickers.length} collected ·{" "}
                Group {teams.find((t) => t.code === selectedTeam)?.group}
              </p>
            </div>
            <div className="text-right">
              <span
                className={`text-xs font-bold ${
                  teamCollected === teamStickers.length
                    ? "text-green-600"
                    : "text-blue-600"
                }`}
              >
                {teamStickers.length > 0
                  ? Math.round((teamCollected / teamStickers.length) * 100)
                  : 0}
                %
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
            <div
              className={`h-1.5 rounded-full ${
                teamCollected === teamStickers.length ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{
                width: `${teamStickers.length > 0 ? (teamCollected / teamStickers.length) * 100 : 0}%`,
              }}
            />
          </div>

          {/* Stickers */}
          <div className="grid grid-cols-4 gap-2">
            {teamStickers.map((sticker) => {
              const ownedRows = owned.get(sticker.id) ?? [];
              const isOwned = ownedRows.length > 0;
              const totalQty = ownedRows.reduce((s, r) => s + r.quantity, 0);
              const hasDupe = totalQty > 1;
              const variants = ownedRows.map((r) => r.variant).filter((v) => v !== "standard");

              return (
                <div
                  key={sticker.id}
                  className={`relative rounded-xl p-2 text-center border transition-all ${
                    isOwned
                      ? "bg-blue-50 border-blue-200"
                      : "bg-white border-gray-200 opacity-50"
                  }`}
                >
                  {/* Dupe badge */}
                  {hasDupe && (
                    <div className="absolute -top-1 -right-1 bg-amber-400 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {totalQty}
                    </div>
                  )}
                  {/* Foil indicator */}
                  {sticker.is_foil && (
                    <div className="absolute top-1 left-1 text-xs">✨</div>
                  )}
                  <p className="text-xs font-bold text-gray-700">{sticker.number}</p>
                  <p className="text-xs text-gray-500 leading-tight mt-0.5 truncate">
                    {sticker.description.length > 10
                      ? sticker.description.split(" ")[0]
                      : sticker.description}
                  </p>
                  {/* Variant pills */}
                  {variants.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-0.5 justify-center">
                      {variants.map((v) => (
                        <span
                          key={v}
                          className={`text-xs px-1 rounded font-medium ${
                            v === "orange"
                              ? "bg-orange-100 text-orange-700"
                              : v === "blue"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {v[0].toUpperCase()}
                        </span>
                      ))}
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
