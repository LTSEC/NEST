package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
	"golang.org/x/exp/rand"
	"gopkg.in/yaml.v3"
)

var (
	userQueries = make(map[string]string) // maps username to filepath containing their queries
	sqlLoadOnce sync.Once                 // ensures query files are only read once
)

// holds a query along with its expected answer
type QueryResult struct {
	Query    string                              `yaml:"query"`
	Expected []map[string]map[string]interface{} `yaml:"expected"`
}

// a query file may contain multiple queries, this struct is used to hold all the queries (though only
// one query will be picked for scoring)
type QueryFile struct {
	Queries []QueryResult `yaml:"queries"`
}

// establishDBConnection is a utility function that attempts to connect to the designated ip
// address at the designated port with the SQL protocol, and returns the connection or an error.
func establishDBconnection(service Service, address string, user string, password string) (*sqlx.DB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), sql_timeout*time.Second)
	defer cancel()
	connStr := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true",
		user, password, address, service.Port, service.DBName)
	sqlConn, err := sqlx.Connect(
		"mysql",
		connStr,
	)
	if err != nil {
		return nil, fmt.Errorf("connection failed: %v", err)
	}

	err = sqlConn.PingContext(ctx)
	if err != nil {
		sqlConn.Close()
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("connection timeout after 5 seconds")
		}
		return nil, err
	}

	return sqlConn, nil
}

// LoadSQLFiles is a utility function that loads all the files in a directory which are named
// after a user which contains queries (read/write operations) for that specific user.
func LoadSQLFiles(path string) error {
	var err error
	sqlLoadOnce.Do(func() {
		// Check if path is a file or a directory
		info, err := os.Stat(path)
		if err != nil {
			err = fmt.Errorf("failed to stat %s: %v", path, err)
			return
		}

		if info.IsDir() {
			// Process directory
			entries, e := os.ReadDir(path)
			if e != nil {
				err = fmt.Errorf("failed to read directory %s: %v", path, e)
				return
			}

			// Read all files in the directory
			for _, entry := range entries {
				if entry.IsDir() {
					continue // Skip subdirectories
				}

				filename := entry.Name()
				// Skip non-yaml files
				if !strings.HasSuffix(filename, ".yaml") {
					continue
				}

				// Get username by removing .yaml extension
				username := strings.TrimSuffix(filename, ".yaml")
				filePath := filepath.Join(path, filename)
				// Store in userQueries map
				userQueries[username] = filePath
			}

		} else {
			// Process a single file
			filename := info.Name()
			if !strings.HasSuffix(filename, ".yaml") {
				err = fmt.Errorf("invalid query file: %s (must be .yaml)", filename)
				return
			}

			username := strings.TrimSuffix(filename, ".yaml")
			userQueries[username] = path
		}
	})

	return err
}

// ScoreSQL is a general scoring function for SQL. It picks a random user and tests 
// if they can connect and then picks a random user and test if they can successfully read.
func ScoreSQL(service Service, address string) (int, bool, error) {
    _, successLog, err := ScoreSQLLogin(service, address)
    if err != nil {
        return 0, false, fmt.Errorf("login check failed: %v", err)
    }

    _, successQuery, err2 := ScoreSQLQuery(service, address)
    if err2 != nil {
        return 0, false, fmt.Errorf("query check failed: %v", err2)
    }

    // If both are successful then award the points
    if successLog && successQuery {
        return service.Award, true, nil
    }

    return 0, false, nil
}

// Tests if a user can successfully login
func ScoreSQLLogin(service Service, address string) (int, bool, error) {
	var user, pass string
	var err error
	// Check if the login user should be a single user
	if service.User != "" {
		user, pass = service.User, service.Password
	} else { // Otherwise read from the related query file
		user, pass, err = ChooseRandomUser(service.QFile)
		if err != nil {
			return 0, false, err
		}
	}
	conn, err := establishDBconnection(service, address, user, pass)
	if err != nil {
		return 0, false, err
	}
	defer conn.Close()
	return service.Award, true, nil
}

// Tests if a user can successfully read data
func ScoreSQLQuery(service Service, address string) (int, bool, error) {
	LoadSQLFiles(service.QDir)
	var user, pass string
	var err error
	if service.User != "" {
		user, pass = service.User, service.Password
	} else {
		user, pass, err = ChooseRandomUser(service.QFile)
		if err != nil {
			return 0, false, err
		}
	}
	conn, err := establishDBconnection(service, address, user, pass)
	if err != nil {
		return 0, false, err
	}
	defer conn.Close()
	// Get the random query
	file := userQueries[user]
	queryResult, err := getRandomQuery(file)
	if err != nil {
		return 0, false, fmt.Errorf("failed to get random query: %v", err)
	}
	// Compare results
	matched, err := compareResults(conn, queryResult)
	if err != nil {
		return 0, false, fmt.Errorf("comparison failed: %v", err)
	}
	if !matched {
		return 0, false, nil
	}
	return service.Award, true, nil
}

func getRandomQuery(filePath string) (*QueryResult, error) {
	// Read file content
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %v", err)
	}
	defer file.Close()

	var buf bytes.Buffer
	if _, err := io.Copy(&buf, file); err != nil {
		return nil, fmt.Errorf("failed to read file: %v", err)
	}

	// Parse YAML
	var queryFile QueryFile
	if err := yaml.Unmarshal(buf.Bytes(), &queryFile); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %v", err)
	}

	// Check if there are any queries
	if len(queryFile.Queries) == 0 {
		return nil, fmt.Errorf("no queries found in file")
	}

	// Use golang.org/x/exp/rand with time seed
	src := rand.NewSource(uint64(time.Now().UnixNano()))
	rng := rand.New(src)

	// Select random query
	randomQueryIndex := rng.Intn(len(queryFile.Queries))
	selectedQuery := queryFile.Queries[randomQueryIndex]

	// Check if there are any expected results
	if len(selectedQuery.Expected) == 0 {
		return nil, fmt.Errorf("no expected results for query")
	}

	return &selectedQuery, nil
}

// compareResults compares the results of a database query against expected results.
// It executes the query, formats the results to match the expected format, and performs
// a comparison of the data types and values.
func compareResults(db *sqlx.DB, queryResult *QueryResult) (bool, error) {
	// Execute the query against the database
	rows, err := db.Queryx(queryResult.Query)
	if err != nil {
		return false, fmt.Errorf("query failed: %v", err)
	}
	defer rows.Close()

	// Store the actual results in the same format as expected results
	// Format: map[column]map[attribute]value where attributes are "type" and "value"
	var actualResults []map[string]map[string]interface{}
	for rows.Next() {
		// Scan the current row into a map
		row := make(map[string]interface{})
		if err := rows.MapScan(row); err != nil {
			return false, fmt.Errorf("scan failed: %v", err)
		}

		// Convert each column value into a type/value pair
		typedRow := make(map[string]map[string]interface{})
		for k, v := range row {
			typedRow[k] = map[string]interface{}{
				"value": v,                    // The actual value
				"type":  fmt.Sprintf("%T", v), // The Go type as a string
			}
		}
		actualResults = append(actualResults, typedRow)
	}

	// Ensure we got some results
	if len(actualResults) == 0 {
		return false, fmt.Errorf("no results returned from query")
	}

	// Compare row counts
	if len(actualResults) != len(queryResult.Expected) {
			len(queryResult.Expected), len(actualResults))
		return false, nil
	}

	// For each expected row, try to find a matching actual row
	// This allows rows to be in different orders
	for i, expectedRow := range queryResult.Expected {
		matchFound := false
		for _, actualRow := range actualResults {
			if compareValues(expectedRow, actualRow) {
				matchFound = true
				break
			}
		}
		if !matchFound {
			return false, nil
		}
	}

	return true, nil
}

// compareValues performs a deep comparison between an expected and actual row of results.
// It compares both the types and values of each field, handling special cases for
// different data types (int64, []uint8, time.Time).
func compareValues(expected, actual map[string]map[string]interface{}) bool {
	// Check if both rows have the same number of columns
	if len(expected) != len(actual) {
		return false
	}

	// Compare each field in the row
	for key, expectedField := range expected {
		// Check if the field exists in actual results
		actualField, exists := actual[key]
		if !exists {
			return false
		}

		// Extract and compare types
		expectedType, ok := expectedField["type"].(string)
		if !ok {
			return false
		}

		actualType, ok := actualField["type"].(string)
		if !ok {
			return false
		}

		if expectedType != actualType {
			return false
		}

		// Get the values to compare
		expectedValue := expectedField["value"]
		actualValue := actualField["value"]

		// Handle different types of comparisons
		switch expectedType {
		case "int64":
			// Handle integer comparisons
			var expectedInt, actualInt int64

			// Convert expected value to int64
			switch ev := expectedValue.(type) {
			case int:
				expectedInt = int64(ev)
			case int64:
				expectedInt = ev
			default:
				return false
			}

			// Convert actual value to int64
			switch av := actualValue.(type) {
			case int:
				actualInt = int64(av)
			case int64:
				actualInt = av
			default:
				return false
			}

			if expectedInt != actualInt {
				return false
			}

		case "[]uint8":
			// Handle byte array comparisons (usually used for strings in SQL)
			var expectedBytes []uint8

			// Convert expected value to []uint8
			if exp, ok := expectedValue.([]interface{}); ok {
				// Handle case where expected value comes from YAML as []interface{}
				expectedBytes = make([]uint8, len(exp))
				for i, v := range exp {
					if num, ok := v.(int); ok {
						expectedBytes[i] = uint8(num)
					} else {
						return false
					}
				}
			} else if bytes, ok := expectedValue.([]uint8); ok {
				// Handle case where expected value is already []uint8
				expectedBytes = bytes
			} else {
				return false
			}

			// Convert actual value to []uint8
			actualBytes, ok := actualValue.([]uint8)
			if !ok {
				return false
			}

			// Compare lengths and values
			if len(expectedBytes) != len(actualBytes) {
				return false
			}

			for i := range expectedBytes {
				if expectedBytes[i] != actualBytes[i] {
					return false
				}
			}

		case "time.Time":
			// Handle time.Time comparisons
			et, ok1 := expectedValue.(time.Time)
			at, ok2 := actualValue.(time.Time)
			if !ok1 || !ok2 {
				return false
			}
			if !et.Equal(at) {
				return false
			}

		default:
			// For all other types, use direct comparison
			if expectedValue != actualValue {
				return false
			}
		}
	}
	return true
}
