export type BoxType = "regular" | "amazon_orange" | "panini_exclusive" | "tin";
export type InputMethod = "manual" | "bulk" | "scan";
export type TradeStatus = "pending" | "accepted" | "declined" | "completed";
export type StickerType = "standard" | "special" | "coca_cola";
export type Variant = "standard" | "orange" | "blue" | "other";

export interface Team {
  code: string;
  name: string;
  group: string;
}

export interface Sticker {
  id: string;
  team_code: string;
  number: number;
  description: string;
  is_foil: boolean;
  sticker_type: StickerType;
}

export interface Box {
  id: string;
  user_id: string;
  box_type: BoxType;
  total_packs: number;
  purchased_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface PackLog {
  id: string;
  user_id: string;
  box_id: string | null;
  pack_number: number | null;
  input_method: InputMethod;
  sticker_ids: string[]; // e.g. ['ARG17', 'ARG2-ORANGE']
  new_count: number;
  opened_at: string;
}

export interface Collection {
  id: string;
  user_id: string;
  sticker_id: string;
  variant: Variant;
  quantity: number;
  first_obtained_at: string;
}

export interface Trade {
  id: string;
  offerer_id: string;
  receiver_id: string;
  offered_sticker: string;
  wanted_sticker: string;
  status: TradeStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
}

// View types
export interface UserCompletion {
  user_id: string;
  unique_collected: number;
  total_stickers: number;
  completion_pct: number;
}

export interface UserTeamCompletion {
  user_id: string;
  team_code: string;
  collected: number;
  total: number;
  pct: number;
}

// Parsed sticker reference: { id: 'ARG17', variant: 'standard' }
export interface StickerRef {
  id: string;
  variant: Variant;
}

/** Parse a sticker log entry like 'ARG2-ORANGE' into { id: 'ARG2', variant: 'orange' } */
export function parseStickerRef(raw: string): StickerRef {
  const parts = raw.toUpperCase().split("-");
  if (parts.length === 1) return { id: parts[0], variant: "standard" };
  const variantMap: Record<string, Variant> = {
    ORANGE: "orange",
    BLUE: "blue",
    STANDARD: "standard",
  };
  return {
    id: parts[0],
    variant: variantMap[parts[1]] ?? "other",
  };
}

/** Format a StickerRef back to string e.g. 'ARG2-ORANGE' or 'ARG17' */
export function formatStickerRef(ref: StickerRef): string {
  if (ref.variant === "standard") return ref.id;
  return `${ref.id}-${ref.variant.toUpperCase()}`;
}

export const BOX_TYPE_LABELS: Record<BoxType, string> = {
  regular: "Regular Box",
  amazon_orange: "Amazon (Orange Parallel)",
  panini_exclusive: "Panini Exclusive (Online)",
  tin: "Tin Starter Kit",
};

export const BOX_TYPE_PACKS: Record<BoxType, number> = {
  regular: 50,
  amazon_orange: 50,
  panini_exclusive: 50,
  tin: 25,
};
