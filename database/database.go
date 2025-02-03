package database

import (
	"context"
	"database/sql"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/LTSEC/NEST/config"
	"github.com/LTSEC/NEST/logging"
	"github.com/chzyer/readline"
	"github.com/go-yaml/yaml"
	_ "github.com/lib/pq"
)

var (
	logger *logging.Logger
)

// CreateDatabase checks for and creates the "scoring" database if it doesn't exist.
func CreateDatabase(cfg config.DatabaseConfig, newlogger *logging.Logger) error {
	logger = newlogger
	logger.LogMessage("Database initalization started", "STATUS")
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
	} else {
		logger.LogMessage("Scoring database already existed when creation attempted.", "STATUS")
	}
	logger.LogMessage("Scoring database successfully created.", "STATUS")

	return nil
}

// SetupSchema connects to the "scoring" database and sets up the tables.
func SetupSchema(cfg config.DatabaseConfig, schemaFilePath string) error {
	logger.LogMessage("Database schema setup initalized", "STATUS")
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
		logger.LogMessage(fmt.Sprintf("Nonfatal error occured while setting up the database schema %v", err), "ERROR")
	}
	logger.LogMessage("Database schema setup successfully completed.", "STATUS")

	return nil
}

// Adds a team to the database, returns any errors
func AddTeamToDatabase(db *sql.DB, team config.Team, rl *readline.Instance) error {
	var query string
	var ctx context.Context
	var cancel context.CancelFunc

	if team.Password != "" {
		query = `INSERT INTO teams (team_name, team_password, team_color) VALUES ($1, $2, $3) ON CONFLICT (team_name) DO NOTHING;`
		ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
	} else {
		logging.ConsoleLogMessage("Enter a password: ")
		line, err := rl.Readline()
		if err != nil {
			// Handle Ctrl+C: if interrupted, quit the CLI.
			if err == readline.ErrInterrupt {
				logging.ConsoleLogMessage("Exiting CLI.")
				os.Exit(0)
			}
			logging.ConsoleLogError(fmt.Sprintf("Error reading line: %v", err))
			logger.LogMessage(fmt.Sprintf("Error reading line: %v", err), "ERROR")
			os.Exit(2)
		}

		// Clean up the line input.
		line = strings.TrimSpace(line)
		if line == "" {
			return fmt.Errorf("Error: No input")
		}
	}

	_, err := db.ExecContext(ctx, query, team.Name, team.Password, team.Color)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Failed to insert team '%s' into the database: %v", team.Name, err), "ERROR")
		return err
	}

	logger.LogMessage(fmt.Sprintf("Team %s added successfully.", team.Name), "INFO")

	return nil
}

// EditTeam updates the team name for the specified team.
func EditTeam(id int, newName string, db *sql.DB) error {
	query := `UPDATE teams SET team_name = $1 WHERE team_id = $2`
	res, err := db.Exec(query, newName, id)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Error updating team: %v", err), "ERROR")
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Error checking rows affected: %v", err), "ERROR")
		return err
	}
	if affected == 0 {
		logging.ConsoleLogError("Team not found.")
		return err
	}
	logging.ConsoleLogSuccess(fmt.Sprintf("Team ID %d updated successfully to new name '%s'.", id, newName))

	return nil
}

// CheckTeamScores queries the database for each team's total score and prints the results.
func CheckTeamScores(db *sql.DB) error {
	logging.ConsoleLogMessage("Team Scores:")

	query := `
        SELECT t.team_id, t.team_name, COALESCE(SUM(ts.points), 0) AS total_points
        FROM teams t
        LEFT JOIN team_services ts ON t.team_id = ts.team_id
        GROUP BY t.team_id, t.team_name
        ORDER BY total_points DESC;
    `
	rows, err := db.Query(query)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Error querying team scores: %v", err), "ERROR")
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var teamID int
		var teamName string
		var totalPoints int
		if err := rows.Scan(&teamID, &teamName, &totalPoints); err != nil {
			logger.LogMessage(fmt.Sprintf("Error scanning row: %v", err), "ERROR")
			continue
		}
		logging.ConsoleLogMessage(fmt.Sprintf("Team ID: %d, Name: %s, Score: %d\n", teamID, teamName, totalPoints))
	}
	if err = rows.Err(); err != nil {
		logger.LogMessage(fmt.Sprintf("Row error: %v", err), "ERROR")
	}

	return nil
}

// ValidateServiceUptime checks the current status of services associated with teams.
func ValidateServiceUptime(db *sql.DB) error {
	query := `
        SELECT t.team_name, s.service_name, ts.is_up
        FROM team_services ts
        JOIN teams t ON ts.team_id = t.team_id
        JOIN services s ON ts.service_id = s.service_id;
    `
	rows, err := db.Query(query)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Error querying service uptime: %v", err), "ERROR")
		return err
	}
	defer rows.Close()

	allUp := true
	for rows.Next() {
		var teamName, serviceName string
		var isUp bool
		if err := rows.Scan(&teamName, &serviceName, &isUp); err != nil {
			logger.LogMessage(fmt.Sprintf("Error scanning row: %v", err), "ERROR")
			continue
		}
		if !isUp {
			logging.ConsoleLogMessage(fmt.Sprintf("Service '%s' for team '%s' is DOWN.\n", serviceName, teamName))
			allUp = false
		}
	}
	if err = rows.Err(); err != nil {
		logger.LogMessage(fmt.Sprintf("Row error: %v", err), "ERROR")
	}

	if allUp {
		logging.ConsoleLogSuccess("All services are up and running.")
	}

	return nil
}

// GenerateReport connects to the database using the provided configuration,
// queries the team scores, builds a report struct, and outputs it in YAML format,
// as Logs/report.yaml
func GenerateReport(db *sql.DB) error {
	// Define the structure for each team's report.
	type TeamReport struct {
		TeamID      int    `yaml:"team_id"`
		TeamName    string `yaml:"team_name"`
		TotalPoints int    `yaml:"total_points"`
	}

	// Query to retrieve team scores.
	query := `
        SELECT t.team_id, t.team_name, COALESCE(SUM(ts.points), 0) AS total_points
        FROM teams t
        LEFT JOIN team_services ts ON t.team_id = ts.team_id
        GROUP BY t.team_id, t.team_name
        ORDER BY total_points DESC;
    `
	rows, err := db.Query(query)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Error querying teams for report: %v", err), "ERROR")
		return err
	}
	defer rows.Close()

	var teamsReport []TeamReport
	for rows.Next() {
		var tr TeamReport
		if err := rows.Scan(&tr.TeamID, &tr.TeamName, &tr.TotalPoints); err != nil {
			logger.LogMessage(fmt.Sprintf("Error scanning team report row: %v", err), "ERROR")
			continue
		}
		teamsReport = append(teamsReport, tr)
	}
	if err = rows.Err(); err != nil {
		logger.LogMessage(fmt.Sprintf("Row error: %v", err), "ERROR")
		return err
	}

	// Build the overall report structure.
	report := struct {
		Timestamp string       `yaml:"timestamp"`
		Teams     []TeamReport `yaml:"teams"`
	}{
		Timestamp: time.Now().Format(time.RFC3339),
		Teams:     teamsReport,
	}

	// Marshal the report struct to YAML.
	data, err := yaml.Marshal(report)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Error generating report: %v", err), "ERROR")
		return err
	}

	// Create the yaml file
	absPath, err := filepath.Abs(".")
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Error getting absolute path to current directory: %v", err), "ERROR")
		return err
	}

	// Assume Logs/ exists (should be created by docker or the logger)
	yamlFile := filepath.Join(absPath, "Logs", "report.yaml")
	err = os.WriteFile(yamlFile, data, 0644)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Error creating the report file: %v", err), "ERROR")
		return err
	}

	logging.ConsoleLogSuccess(fmt.Sprintf("Successfully generated report (YAML): %s", yamlFile))

	return nil
}

// ViewTeams retrieves and prints all teams from the database.
func ViewTeams(db *sql.DB) error {
	logging.ConsoleLogMessage("Teams:")

	query := `SELECT team_id, team_name, team_password, team_color FROM teams ORDER BY team_id`
	rows, err := db.Query(query)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Error querying teams: %v", err), "ERROR")
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var name, password, color string
		if err := rows.Scan(&id, &name, &password, &color); err != nil {
			logger.LogMessage(fmt.Sprintf("Error scanning team row: %v", err), "ERROR")
			continue
		}
		logging.ConsoleLogMessage(fmt.Sprintf("ID: %d, Name: %s, Color: %s\n", id, name, color))
	}

	if err = rows.Err(); err != nil {
		logger.LogMessage(fmt.Sprintf("Row error: %v", err), "ERROR")
	}

	return nil
}
