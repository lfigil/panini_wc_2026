import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { question, context } = body as {
      question: string;
      context: {
        totalPacks: number;
        totalBoxes: number;
        uniqueCollected: number;
        totalStickers: number;
        completionPct: number;
        remaining: number;
        avgNewPerPack: number;
        totalDuplicates: number;
        boxBreakdown: { type: string; packs: number; avgNew: number; remaining: number }[];
        totalPacksInAllBoxes: number;
        packsRemainingInBoxes: number;
        projectedFromBoxes: number;
      };
    };

    const systemPrompt = `You are a Panini World Cup 2026 sticker collection expert assistant. 
You help collectors understand their progress, estimate what they need to complete their album, 
and make smart decisions about buying boxes and trading.

The album has ${context.totalStickers} unique stickers total.
The mathematical expected packs to complete alone (coupon collector's problem) is ~1,045 packs.

You have access to the user's real collection data. Give specific, personalized advice based on their numbers.
Be concise — 3-5 sentences max unless the question needs more detail. Use numbers where helpful.
Be honest about uncertainty — projections are estimates based on current trends.`;

    const userMessage = `My collection data:
- Packs opened: ${context.totalPacks}
- Unique stickers: ${context.uniqueCollected} / ${context.totalStickers} (${context.completionPct}%)
- Still missing: ${context.remaining} stickers
- Average new stickers per pack: ${context.avgNewPerPack}
- Duplicates available to trade: ${context.totalDuplicates}
- Total boxes owned: ${context.totalBoxes}
- Total packs across all my boxes: ${context.totalPacksInAllBoxes}
- Packs still unopened in my boxes: ${context.packsRemainingInBoxes}
- Projected unique stickers if I finish all my boxes: ${context.projectedFromBoxes}
- Box breakdown: ${context.boxBreakdown.map(b => `${b.type} (${b.packs} opened, avg ${b.avgNew} new/pack, ${b.remaining} packs left)`).join(", ")}

My question: ${question}`;

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ answer: text });

  } catch (err: unknown) {
    console.error("AI route error:", err);
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `AI error: ${err.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Failed to get AI response" }, { status: 500 });
  }
}
