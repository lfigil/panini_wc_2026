import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function TradesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="px-4 py-8 max-w-lg mx-auto text-center">
      <div className="text-4xl mb-4">🔄</div>
      <h1 className="text-lg font-semibold text-gray-900 mb-2">Trades</h1>
      <p className="text-sm text-gray-500">
        Coming in Phase 6 — propose and manage 1-for-1 sticker swaps with your friends.
      </p>
    </div>
  );
}
