package scoring

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/xwb1989/sqlparser"
)

func ParseSQLFile(filePath string) ([]sqlparser.Statement, error) {
	// Read the SQL file content
	content, err := ioutil.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	// Create a tokenizer from the file content
	reader := strings.NewReader(string(content))
	tokenizer := sqlparser.NewTokenizer(reader)

	var parsedStatements []sqlparser.Statement
	for {
		// Parse each statement
		parsedStmt, err := sqlparser.ParseNext(tokenizer)
		if err == io.EOF {
			break // End of file reached
		}
		if err != nil {
			return nil, fmt.Errorf("failed to parse statement: %w", err)
		}

		parsedStatements = append(parsedStatements, parsedStmt)
	}

	return parsedStatements, nil
}

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

// DBverify compares the database schema in the file with the actual database schema on the server.
func DBverify(address string, portNum int, username string, password string, DBName string, schemaFilePath string) (bool, error) {
	// Step 1: Connect to the database
	connStr := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s", username, password, address, portNum, DBName)
	db, err := sql.Open("mysql", connStr)
	if err != nil {
		return false, fmt.Errorf("failed to connect to database: %w", err)
	}
	defer db.Close()

	// Step 2: Parse the schema file
	statements, err := ParseSQLFile(schemaFilePath)
	if err != nil {
		return false, fmt.Errorf("failed to parse schema file: %w", err)
	}

	// Step 3: Retrieve the existing schema from the database
	existingSchema, err := getExistingSchema(db)
	if err != nil || existingSchema == nil {
		return false, fmt.Errorf("failed to retrieve schema: %w", err)
	}

	// Step 4: Compare the schemas
	for _, stmt := range statements {
		switch s := stmt.(type) {
		case *sqlparser.DDL:
			if s.Action == "create" {
				tableName := s.NewName.Name.String()
				if _, exists := existingSchema[tableName]; !exists || existingSchema[tableName] == nil {
					return false, fmt.Errorf("table %s not found or schema is nil", tableName)
				}

				// Check columns in the table
				existingColumns := existingSchema[tableName]
				for _, col := range s.TableSpec.Columns {
					columnName := col.Name.String()
					if _, exists := existingColumns[columnName]; !exists {
						return false, fmt.Errorf("missing column: %s in table: %s", columnName, tableName)
					}
				}
			}
		case *sqlparser.DBDDL, *sqlparser.Use:
			log.Printf("Unsupported statement type: %T\n", s)
			continue
		default:
			log.Printf("Ignoring unsupported statement type: %T\n", stmt)
		}
	}

	return true, nil
}

// getExistingSchema retrieves the existing schema from the database.
func getExistingSchema(db *sql.DB) (map[string]map[string]string, error) {
	query := `
		SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE();
	`

	rows, err := db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query information schema: %v", err)
	}
	defer rows.Close()

	schema := make(map[string]map[string]string)
	for rows.Next() {
		var tableName, columnName, columnType string
		if err := rows.Scan(&tableName, &columnName, &columnType); err != nil {
			return nil, fmt.Errorf("failed to scan row: %v", err)
		}

		if _, exists := schema[tableName]; !exists {
			schema[tableName] = make(map[string]string)
		}
		schema[tableName][columnName] = columnType
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %v", err)
	}

	return schema, nil
}

// ScoreDB uses DBConnect to check service availability and assigns points.
func ScoreDB(address string, portNum int, username string, password string, DBName string, DBPath string) (int, bool, error) {
	_, err := DBconnect(address, portNum, username, password, DBName, DBPath)
	if err != nil {
		return 0, false, fmt.Errorf("DB scoring failed: %v", err)
	}
	return successPoints, true, nil
}
