import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// IMPORTANT: The ANTHROPIC_API_KEY env var is read server-side only.
// It is never sent to the browser or included in any client bundle.

export async function POST(request: NextRequest) {
  // Auth check — must be a logged-in user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set in your Coolify environment variables. Add it and redeploy." },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Convert to base64
    const buffer = await imageFile.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mediaType = (imageFile.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif") || "image/jpeg";

    // Call Claude API server-side
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: `You are reading the back of Panini World Cup 2026 sticker cards.
Each sticker has a small ID code printed on its back, like ARG17, ESP15, MEX3, BRA8, FWC1, etc.
The format is always: 2-3 uppercase letters (team code) followed by a number (1-20).

Look carefully at all stickers in the image and extract every sticker ID you can see.

If a sticker has a color/variant label (like ORANGE, BLUE), append it with a dash: ARG2-ORANGE.

Return ONLY a JSON object with a single key "sticker_ids" containing an array of the IDs you found.
Example: {"sticker_ids": ["ARG17", "ESP15", "MEX3-ORANGE", "BRA8", "FRA7", "GER11", "USA16"]}

Do not include any other text, explanation, or markdown. JSON only.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", err);
      return NextResponse.json(
        { error: "Failed to scan image" },
        { status: 502 }
      );
    }

    const claudeData = await response.json();
    const text = claudeData.content?.[0]?.text ?? "{}";

    // Parse the JSON response
    let stickerIds: string[] = [];
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      stickerIds = (parsed.sticker_ids ?? []).map((s: string) =>
        s.toUpperCase().trim()
      );
    } catch {
      return NextResponse.json(
        { error: "Could not parse sticker IDs from image. Please enter manually." },
        { status: 422 }
      );
    }

    return NextResponse.json({ sticker_ids: stickerIds });
  } catch (err) {
    console.error("Scan route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
