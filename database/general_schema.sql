-- Database: general

-- 1. Tables ---------------------------------------------------------------
CREATE TABLE teams (
  id          SERIAL      PRIMARY KEY,
  name        VARCHAR(100) UNIQUE   NOT NULL,
  owner_id    INTEGER                   NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT now(),
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE users (
  id          SERIAL      PRIMARY KEY,
  username    VARCHAR(50)  UNIQUE   NOT NULL,
  email       VARCHAR(255) UNIQUE   NOT NULL,
  team_id     INTEGER                   NULL,
  password    VARCHAR(255)            NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT now(),
  FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE SET NULL
);

CREATE TABLE groups (
  id          SERIAL      PRIMARY KEY,
  name        VARCHAR(100) UNIQUE   NOT NULL,
  description TEXT                      NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id          SERIAL      PRIMARY KEY,
  name        VARCHAR(100) UNIQUE   NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE user_groups (
  user_id     INTEGER      NOT NULL,
  group_id    INTEGER      NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,group_id),
  FOREIGN KEY(user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE group_permissions (
  group_id       INTEGER    NOT NULL,
  permission_id  INTEGER    NOT NULL,
  created_at     TIMESTAMP  NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,permission_id),
  FOREIGN KEY(group_id)      REFERENCES groups(id)      ON DELETE CASCADE,
  FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 2. Views ---------------------------------------------------------------
-- lookup each user’s team
CREATE VIEW vw_user_teams AS
SELECT u.id   AS user_id,
       u.username,
       t.id   AS team_id,
       t.name AS team_name
FROM users u
LEFT JOIN teams t ON u.team_id = t.id;

-- expand user → groups → permissions
CREATE VIEW vw_user_permissions AS
SELECT u.id         AS user_id,
       u.username,
       g.id         AS group_id,
       g.name       AS group_name,
       p.id         AS permission_id,
       p.name       AS permission_name
FROM users u
JOIN user_groups ug      ON ug.user_id = u.id
JOIN groups g            ON g.id = ug.group_id
JOIN group_permissions gp ON gp.group_id       = g.id
JOIN permissions p       ON p.id               = gp.permission_id;

-- 3. Trigger: auto-update updated_at on every UPDATE ---------------------
CREATE FUNCTION fn_update_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  FOR tbl IN ARRAY[
    'users','teams','groups','user_groups','group_permissions'
  ] LOOP
    EXECUTE format($f$
      CREATE TRIGGER trg_%1$s_set_updated
      BEFORE UPDATE ON %1$s
      FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
    $f$, tbl);
  END LOOP;
END;
$$;
