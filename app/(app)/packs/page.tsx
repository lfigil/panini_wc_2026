import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PacksClient from "@/components/PacksClient";

export const revalidate = 10; // reuse cached render for 10 seconds


export default async function PacksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: boxes }, { data: packLogs }, { data: stickers }] =
    await Promise.all([
      supabase
        .from("boxes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("pack_logs")
        .select("*, boxes(box_type)")
        .eq("user_id", user.id)
        .order("opened_at", { ascending: false })
        .limit(50),
      supabase.from("stickers").select("id,description,team_code"),
    ]);

  return (
    <PacksClient
      userId={user.id}
      boxes={boxes ?? []}
      packLogs={packLogs ?? []}
      stickers={stickers ?? []}
    />
  );
}
