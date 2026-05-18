import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get profile
  const { data: profile } = await supabase
    .from("panini.profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <TopBar displayName={profile?.display_name ?? user.email ?? "Collector"} />
      <main className="flex-1 pb-20 pt-14">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
