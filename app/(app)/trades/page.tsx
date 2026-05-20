import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TradesClient from "@/components/TradesClient";

export default async function TradesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [tradesRes, profilesRes, dupesRes, stickersRes] = await Promise.all([
    supabase
      .from("trades")
      .select("*")
      .or(`offerer_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("*")
      .neq("id", user.id),
    supabase
      .from("user_duplicates")
      .select("sticker_id, variant, quantity, description, team_code, is_foil")
      .eq("user_id", user.id)
      .order("team_code"),
    supabase
      .from("stickers")
      .select("id, description, team_code"),
  ]);

  return (
    <TradesClient
      userId={user.id}
      profiles={profilesRes.data ?? []}
      trades={tradesRes.data ?? []}
      duplicates={dupesRes.data ?? []}
      stickers={stickersRes.data ?? []}
    />
  );
}
