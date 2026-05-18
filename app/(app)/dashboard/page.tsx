import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Overall completion
  const { data: completion } = await supabase
    .schema("panini")
    .from("user_completion")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // Per-team completion
  const { data: teamCompletion } = await supabase
    .schema("panini")
    .from("user_team_completion")
    .select("*")
    .eq("user_id", user.id)
    .order("pct", { ascending: false });

  // Recent packs
  const { data: recentPacks } = await supabase
    .schema("panini")
    .from("pack_logs")
    .select("*, boxes(box_type)")
    .eq("user_id", user.id)
    .order("opened_at", { ascending: false })
    .limit(5);

  const collected = completion?.unique_collected ?? 0;
  const total = completion?.total_stickers ?? 980;
  const pct = completion?.completion_pct ?? 0;

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
      {/* Overall progress */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Overall progress</p>
            <p className="text-3xl font-bold text-gray-900 mt-0.5">
              {collected}
              <span className="text-base font-normal text-gray-400"> / {total}</span>
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-blue-600">{pct}%</span>
            <p className="text-xs text-gray-400">{total - collected} missing</p>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
          <p className="text-xl font-bold text-gray-900">{recentPacks?.length ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">Recent packs</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
          <p className="text-xl font-bold text-blue-600">
            {teamCompletion?.filter(t => t.pct === 100).length ?? 0}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Full teams</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
          <p className="text-xl font-bold text-amber-500">
            {teamCompletion?.filter(t => t.pct > 0 && t.pct < 100).length ?? 0}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">In progress</p>
        </div>
      </div>

      {/* Teams progress */}
      {teamCompletion && teamCompletion.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Teams</h2>
          <div className="space-y-2.5">
            {teamCompletion.map((t) => (
              <div key={t.team_code}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-700 font-medium">{t.team_code}</span>
                  <span className="text-xs text-gray-400">{t.collected}/20</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      t.pct === 100 ? "bg-green-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${t.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {collected === 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center">
          <p className="text-2xl mb-2">📦</p>
          <p className="text-sm font-medium text-blue-900">No stickers yet</p>
          <p className="text-xs text-blue-600 mt-1">Head to Packs to log your first pack</p>
        </div>
      )}
    </div>
  );
}
