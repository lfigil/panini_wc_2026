import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import SharePage from "@/components/SharePage";

// Public Supabase client — uses anon key, no auth session needed
function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "panini" } }
  );
}

export default async function UserSharePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const supabase = createPublicClient();
  const { username: rawUsername } = await params;
  const username = decodeURIComponent(rawUsername);

  // Look up profile by display_name
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .ilike("display_name", username)
    .single();

  if (!profile) notFound();

  const [stickersRes, collectionsRes] = await Promise.all([
    supabase.from("stickers").select("id, team_code, number, description, is_foil"),
    supabase
      .from("collections")
      .select("sticker_id, variant, quantity")
      .eq("user_id", profile.id),
  ]);

  const stickers = stickersRes.data ?? [];
  const collection = collectionsRes.data ?? [];

  // Build owned set and duplicates
  const ownedMap = new Map<string, { variant: string; quantity: number }[]>();
  for (const row of collection) {
    if (!ownedMap.has(row.sticker_id)) ownedMap.set(row.sticker_id, []);
    ownedMap.get(row.sticker_id)!.push(row);
  }

  const allStickerIds = stickers.map((s) => s.id);
  const ownedIds = new Set(ownedMap.keys());
  const missingIds = allStickerIds.filter((id) => !ownedIds.has(id));

  const duplicates = collection
    .filter((r) => r.quantity > 1)
    .map((r) => ({
      sticker_id: r.sticker_id,
      variant: r.variant,
      dupes: r.quantity - 1,
    }));

  const uniqueCollected = ownedIds.size;
  const completionPct = Math.round((uniqueCollected / allStickerIds.length) * 100);

  return (
    <SharePage
      displayName={profile.display_name}
      uniqueCollected={uniqueCollected}
      totalStickers={allStickerIds.length}
      completionPct={completionPct}
      missingIds={missingIds}
      duplicates={duplicates}
      stickers={stickers}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return {
    title: `${decodeURIComponent(username)}'s WC2026 Album`,
    description: "Panini World Cup 2026 sticker collection — trade list",
  };
}
