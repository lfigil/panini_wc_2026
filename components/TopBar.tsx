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
    <header className="fixed top-0 left-0 right-0 z-50 bg-blue-900 text-white h-14 flex items-center justify-between px-4 shadow-md">
      <div className="flex items-center gap-2">
        <span className="text-xl">⚽</span>
        <span className="font-semibold text-sm">Panini WC2026</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-blue-200 text-xs">{displayName}</span>
        <button
          onClick={signOut}
          className="text-blue-300 hover:text-white text-xs transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
