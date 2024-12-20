package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/LTSEC/scoring-engine/cli"
	"github.com/LTSEC/scoring-engine/database"
	"github.com/LTSEC/scoring-engine/logging"
	"github.com/LTSEC/scoring-engine/scoring"
)

const (
	Red    = "\033[31m"
	Green  = "\033[32m"
	Yellow = "\033[33m"
	Blue   = "\033[34m"
	Reset  = "\033[0m"
)

// Implementing a REST API
func RESTToggleScoring(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
		return
	}

	engine_status := scoring.ToggleScoring()
	fmt.Printf(Green+"[SUCCESS] "+Reset+"Scoring engine toggled "+Yellow+"%s"+Reset+".\n", engine_status)
	logging.Nextline()
}

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

	// TODO: secure this
	http.HandleFunc("/toggle-scoring", RESTToggleScoring)
	http.ListenAndServe(":8080", nil)
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
