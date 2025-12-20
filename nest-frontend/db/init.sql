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
