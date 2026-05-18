import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AlbumGrid from "@/components/AlbumGrid";

export default async function AlbumPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: teams }, { data: stickers }, { data: collection }] =
    await Promise.all([
      supabase.schema("panini").from("teams").select("*").order("name"),
      supabase.schema("panini").from("stickers").select("*").order("number"),
      supabase
        .schema("panini")
        .from("collections")
        .select("sticker_id, variant, quantity")
        .eq("user_id", user.id),
    ]);

  return (
    <AlbumGrid
      teams={teams ?? []}
      stickers={stickers ?? []}
      collection={collection ?? []}
    />
  );
}
