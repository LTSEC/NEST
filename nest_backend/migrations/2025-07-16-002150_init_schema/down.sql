-- Drop views first (they depend on tables)
DROP VIEW IF EXISTS vw_user_permissions;
DROP VIEW IF EXISTS vw_user_teams;

-- Drop triggers (they depend on tables + function)
DROP TRIGGER IF EXISTS trg_users_set_updated ON users;
DROP TRIGGER IF EXISTS trg_teams_set_updated ON teams;
DROP TRIGGER IF EXISTS trg_groups_set_updated ON groups;
DROP TRIGGER IF EXISTS trg_user_groups_set_updated ON user_groups;
DROP TRIGGER IF EXISTS trg_group_permissions_set_updated ON group_permissions;

-- Drop the function that triggers use
DROP FUNCTION IF EXISTS fn_update_timestamp;

-- Drop tables in dependency-safe order
DROP TABLE IF EXISTS group_permissions;
DROP TABLE IF EXISTS user_groups;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS teams;

