package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/LTSEC/scoring-engine/cli"
	"github.com/LTSEC/scoring-engine/database"
)

func main() {
	// Get project root directory
	projectRoot, err := filepath.Abs("./")
	if err != nil {
		log.Fatalf("Error getting the working directory: %v", err)
	}

	// Read database configuration from environment variables
	cfg := database.Config{
		User:     getEnv("DATABASE_USER", "root"),
		Password: getEnv("DATABASE_PASSWORD", "root"),
		Host:     getEnv("DATABASE_HOST", "localhost"),
		Port:     getEnvAsInt("DATABASE_PORT", 5432),
		DBName:   getEnv("DATABASE_NAME", "scoring"),
	}

	// Path to the schema file
	schemaFP := filepath.Join(projectRoot, "database", "schema.sql")

	// Create the database
	if err := database.CreateDatabase(cfg); err != nil {
		log.Printf("Could not create database: %s", err.Error())
	}

	// Set up the schema
	if err := database.SetupSchema(cfg, schemaFP); err != nil {
		log.Printf("Could not set up database schema: %s", err.Error())
	}

	// Start the internal services
	cli.Cli(cfg)
}

// getEnv fetches an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

// getEnvAsInt fetches an environment variable as an integer or returns a default value
func getEnvAsInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		var intValue int
		if _, err := fmt.Sscanf(value, "%d", &intValue); err == nil {
			return intValue
		}
	}
	return defaultValue
}
