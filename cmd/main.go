package main

import (
	"log"
	"path/filepath"

	"github.com/LTSEC/scoring-engine/cli"
	"github.com/LTSEC/scoring-engine/database"
)

func main() {
	projectRoot, err := filepath.Abs("./")
	if err != nil {
		log.Fatalf("Error getting the working directory: %v", err)
	}

	cfg := database.Config{
		User:     "root",
		Password: "root",
		Host:     "localhost",
		Port:     5432,
		DBName:   "scoring",
	}

	schemaFP := filepath.Join(projectRoot, "database", "schema.sql")
	if err := database.CreateDatabase(cfg); err != nil {
		log.Printf("Could not create database: %s", err.Error())
	}
	if err := database.SetupSchema(cfg, schemaFP); err != nil {
		log.Printf("Could not create database: %s", err.Error())
	}

	// Start the internal services
	cli.Cli(cfg)
}
