package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/LTSEC/NEST/cli"
	"github.com/LTSEC/NEST/config"
	"github.com/LTSEC/NEST/database"
	"github.com/LTSEC/NEST/logging"
)

var (
	yamlConfig *config.Config
)

const (
	Red    = "\033[31m"
	Green  = "\033[32m"
	Yellow = "\033[33m"
	Blue   = "\033[34m"
	Reset  = "\033[0m"

	Version = "1.0.0"
)

func main() {
	// Get project root directory
	projectRoot, err := filepath.Abs("./")
	if err != nil {
		log.Fatalf("Error getting the working directory: %v", err)
	}

	// Initalizer the logger
	logger := new(logging.Logger)
	logger.StartLog()

	// Get the database configuration to the local database
	cfg := database.Config{
		User:     getEnv("DATABASE_USER", "root"),
		Password: getEnv("DATABASE_PASSWORD", "root"),
		Host:     getEnv("DATABASE_HOST", "localhost"),
		Port:     getEnvAsInt("DATABASE_PORT", 5432),
		DBName:   getEnv("DATABASE_NAME", "scoring"),
	}

	// Get the database's schema
	schemaFP := filepath.Join(projectRoot, "database", "schema.sql")

	// Create the database
	if err := database.CreateDatabase(cfg); err != nil {
		log.Printf("Could not create database: %s", err.Error())
	}

	// Set up the schema
	if err := database.SetupSchema(cfg, schemaFP); err != nil {
		log.Printf("Could not set up database schema: %s", err.Error())
	}

	// Automatically load the main in gameconfigs
	gameconfigs := filepath.Join(projectRoot, "gameconfigs")
	mainconfig := filepath.Join(gameconfigs, "main.yaml")

	yamlConfig, err = config.Parse(gameconfigs, mainconfig)
	if err != nil {
		logging.ConsoleLogError(fmt.Sprintf("Error parsing configuration: %v\n", err))
		logging.ConsoleLogError(fmt.Sprintf("Startup failed"))
		os.Exit(1)
	}

	cli.RunCLI(cfg, Version)
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
