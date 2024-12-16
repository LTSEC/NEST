# Use the official Golang image to build the program
FROM golang:1.23.2 AS builder

# Set the working directory inside the container
WORKDIR /

# Copy the Go module files and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the Go program for Linux with static linking
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o scoring-engine ./cmd/main.go

# Use a smaller base image for the final container
FROM alpine:latest
# to make sure that postgres is fully running before starting scoring engine
RUN apk add --no-cache postgresql-client

# Copy the compiled Go program from the builder stage
COPY --from=builder /scoring-engine .
COPY --from=builder /database /database
COPY --from=builder /tests /tests

# Ensure the binary is executable
RUN chmod +x scoring-engine

# Run the Go program
CMD ["./scoring-engine"]
