-- ============================================================
-- PANINI WC2026 — Supabase SQL
-- Run this in your Supabase SQL editor.
-- All tables are scoped to the `panini` schema so they
-- don't collide with your other projects in the same DB.
-- ============================================================

-- Create the schema
CREATE SCHEMA IF NOT EXISTS panini;

-- Expose it to PostgREST (needed for Supabase client access)
GRANT USAGE ON SCHEMA panini TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA panini
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE panini.box_type AS ENUM (
  'regular',
  'amazon_orange',
  'panini_exclusive',
  'tin'
);

CREATE TYPE panini.input_method AS ENUM (
  'manual',
  'bulk',
  'scan'
);

CREATE TYPE panini.trade_status AS ENUM (
  'pending',
  'accepted',
  'declined',
  'completed'
);

CREATE TYPE panini.sticker_type AS ENUM (
  'standard',
  'special',
  'coca_cola'
);

-- ============================================================
-- TEAMS
-- ============================================================

CREATE TABLE panini.teams (
  code        TEXT PRIMARY KEY,         -- e.g. 'ARG'
  name        TEXT NOT NULL,            -- e.g. 'Argentina'
  "group"     TEXT                      -- tournament group A–L
);

-- ============================================================
-- STICKERS (master list — seeded once, never changes)
-- ============================================================

CREATE TABLE panini.stickers (
  id            TEXT PRIMARY KEY,        -- e.g. 'ARG17'
  team_code     TEXT NOT NULL REFERENCES panini.teams(code),
  number        INT NOT NULL,            -- 1–20 within team
  description   TEXT NOT NULL,          -- player name or label
  is_foil       BOOLEAN NOT NULL DEFAULT false,
  sticker_type  panini.sticker_type NOT NULL DEFAULT 'standard'
);

CREATE INDEX idx_stickers_team ON panini.stickers(team_code);

-- ============================================================
-- BOXES (a physical box you bought)
-- ============================================================

CREATE TABLE panini.boxes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  box_type      panini.box_type NOT NULL,
  total_packs   INT NOT NULL DEFAULT 50,
  purchased_at  DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boxes_user ON panini.boxes(user_id);

-- ============================================================
-- PACK LOGS (one row per pack opened)
-- ============================================================

CREATE TABLE panini.pack_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  box_id        UUID REFERENCES panini.boxes(id) ON DELETE SET NULL,
  pack_number   INT,                     -- 1–50 within box; NULL for loose packs
  input_method  panini.input_method NOT NULL DEFAULT 'manual',
  -- sticker_ids stores entries like 'ARG17', 'ARG2-ORANGE', 'ESP15-BLUE'
  sticker_ids   TEXT[] NOT NULL,
  new_count     INT NOT NULL DEFAULT 0,  -- computed on insert via trigger
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- enforce exactly 7 stickers per pack log
  CONSTRAINT pack_must_have_7 CHECK (array_length(sticker_ids, 1) = 7),
  -- pack number must be positive if set
  CONSTRAINT pack_number_positive CHECK (pack_number IS NULL OR pack_number > 0)
);

CREATE INDEX idx_pack_logs_user ON panini.pack_logs(user_id);
CREATE INDEX idx_pack_logs_box ON panini.pack_logs(box_id);
CREATE INDEX idx_pack_logs_opened ON panini.pack_logs(opened_at);

-- ============================================================
-- COLLECTIONS (one row per user × sticker × variant)
-- ============================================================

CREATE TABLE panini.collections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_id        TEXT NOT NULL REFERENCES panini.stickers(id),
  variant           TEXT NOT NULL DEFAULT 'standard', -- 'standard','orange','blue','other'
  quantity          INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  first_obtained_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- one row per user + sticker + variant combination
  UNIQUE (user_id, sticker_id, variant)
);

CREATE INDEX idx_collections_user ON panini.collections(user_id);
CREATE INDEX idx_collections_sticker ON panini.collections(sticker_id);

-- ============================================================
-- TRADES (1-for-1 only)
-- ============================================================

CREATE TABLE panini.trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offerer_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- stored as 'ARG2-BLUE' or just 'ARG17' (standard implied)
  offered_sticker TEXT NOT NULL,
  wanted_sticker  TEXT NOT NULL,
  status          panini.trade_status NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT no_self_trade CHECK (offerer_id <> receiver_id)
);

CREATE INDEX idx_trades_offerer ON panini.trades(offerer_id);
CREATE INDEX idx_trades_receiver ON panini.trades(receiver_id);
CREATE INDEX idx_trades_status ON panini.trades(status);

-- ============================================================
-- USER PROFILES (display names, linked to auth.users)
-- ============================================================

CREATE TABLE panini.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TRIGGER: auto-update trades.updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION panini.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trades_updated_at
  BEFORE UPDATE ON panini.trades
  FOR EACH ROW EXECUTE FUNCTION panini.set_updated_at();

-- ============================================================
-- TRIGGER: create profile on new user signup
-- ============================================================

CREATE OR REPLACE FUNCTION panini.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO panini.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION panini.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- teams + stickers: public read, no writes from client
ALTER TABLE panini.teams    ENABLE ROW LEVEL SECURITY;
ALTER TABLE panini.stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE panini.boxes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE panini.pack_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE panini.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE panini.trades   ENABLE ROW LEVEL SECURITY;
ALTER TABLE panini.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read teams and stickers
CREATE POLICY "teams_read" ON panini.teams
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "stickers_read" ON panini.stickers
  FOR SELECT TO authenticated USING (true);

-- Profiles: users can read all (for trade UI), only edit own
CREATE POLICY "profiles_read" ON panini.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own" ON panini.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Boxes: users can only see and manage their own
CREATE POLICY "boxes_own" ON panini.boxes
  FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Pack logs: users can only see and manage their own
CREATE POLICY "pack_logs_own" ON panini.pack_logs
  FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Collections: users see their own; others can see for trade matching
CREATE POLICY "collections_own_write" ON panini.collections
  FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "collections_read_all" ON panini.collections
  FOR SELECT TO authenticated USING (true);

-- Trades: involved parties can read; only offerer can create
CREATE POLICY "trades_read" ON panini.trades
  FOR SELECT TO authenticated
  USING (auth.uid() = offerer_id OR auth.uid() = receiver_id);

CREATE POLICY "trades_insert" ON panini.trades
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = offerer_id);

CREATE POLICY "trades_update" ON panini.trades
  FOR UPDATE TO authenticated
  USING (auth.uid() = offerer_id OR auth.uid() = receiver_id);

-- ============================================================
-- HELPER VIEWS
-- ============================================================

-- How many unique stickers each user has collected (for progress)
CREATE OR REPLACE VIEW panini.user_completion AS
SELECT
  c.user_id,
  COUNT(DISTINCT c.sticker_id) AS unique_collected,
  (SELECT COUNT(*) FROM panini.stickers) AS total_stickers,
  ROUND(
    COUNT(DISTINCT c.sticker_id)::numeric /
    (SELECT COUNT(*) FROM panini.stickers) * 100, 1
  ) AS completion_pct
FROM panini.collections c
GROUP BY c.user_id;

-- Per-team completion per user
CREATE OR REPLACE VIEW panini.user_team_completion AS
SELECT
  c.user_id,
  s.team_code,
  COUNT(DISTINCT c.sticker_id) AS collected,
  20 AS total,
  ROUND(COUNT(DISTINCT c.sticker_id)::numeric / 20 * 100, 1) AS pct
FROM panini.collections c
JOIN panini.stickers s ON s.id = c.sticker_id
GROUP BY c.user_id, s.team_code;

-- Stickers with quantity > 1 = available to trade
CREATE OR REPLACE VIEW panini.user_duplicates AS
SELECT
  c.user_id,
  c.sticker_id,
  c.variant,
  c.quantity,
  s.description,
  s.team_code,
  s.is_foil
FROM panini.collections c
JOIN panini.stickers s ON s.id = c.sticker_id
WHERE c.quantity > 1;

GRANT SELECT ON panini.user_completion TO authenticated;
GRANT SELECT ON panini.user_team_completion TO authenticated;
GRANT SELECT ON panini.user_duplicates TO authenticated;
