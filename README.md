# nest-frontend-v2

## Environment variables

| Name | Description | Default |
| --- | --- | --- |
| `APP_PORT` | Port exposed by the Vite dev/preview server inside the container and published by Docker Compose. | `5173` |
| `NODE_ENV` | Node environment used by the frontend container. Set to `production` to run the built preview server. | `development` |
| `POSTGRES_USER` | Database username for the Postgres container. | `postgres` |
| `POSTGRES_PASSWORD` | Database password for the Postgres container. | `postgres` |
| `POSTGRES_DB` | Default database name initialized in Postgres. | `nestapp` |
| `DB_PORT` | Host port used to expose Postgres. | `5432` |

## Running with Docker Compose

1. Build and start the services:
   ```bash
   docker compose up --build
   ```
2. The frontend is available on `http://localhost:${APP_PORT:-5173}`.
3. Postgres is available on `localhost:${DB_PORT:-5432}` with the credentials listed above. The database is initialized from `nest-frontend/db/init.sql`.

Set the environment variables above before running Compose to override defaults.
