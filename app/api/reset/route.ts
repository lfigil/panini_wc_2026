import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body.confirm !== "RESET") {
      return NextResponse.json({ error: "Invalid confirmation" }, { status: 400 });
    }

    // Delete in order to respect foreign key constraints
    // pack_logs first (references boxes), then boxes, then collections
    const [packErr, boxErr, colErr] = await Promise.all([
      supabase.from("pack_logs").delete().eq("user_id", user.id),
      supabase.from("boxes").delete().eq("user_id", user.id),
      supabase.from("collections").delete().eq("user_id", user.id),
    ]);

    if (packErr.error) throw packErr.error;
    if (boxErr.error) throw boxErr.error;
    if (colErr.error) throw colErr.error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Reset error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reset failed" },
      { status: 500 }
    );
  }
}
