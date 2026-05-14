-- ─── Competitive Quiz Schema ──────────────────────────────────────────────────
-- Run in Supabase SQL Editor AFTER auth_schema.sql (user_profiles must exist).

-- ─── Friendships ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS friendships (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  addressee_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  status       text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   timestamptz DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friendships_select" ON friendships;
CREATE POLICY "friendships_select" ON friendships
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "friendships_insert" ON friendships;
CREATE POLICY "friendships_insert" ON friendships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "friendships_update" ON friendships;
CREATE POLICY "friendships_update" ON friendships
  FOR UPDATE USING (auth.uid() = addressee_id);

-- ─── Match Rooms ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS match_rooms (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code              text UNIQUE NOT NULL,
  host_id                uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  invited_user_id        uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  document_id            text,
  status                 text DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
  quiz_snapshot          jsonb NOT NULL,
  current_question_index integer DEFAULT 0,
  total_questions        integer NOT NULL,
  started_at             timestamptz,
  completed_at           timestamptz,
  created_at             timestamptz DEFAULT now()
);

-- Migration: add invited_user_id if table already exists
ALTER TABLE match_rooms ADD COLUMN IF NOT EXISTS invited_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS match_rooms_room_code_idx        ON match_rooms(room_code);
CREATE INDEX IF NOT EXISTS match_rooms_host_id_idx          ON match_rooms(host_id);
CREATE INDEX IF NOT EXISTS match_rooms_invited_user_id_idx  ON match_rooms(invited_user_id);

ALTER TABLE match_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_rooms_select" ON match_rooms;
CREATE POLICY "match_rooms_select" ON match_rooms FOR SELECT USING (true);

DROP POLICY IF EXISTS "match_rooms_insert" ON match_rooms;
CREATE POLICY "match_rooms_insert" ON match_rooms FOR INSERT WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "match_rooms_update" ON match_rooms;
CREATE POLICY "match_rooms_update" ON match_rooms FOR UPDATE USING (true);

-- ─── Match Participants ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS match_participants (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id   uuid REFERENCES match_rooms(id) ON DELETE CASCADE,
  user_id   uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  score     integer DEFAULT 0,
  is_ready  boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS match_participants_room_id_idx ON match_participants(room_id);

ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_participants_select" ON match_participants;
CREATE POLICY "match_participants_select" ON match_participants FOR SELECT USING (true);

DROP POLICY IF EXISTS "match_participants_insert" ON match_participants;
CREATE POLICY "match_participants_insert" ON match_participants FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "match_participants_update" ON match_participants;
CREATE POLICY "match_participants_update" ON match_participants FOR UPDATE USING (true);

-- ─── Match Answers ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS match_answers (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id        uuid REFERENCES match_rooms(id) ON DELETE CASCADE,
  question_index integer NOT NULL,
  user_id        uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  answer         text NOT NULL,
  is_correct     boolean NOT NULL,
  got_point      boolean DEFAULT false,
  answered_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_answers_room_question_idx ON match_answers(room_id, question_index);

ALTER TABLE match_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_answers_select" ON match_answers;
CREATE POLICY "match_answers_select" ON match_answers FOR SELECT USING (true);

DROP POLICY IF EXISTS "match_answers_insert" ON match_answers;
CREATE POLICY "match_answers_insert" ON match_answers FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── Realtime ─────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE match_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE match_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE match_answers;
