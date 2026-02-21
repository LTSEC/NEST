-- =============================================================================
-- Nest Platform Database Schema
-- =============================================================================

-- ---------- USERS ----------
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'developer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Base seed users (passwords will be bcrypt hashed by the backend on first run)
INSERT INTO users (username, email, password_hash, role)
VALUES
  ('Test', 'test@example.com', '$2a$10$placeholder_will_be_set_by_backend', 'user'),
  ('Developer', 'dev@example.com', '$2a$10$placeholder_will_be_set_by_backend', 'developer')
ON CONFLICT (username) DO NOTHING;

-- ---------- TEAMS ----------
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  min_players INTEGER NOT NULL DEFAULT 3 CHECK (min_players >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'player' CHECK (role IN ('captain', 'co-captain', 'coach', 'player')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS team_invitations (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

-- ---------- GAMES (developer-created definitions) ----------
CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  developer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  types TEXT[] NOT NULL CHECK (
    types <@ ARRAY['Injects', 'CTFs', 'Red vs. Blue']
    AND array_length(types, 1) >= 1
  ),
  rvb_services TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[] CHECK (
    rvb_services <@ ARRAY['Scoring Engine', 'DNS', 'CDN', 'CA']
  ),
  credentials JSONB NOT NULL DEFAULT '[]'::JSONB,
  team_count INTEGER NOT NULL DEFAULT 0 CHECK (team_count >= 0),
  preset_id VARCHAR(100),
  black_team_cidr VARCHAR(50),
  network_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- GAME SESSIONS (hosted instances of games) ----------
CREATE TABLE IF NOT EXISTS game_sessions (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  developer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_name VARCHAR(255) NOT NULL,
  developer_name VARCHAR(100) NOT NULL,
  types TEXT[] NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  min_players INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'running', 'paused', 'completed')
  ),
  infrastructure_id INTEGER,
  infrastructure_status VARCHAR(20) CHECK (
    infrastructure_status IS NULL OR infrastructure_status IN ('creating', 'active', 'destroying', 'error')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_invited_teams (
  session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, team_id)
);

CREATE TABLE IF NOT EXISTS session_participant_teams (
  session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, team_id)
);

-- ---------- ARCHIVED GAMES ----------
CREATE TABLE IF NOT EXISTS archived_games (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES game_sessions(id) ON DELETE SET NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  developer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  developer_name VARCHAR(100) NOT NULL,
  session_name VARCHAR(255) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  network_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archived_game_results (
  id SERIAL PRIMARY KEY,
  archive_id INTEGER NOT NULL REFERENCES archived_games(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  position INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  participants TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);

-- ---------- TERRAFORM STATE STORAGE (per-game isolation) ----------
CREATE TABLE IF NOT EXISTS terraform_states (
  id SERIAL PRIMARY KEY,
  game_session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  state_data JSONB,
  lock_id VARCHAR(255),
  lock_info JSONB,
  locked_at TIMESTAMPTZ,
  working_dir VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_session_id)
);

-- ---------- SESSION TOKENS ----------
CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(255) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
