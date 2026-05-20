import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import StatsClient from "@/components/StatsClient";

export default async function StatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [packLogsRes, boxesRes, collectionRes, completionRes] = await Promise.all([
    // All pack logs with box info, ordered by time
    supabase
      .from("pack_logs")
      .select("id, new_count, opened_at, box_id, sticker_ids")
      .eq("user_id", user.id)
      .order("opened_at", { ascending: true }),

    // All boxes
    supabase
      .from("boxes")
      .select("id, box_type, total_packs, created_at")
      .eq("user_id", user.id),

    // Collection for duplicate count
    supabase
      .from("collections")
      .select("quantity")
      .eq("user_id", user.id),

    // Overall completion
    supabase
      .from("user_completion")
      .select("unique_collected, total_stickers, completion_pct")
      .eq("user_id", user.id)
      .single(),
  ]);

  return (
    <StatsClient
      packLogs={packLogsRes.data ?? []}
      boxes={boxesRes.data ?? []}
      collection={collectionRes.data ?? []}
      completion={completionRes.data ?? { unique_collected: 0, total_stickers: 980, completion_pct: 0 }}
    />
  );
}
