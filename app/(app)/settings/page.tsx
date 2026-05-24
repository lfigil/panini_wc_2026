import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SettingsClient from "@/components/SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  // Count current data for the reset confirmation UI
  const [{ count: packCount }, { count: collectionCount }, { count: boxCount }] =
    await Promise.all([
      supabase.from("pack_logs").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("collections").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("boxes").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://panini.lfigil.com";

  return (
    <SettingsClient
      email={user.email ?? ""}
      displayName={profile?.display_name ?? ""}
      appUrl={appUrl}
      stats={{
        packs: packCount ?? 0,
        stickers: collectionCount ?? 0,
        boxes: boxCount ?? 0,
      }}
    />
  );
}
