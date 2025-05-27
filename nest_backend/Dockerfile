# 1. Build & generate schema.rs
FROM rust:1.87 AS builder

# Install Postgres headers + Diesel CLI
RUN apt-get update && \
    apt-get install -y libpq-dev && \
    cargo install diesel_cli --no-default-features --features postgres

WORKDIR /usr/src/backend
COPY . .

# Run migrations and emit schema.rs
ENV DATABASE_URL=postgres://root:root@postgres:5432/scoring
RUN diesel migration run
RUN diesel print-schema > src/schema.rs

# Compile in release mode
RUN cargo build --release

# 2. Slim runtime image
FROM debian:bullseye-slim

RUN apt-get update && \
    apt-get install -y libpq5 ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/backend
COPY --from=builder /usr/src/backend/target/release/backend /usr/local/bin/backend

VOLUME ["/Logs"]

ENTRYPOINT ["backend"]
