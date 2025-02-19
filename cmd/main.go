package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/LTSEC/NEST/api"
	"github.com/LTSEC/NEST/cli"
	"github.com/LTSEC/NEST/database"
	"github.com/LTSEC/NEST/enum"
	"github.com/LTSEC/NEST/logging"
	"github.com/LTSEC/NEST/parser"
	"github.com/LTSEC/NEST/scoring"
	"github.com/LTSEC/NEST/services"
)

var (
	yamlConfig *enum.YamlConfig
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
	// Initalizer the logger
	logger := new(logging.Logger)
	logger.StartLog()

	// Get project root directory
	projectRoot, err := filepath.Abs("./")
	if err != nil {
		logger.LogMessage(fmt.Sprintf("There was an error in startup when getting the working directory: %v", err), "ERROR")
		logging.ConsoleLogError("Error getting working directory, see logs for details.")
		logging.ConsoleLogError("Startup failed")
		os.Exit(1)
	}

	// Automatically load the main yaml in gameconfigs
	gameconfigs := filepath.Join(projectRoot, "gameconfigs")
	mainconfig := filepath.Join(gameconfigs, "main.yaml")

	yamlConfig, err = parser.ParseYAML(gameconfigs, mainconfig)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("There was an error in startup when parsing the yaml configuration: %v", err), "ERROR")
		logging.ConsoleLogError("Error parsing yaml, see logs for details.")
		logging.ConsoleLogError("Startup failed")
		os.Exit(1)
	}

	// Get the database configuration to the local database
	cfg := enum.DatabaseConfig{
		User:     getEnv("DATABASE_USER", "root"),
		Password: getEnv("DATABASE_PASSWORD", "root"),
		Host:     getEnv("DATABASE_HOST", "localhost"),
		Port:     getEnvAsInt("DATABASE_PORT", 5432),
		DBName:   getEnv("DATABASE_NAME", "scoring"),
	}

	// Get the database's schema
	schemaFP := filepath.Join(projectRoot, "database", "schema.sql")

	// Create the database
	if err := database.CreateDatabase(cfg, logger); err != nil {
		logger.LogMessage(fmt.Sprintf("There was an error in startup when creating the NEST database: %v", err), "ERROR")
		logging.ConsoleLogError("Error creating database, see logs for details.")
		logging.ConsoleLogError("Startup failed")
		os.Exit(1)
	}

	// Set up the schema
	if err := database.SetupSchema(cfg, schemaFP); err != nil {
		logger.LogMessage(fmt.Sprintf("There was an error in startup when setting up the NEST database schema: %v", err), "ERROR")
		logging.ConsoleLogError("Error setting up database, see logs for details.")
		logging.ConsoleLogError("Startup failed")
		os.Exit(1)
	}

	db, err := connectToDatabase(cfg)
	if err != nil {
		logger.LogMessage("There was an error in startup when connecting to the NEST database: %e", "ERROR")
		logging.ConsoleLogError("Failed to connect to the NEST database, see logs for details.")
		logging.ConsoleLogError("Startup failed")
		os.Exit(1)
	}

	// Run the initalizer for the scoring component so its prepped when ready to start on CLI
	go scoring.Initalize(db, yamlConfig, logger)

	// Set up RESTful API
	router := api.SetupRouter(db)

	// Clear the console before CLI runs
	fmt.Print("\033[H\033[2J")

	// Initalize the services
	services.Initalize(yamlConfig)

	// Run the CLI
	go cli.RunCLI(db, Version, logger)

	// Finish by hosting the RESTful API
	logger.LogMessage("RESTful API started.", "INFO")
	logging.ConsoleLogSuccess("RESTful API started on port :8080.")

	if err := http.ListenAndServe(":8080", router); err != nil {
		logger.LogMessage(fmt.Sprintf("There was an error starting the REST API: %v", err), "ERROR")
		logging.ConsoleLogError("Error starting the REST API, see logs for details.")
		logging.ConsoleLogError("Startup failed")
		os.Exit(1)
	}

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

// Establishes a connection to the PostgreSQL database.
func connectToDatabase(cfg enum.DatabaseConfig) (*sql.DB, error) {
	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open connection to database: %w", err)
	}

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	return db, nil
}
