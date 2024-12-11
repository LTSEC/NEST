package database

import (
	"context"
	"database/sql"
	"fmt"
	"io/ioutil"
	"log"
	"time"

	_ "github.com/lib/pq"
)

// Config structure for database configuration parameters
type Config struct {
	User     string
	Password string
	Host     string
	Port     int
	DBName   string
}

// CreateDatabase checks for and creates the "scoring" database if it doesn't exist.
func CreateDatabase(cfg Config) error {
	// Connect to the default "postgres" database
	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=postgres sslmode=disable", cfg.Host, cfg.Port, cfg.User, cfg.Password)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("failed to connect to PostgreSQL: %w", err)
	}
	defer db.Close()

	// Check if the "scoring" database exists
	var exists bool
	err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = 'scoring')").Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check if scoring database exists: %w", err)
	}

	// Create the "scoring" database if it doesn't exist
	if !exists {
		_, err := db.Exec("CREATE DATABASE scoring")
		if err != nil {
			return fmt.Errorf("failed to create scoring database: %w", err)
		}
		log.Println("Scoring database created successfully.")
	} else {
		log.Println("Scoring database already exists.")
	}

	return nil
}

// SetupSchema connects to the "scoring" database and sets up the tables.
func SetupSchema(cfg Config, schemaFilePath string) error {
	// Connect to the "scoring" database
	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=scoring sslmode=disable", cfg.Host, cfg.Port, cfg.User, cfg.Password)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("failed to connect to scoring database: %w", err)
	}
	defer db.Close()

	// Read the schema SQL from file
	schema, err := ioutil.ReadFile(schemaFilePath)
	if err != nil {
		return fmt.Errorf("failed to read schema file: %w", err)
	}

	// Set up the schema
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = db.ExecContext(ctx, string(schema))
	if err != nil {
		return err
	}
	log.Println("Schema setup completed successfully.")

	return nil
}
