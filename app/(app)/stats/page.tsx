import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import StatsClient from "@/components/StatsClient";

export const revalidate = 10; // reuse cached render for 10 seconds


export default async function StatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [packLogsRes, boxesRes, collectionRes, completionRes, stickersRes] = await Promise.all([
    supabase
      .from("pack_logs")
      .select("id, new_count, opened_at, box_id, sticker_ids")
      .eq("user_id", user.id)
      .order("opened_at", { ascending: true }),
    supabase
      .from("boxes")
      .select("id, box_type, total_packs, created_at")
      .eq("user_id", user.id),
    // Full collection with sticker_id, variant, quantity for detailed stats
    supabase
      .from("collections")
      .select("sticker_id, variant, quantity")
      .eq("user_id", user.id),
    supabase
      .from("user_completion")
      .select("unique_collected, total_stickers, completion_pct")
      .eq("user_id", user.id)
      .single(),
    // Stickers master for foil info
    supabase
      .from("stickers")
      .select("id, is_foil, team_code"),
  ]);

  return (
    <StatsClient
      packLogs={packLogsRes.data ?? []}
      boxes={boxesRes.data ?? []}
      collection={collectionRes.data ?? []}
      completion={completionRes.data ?? { unique_collected: 0, total_stickers: 980, completion_pct: 0 }}
      stickers={stickersRes.data ?? []}
    />
  );
}
