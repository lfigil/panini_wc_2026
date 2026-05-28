import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BOX_TYPE_LABELS, BoxType } from "@/lib/types";

export const revalidate = 10;

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [completionRes, teamRes, packsRes, dupeRes] = await Promise.all([
    supabase.from("user_completion").select("*").eq("user_id", user.id).single(),
    supabase.from("user_team_completion").select("*").eq("user_id", user.id).order("pct", { ascending: false }),
    supabase.from("pack_logs").select("id, new_count, opened_at, boxes(box_type)").eq("user_id", user.id).order("opened_at", { ascending: false }).limit(5),
    supabase.from("collections").select("quantity").eq("user_id", user.id),
  ]);

  const completion = completionRes.data;
  const teamCompletion = teamRes.data ?? [];
  const recentPacks = packsRes.data ?? [];
  const allCollection = dupeRes.data ?? [];

  const collected = completion?.unique_collected ?? 0;
  const total = completion?.total_stickers ?? 980;
  const pct = completion?.completion_pct ?? 0;
  const totalDuplicates = allCollection.reduce((sum, r) => sum + Math.max(0, r.quantity - 1), 0);
  const fullTeams = teamCompletion.filter(t => t.pct === 100).length;
  const inProgress = teamCompletion.filter(t => t.pct > 0 && t.pct < 100).length;

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

      {/* Main progress card */}
      <div className="bg-[#27272a] rounded-2xl p-5 border border-zinc-700/50">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Collection progress</p>
            <p className="text-3xl font-bold text-zinc-50 mt-0.5">
              {collected}
              <span className="text-base font-normal text-zinc-500"> / {total}</span>
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-blue-400">{pct}%</span>
            <p className="text-xs text-zinc-500">{total - collected} missing</p>
          </div>
        </div>
        <div className="w-full bg-zinc-700 rounded-full h-2.5">
          <div className="bg-blue-500 h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#27272a] rounded-xl p-4 text-center border border-zinc-700/50">
          <p className="text-2xl font-bold text-green-400">{fullTeams}</p>
          <p className="text-xs text-zinc-500 mt-1">Complete teams</p>
        </div>
        <div className="bg-[#27272a] rounded-xl p-4 text-center border border-zinc-700/50">
          <p className="text-2xl font-bold text-amber-400">{inProgress}</p>
          <p className="text-xs text-zinc-500 mt-1">Teams in progress</p>
        </div>
        <div className="bg-[#27272a] rounded-xl p-4 text-center border border-zinc-700/50">
          <p className="text-2xl font-bold text-blue-400">{recentPacks.length}</p>
          <p className="text-xs text-zinc-500 mt-1">Recent packs</p>
        </div>
        <div className="bg-[#27272a] rounded-xl p-4 text-center border border-zinc-700/50">
          <p className="text-2xl font-bold text-rose-400">{totalDuplicates}</p>
          <p className="text-xs text-zinc-500 mt-1">Duplicates</p>
        </div>
      </div>

      {/* Recent packs */}
      {recentPacks.length > 0 && (
        <div className="bg-[#27272a] rounded-2xl p-5 border border-zinc-700/50">
          <h2 className="text-sm font-semibold text-zinc-200 mb-3">Recent packs</h2>
          <div className="space-y-2">
            {recentPacks.map((p) => {
              const boxType = (Array.isArray(p.boxes) ? p.boxes[0] : p.boxes as { box_type: string } | null)?.box_type;
              return (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-zinc-700 last:border-0">
                  <div>
                    <p className="text-xs font-medium text-zinc-200">
                      {boxType ? BOX_TYPE_LABELS[boxType as BoxType] : "Loose pack"}
                    </p>
                    <p className="text-xs text-zinc-500">{new Date(p.opened_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    p.new_count > 4 ? "bg-green-900/50 text-green-400"
                    : p.new_count > 2 ? "bg-blue-900/50 text-blue-400"
                    : "bg-zinc-700 text-zinc-400"
                  }`}>
                    {p.new_count} new
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Teams breakdown */}
      {teamCompletion.length > 0 && (
        <div className="bg-[#27272a] rounded-2xl p-5 border border-zinc-700/50">
          <h2 className="text-sm font-semibold text-zinc-200 mb-4">Teams breakdown</h2>
          <div className="space-y-2.5">
            {teamCompletion.map((t) => (
              <div key={t.team_code}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-zinc-300 font-medium">{t.team_code}</span>
                  <span className="text-xs text-zinc-500">{t.collected}/20</span>
                </div>
                <div className="w-full bg-zinc-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${t.pct === 100 ? "bg-green-400" : "bg-blue-500"}`}
                    style={{ width: `${t.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {collected === 0 && (
        <div className="bg-blue-950/50 border border-blue-800 rounded-2xl p-5 text-center">
          <p className="text-2xl mb-2">📦</p>
          <p className="text-sm font-medium text-blue-300">No stickers yet</p>
          <p className="text-xs text-blue-500 mt-1">Head to Packs to log your first pack</p>
        </div>
      )}
    </div>
  );
}
