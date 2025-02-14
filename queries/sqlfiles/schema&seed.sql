-- Create the database
CREATE DATABASE minecraft;
USE minecraft;

-- Players table
CREATE TABLE players (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    join_date DATE NOT NULL,
    last_login DATETIME,
    is_banned BOOLEAN DEFAULT FALSE
);

-- Inventories table
CREATE TABLE inventories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Locations table
CREATE TABLE locations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    world_name VARCHAR(50) NOT NULL,
    x_coord INT NOT NULL,
    y_coord INT NOT NULL,
    z_coord INT NOT NULL,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Insert some sample data
INSERT INTO players (username, join_date, last_login) VALUES
    ('trump', '2023-01-15', '2024-02-12 14:30:00'),
    ('biden', '2023-02-20', '2024-02-13 09:15:00'),
    ('obama', '2023-03-10', '2024-02-12 22:45:00'),
    ('bush', '2023-04-05', '2024-02-13 11:20:00');

INSERT INTO inventories (player_id, item_name, quantity) VALUES
    (1, 'diamond', 64),
    (1, 'iron_ingot', 128),
    (2, 'wood', 256),
    (2, 'stone', 128),
    (3, 'emerald', 32),
    (4, 'golden_apple', 10);

INSERT INTO locations (player_id, world_name, x_coord, y_coord, z_coord) VALUES
    (1, 'world', 100, 64, -150),
    (2, 'world', -200, 70, 300),
    (3, 'nether', 50, 40, -50),
    (4, 'end', 0, 100, 0);
