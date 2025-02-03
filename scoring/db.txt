package scoring

import (
	"context"
	"database/sql"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

func DBconnect(address string, portNum int, username string, password string, DBName string, DBPath string) (bool, error) {
	// formats the connection string
	connStr := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s",
		username, password, address, portNum, DBName)

	// currently using mysql driver
	db, err := sql.Open("mysql", connStr)
	if err != nil {
		return false, err
	}
	defer db.Close()

	// test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return false, err
	}

	// Verify the database schema using DBverify
	isValid, err := DBverify(address, portNum, username, password, DBName, DBPath)
	if err != nil {
		return false, fmt.Errorf("database schema verification failed: %w", err)
	}

	if !isValid {
		return false, fmt.Errorf("database schema is not valid")
	}

	return true, nil
}

func DBverify(addr string, portNum int, username string, password string, DBName string, DBPath string) (bool, error) {
	// Open the .sql file
	file, err := os.Open(DBPath)
	if err != nil {
		return false, fmt.Errorf("Failed to open file $v\n", err)
	}
	defer file.Close()

	// Read all lines from the file
	content, err := os.ReadFile(DBPath)
	if err != nil {
		return false, fmt.Errorf("Failed to read file $v\n", err)
	}

	lines := strings.Split(string(content), "\n")
	validLines := []string{}

	// Filter out empty lines or lines that are only whitespace
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			validLines = append(validLines, trimmed)
		}
	}

	if len(validLines) == 0 {
		return false, fmt.Errorf("No valid SQL statements found in the file.")
	}

	// Pick a random line
	rand.Seed(time.Now().UnixNano())
	query := validLines[rand.Intn(len(validLines))]

	// Create a connection string
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s", username, password, addr, portNum, DBName)

	// Connect to the database
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		fmt.Printf("Failed to connect to database: %v\n", err)
		return false, fmt.Errorf("Failed to connect to the database: %v\n", err)
	}
	defer db.Close()

	// Set a timeout context for the query
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Execute the query
	_, err = db.ExecContext(ctx, query)
	if err != nil {
		fmt.Printf("Failed to execute query: %v\n", err)
		return false, fmt.Errorf("Failed to execute query: %v\n", err)
	}

	return true, nil
}

// ScoreDB uses DBConnect to check service availability and assigns points.
func ScoreDB(address string, portNum int, username string, password string, DBName string, DBPath string) (int, bool, error) {
	_, err := DBconnect(address, portNum, username, password, DBName, DBPath)
	if err != nil {
		return 0, false, fmt.Errorf("DB scoring failed: %v", err)
	}
	return successPoints, true, nil
}
