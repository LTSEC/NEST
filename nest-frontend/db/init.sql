-- Schema setup for Nest user authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_plain TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'developer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Base seed users
INSERT INTO users (username, email, password_hash, password_plain, role)
VALUES
  ('Test', 'test@example.com', 'Test', 'Test', 'user'),
  ('Developer', 'dev@example.com', 'Dev', 'Dev', 'developer')
ON CONFLICT (username) DO NOTHING;

-- Games created by developers
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
  team_count INTEGER NOT NULL DEFAULT 0 CHECK (team_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a sample Red vs. Blue game for the developer account
INSERT INTO games (name, developer_id, types, rvb_services, team_count)
VALUES (
  'Sample Red vs Blue',
  (SELECT id FROM users WHERE username = 'Developer'),
  ARRAY['Red vs. Blue'],
  ARRAY['Scoring Engine', 'DNS'],
  4
)
ON CONFLICT DO NOTHING;
