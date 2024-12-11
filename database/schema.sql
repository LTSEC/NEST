-- Database: scoring

-- Teams Table
CREATE TABLE teams (
    team_id SERIAL PRIMARY KEY,
    team_name VARCHAR(50) UNIQUE NOT NULL,
    team_password TEXT NOT NULL
);

-- Services Table
CREATE TABLE services (
    service_id SERIAL PRIMARY KEY,
    service_name VARCHAR(50) NOT NULL,
    box_name VARCHAR(50) NOT NULL,
    UNIQUE (service_name, box_name) -- Ensures unique service-box combinations
);

-- Team Services Table (associates teams with their services)
CREATE TABLE team_services (
    team_service_id SERIAL PRIMARY KEY,
    team_id INT REFERENCES teams(team_id) ON DELETE CASCADE,
    service_id INT REFERENCES services(service_id) ON DELETE CASCADE,
    points INT DEFAULT 0,
    is_up BOOLEAN DEFAULT FALSE
);

-- Indexes for optimized lookups
CREATE INDEX idx_team_services_team_id ON team_services(team_id);
CREATE INDEX idx_team_services_service_id ON team_services(service_id);
