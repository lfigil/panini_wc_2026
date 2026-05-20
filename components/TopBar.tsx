"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function TopBar({ displayName }: { displayName: string }) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#27272a] text-white h-14 flex items-center justify-between px-4 border-b border-zinc-700/50">
      <div className="flex items-center gap-2">
        <span className="text-xl">⚽</span>
        <span className="font-semibold text-sm text-zinc-100">Panini WC2026</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-zinc-400 text-xs">{displayName}</span>
        <button
          onClick={signOut}
          className="text-zinc-500 hover:text-zinc-200 text-xs transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
