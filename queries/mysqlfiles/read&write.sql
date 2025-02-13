-- 1. READ: Everyone can run this (trump, biden, obama, bush)
-- Shows what items each player has
SELECT p.username, i.item_name, i.quantity
FROM players p
JOIN inventories i ON p.id = i.player_id;

-- 2. INSERT: Can be run by trump, biden, and bush
-- bush giving golden apples to someone
INSERT INTO inventories (player_id, item_name, quantity)
SELECT id, 'golden_apple', 5
FROM players
WHERE username = 'trump';

-- 3. UPDATE: Can be run by trump and biden
-- biden updating their location
UPDATE locations l
JOIN players p ON l.player_id = p.id
SET l.x_coord = -100, l.y_coord = 70, l.z_coord = 200
WHERE p.username = 'biden';

-- 4. SELECT with player stats: Everyone can run this (trump, biden, obama, bush)
SELECT 
    p.username,
    MAX(l.world_name) as current_world,
    COUNT(i.id) as item_types,
    SUM(i.quantity) as total_items
FROM players p
LEFT JOIN inventories i ON p.id = i.player_id
LEFT JOIN locations l ON p.id = l.player_id
GROUP BY p.username;