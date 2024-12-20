-- Database: scoring

-- Teams Table
CREATE TABLE teams (
    team_id SERIAL PRIMARY KEY,
    team_name VARCHAR(50) UNIQUE NOT NULL,
    team_password TEXT NOT NULL,
    team_color TEXT NOT NULL
);

-- Services Table
CREATE TABLE services (
    service_id SERIAL PRIMARY KEY,
    service_name VARCHAR(50) NOT NULL,
    box_name VARCHAR(50) NOT NULL,
    disabled BOOLEAN DEFAULT FALSE,
    UNIQUE (service_name, box_name) -- Ensures unique service-box combinations
);

-- Team Services Table (associates teams with their services)
CREATE TABLE team_services (
    team_service_id SERIAL PRIMARY KEY,
    team_id INT REFERENCES teams(team_id) ON DELETE CASCADE,
    service_id INT REFERENCES services(service_id) ON DELETE CASCADE,
    points INT DEFAULT 0,
    is_up BOOLEAN DEFAULT FALSE,
    total_checks INT DEFAULT 0,         -- Tracks total checks performed
    successful_checks INT DEFAULT 0    -- Tracks successful (up) checks
);

-- A table that stores all updates for each team-service combination for reference on frontend
CREATE TABLE service_checks (
    check_id SERIAL PRIMARY KEY,
    team_service_id INT REFERENCES team_services(team_service_id) ON DELETE CASCADE,
    status BOOLEAN NOT NULL,           -- true = up, false = down
    timestamp TIMESTAMP DEFAULT now()  -- check time
);

-- Admin User Table
CREATE TABLE admin_users (
    name TEXT PRIMARY KEY,
    password TEXT NOT NULL
);

CREATE TABLE announcements (
    announcement_id SERIAL PRIMARY KEY,            -- Unique ID for each announcement
    title VARCHAR(255) NOT NULL,                   -- Title of the announcement
    content TEXT NOT NULL,                         -- Main content/body of the announcement
    author VARCHAR(100) NOT NULL,                  -- Author of the announcement
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,-- Timestamp for when the announcement is created
    is_visible BOOLEAN DEFAULT TRUE                -- Controls whether the announcement is visible
);

-- Indexes for optimized lookups
CREATE INDEX idx_team_services_team_id ON team_services(team_id);
CREATE INDEX idx_team_services_service_id ON team_services(service_id);
CREATE INDEX idx_service_checks_team_service ON service_checks(team_service_id, timestamp DESC);
