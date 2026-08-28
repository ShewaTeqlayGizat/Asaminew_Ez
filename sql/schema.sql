-- Merhabete Awraja site schema
-- Run this once against your Supabase/Neon Postgres database
-- (Supabase: SQL Editor -> paste -> Run. Neon: use their SQL console or `psql`.)

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(64) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  role        VARCHAR(200) NOT NULL,
  department  VARCHAR(200),
  rank        INTEGER NOT NULL DEFAULT 99,   -- 1 = chairman, 2 = vice, etc.
  photo_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(300) NOT NULL,
  body        TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(300) NOT NULL,
  body        TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS urgent_notices (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(300) NOT NULL,
  body        TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(300) NOT NULL,
  date        DATE NOT NULL,
  duration    VARCHAR(100),
  audience    VARCHAR(200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generic content table: covers library, eduText, eduPdf, eduPpt,
-- entVideo, entAudio, entLit, entCulture, and topicBoards (via topic_key).
-- One flexible table instead of eight near-identical ones.
CREATE TABLE IF NOT EXISTS content_items (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(40) NOT NULL,      -- 'library' | 'eduText' | 'eduPdf' | 'eduPpt'
                                          -- 'entVideo' | 'entAudio' | 'entLit' | 'entCulture'
                                          -- 'topicBoardArticle' | 'topicBoardInfo'
  topic_key   VARCHAR(80),               -- only used when type starts with 'topicBoard'
  title       VARCHAR(300) NOT NULL,
  author      VARCHAR(200),
  category    VARCHAR(150),
  body        TEXT,                      -- for text-based content
  file_url    TEXT,                      -- for pdf/ppt/media, points to object storage
  cover_url   TEXT,
  pages       INTEGER,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_items_type ON content_items(type);
CREATE INDEX IF NOT EXISTS idx_content_items_topic ON content_items(topic_key);

CREATE TABLE IF NOT EXISTS gallery_media (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(20) NOT NULL DEFAULT 'photo',  -- 'photo' | 'video'
  title       VARCHAR(300),
  url         TEXT NOT NULL,             -- object storage URL (photo) or embed URL (video)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  location    VARCHAR(200),
  message     TEXT NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replaces the old client-side "info board" localStorage panel.
CREATE TABLE IF NOT EXISTS info_board_posts (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(300) NOT NULL,
  type        VARCHAR(20) NOT NULL,      -- 'text' | 'pdf'
  content     TEXT,                      -- for type='text'
  file_url    TEXT,                      -- for type='pdf', object storage URL
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Internal member registry (join requests / roster), replaces the old
-- client-side "member database" localStorage panel inside the Special Office.
-- Admin-only in both directions (view and edit) since it holds personal data.
CREATE TABLE IF NOT EXISTS member_registrations (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  photo_url   TEXT,
  gender      VARCHAR(20),
  age         VARCHAR(10),
  birthplace  VARCHAR(200),
  reg_id      VARCHAR(100),
  join_date   DATE,
  marital     VARCHAR(30),
  role        VARCHAR(200),
  education   VARCHAR(200),
  skill       VARCHAR(200),
  status      VARCHAR(30) DEFAULT 'ንቁ',
  bio         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
