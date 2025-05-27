# -----------------------
# 1) BUILD STAGE
# -----------------------
FROM golang:1.24.3 AS builder

# Set the working directory
WORKDIR /app

# Copy go.mod and go.sum, then download dependencies
ENV GOPROXY=goproxy.io,direct

COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the Go program (static binary)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o scoring-engine ./cmd/main.go

# -----------------------
# 2) FINAL STAGE
# -----------------------
FROM alpine:latest

# Install packages needed for your program + headless browser
# - postgresql-client: per your original Dockerfile
# - chromium: the main headless browser
# - nss: often needed for SSL/TLS support in Alpine
# - fonts-liberation (optional) if your site needs certain fonts
RUN apk add --no-cache \
    postgresql-client \
    chromium \
    nss \
    # Optional VVV
    ttf-liberation

# (Optional) Create a non-root user if you want to keep the sandbox
# RUN adduser -D appuser
# USER appuser

# Copy the compiled Go program and other resources from the builder stage
COPY --from=builder /app/scoring-engine /scoring-engine
COPY --from=builder /app/database /database
COPY --from=builder /app/gameconfigs /gameconfigs
COPY --from=builder /app/queries /queries

# (Optional) If you keep running as root, you may need --no-sandbox in Chromedp
# If you run as a non-root user, you can keep the sandbox.
# Adjust your Go code or pass flags accordingly.

# Ensure the binary is executable
RUN chmod +x /scoring-engine

# Set the working directory (optional, helps keep things tidy)
WORKDIR /

# Run the Go program
CMD ["./scoring-engine"]
