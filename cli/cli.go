package cli

import (
	"database/sql"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/LTSEC/NEST/database"
	"github.com/LTSEC/NEST/logging"
	"github.com/chzyer/readline"
	"github.com/go-yaml/yaml"
)

const (
	auditLogFile  = "audit.log"
	historyFile   = "cli_history.txt"
	historyMaxLen = 100 // Maximum number of commands to keep in memory
)

const (
	Red    = "\033[31m"
	Green  = "\033[32m"
	Yellow = "\033[33m"
	Blue   = "\033[34m"
	Reset  = "\033[0m"
)

// Engine state variables
var engineRunning bool = false
var enginePaused bool = false

// Dummy data structures for users and teams
type User struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type Team struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Score int    `json:"score"`
}

// RunCLI is the entry point for the CLI. It accepts the database configuration
// (or any other required configuration) and then enters a loop that reads user
// input, logs the command, and dispatches the command to the appropriate handler.
func RunCLI(dbConfig database.Config, Version string) {
	// Configure readline with an ANSI-colored prompt and input filter.
	rl, err := readline.NewEx(&readline.Config{
		Prompt:          Blue + "[nest]" + Reset + " > ",
		HistoryFile:     historyFile,
		InterruptPrompt: "^C",
		EOFPrompt:       "exit",
		FuncFilterInputRune: func(r rune) (rune, bool) {
			if r == readline.CharCtrlL { // Ctrl+L is intercepted.
				clearTerminal()
				return 0, false // Skip this rune.
			}
			return r, true
		},
	})
	if err != nil {
		log.Fatalf("failed to initialize readline: %v", err)
	}
	defer rl.Close()

	// Main CLI loop.
	for {
		line, err := rl.Readline()
		if err != nil {
			// Handle Ctrl+C: if interrupted, simply continue to next prompt.
			if err == readline.ErrInterrupt {
				continue
			} else if err.Error() == "EOF" {
				// Continue on EOF to keep the CLI running.
				continue
			}
			log.Fatalf("error reading line: %v", err)
		}

		// Clean up the line input.
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Check for the "clear" command.
		if strings.ToLower(line) == "clear" {
			clearTerminal()
			continue
		}

		// Audit log the entered command.
		auditLog(line)

		// Process the command.
		processCommand(line, dbConfig, Version)
	}
}

// clearTerminal sends the ANSI escape sequence to clear the screen.
func clearTerminal() {
	// ANSI escape code to clear screen and move cursor to the home position.
	fmt.Print("\033[H\033[2J")
}

// auditLog writes a timestamped log of each command to a file.
func auditLog(action string) {
	f, err := os.OpenFile(auditLogFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("Error opening audit log file: %v\n", err)
		return
	}
	defer f.Close()
	timestamp := time.Now().Format(time.RFC3339)
	logLine := fmt.Sprintf("%s: %s\n", timestamp, action)
	if _, err := f.WriteString(logLine); err != nil {
		fmt.Printf("Error writing to audit log file: %v\n", err)
	}
}

// processCommand tokenizes the input and calls the appropriate function.
func processCommand(input string, dbConfig database.Config, Version string) {
	tokens := strings.Fields(input)
	if len(tokens) == 0 {
		return
	}
	cmd := strings.ToLower(tokens[0])

	switch cmd {
	case "help":
		printHelp()
	case "exit":
		fmt.Println("Exiting CLI.")
		os.Exit(0)
	case "version", "--version":
		printVersion(Version)
	case "score":
		// Expected: score check
		if len(tokens) > 1 && tokens[1] == "check" {
			checkTeamScores(dbConfig)
		} else {
			fmt.Println("Usage: score check")
		}
	case "uptime":
		// Expected: uptime validate
		if len(tokens) > 1 && tokens[1] == "validate" {
			validateServiceUptime(dbConfig)
		} else {
			fmt.Println("Usage: uptime validate")
		}
	case "report":
		// Expected: report generate
		if len(tokens) > 1 && tokens[1] == "generate" {
			generateReport(dbConfig)
		} else {
			fmt.Println("Usage: report generate")
		}
	case "team":
		if len(tokens) < 2 {
			fmt.Println("Usage: team [create|edit|view]")
			return
		}
		subcmd := strings.ToLower(tokens[1])
		switch subcmd {
		case "create":
			// Usage: team create <id> <name>
			if len(tokens) != 3 {
				fmt.Println("Usage: team create<name>")
				return
			}
			createTeam(tokens[2], dbConfig)
		case "edit":
			// Usage: team edit <id> <newname>
			if len(tokens) != 4 {
				fmt.Println("Usage: team edit <id> <newname>")
				return
			}
			id, err := strconv.Atoi(tokens[2])
			if err != nil {
				fmt.Println("Invalid team ID. Must be an integer.")
				return
			}
			editTeam(id, tokens[3], dbConfig)
		case "view":
			viewTeams(dbConfig)
		default:
			fmt.Println("Unknown team command. Use: team [create|edit|view]")
		}
	case "logs":
		// Expected: logs view <logtype>
		if len(tokens) > 2 && tokens[1] == "view" {
			if tokens[2] == "audit" {
				viewAuditLogs()
			} else if tokens[2] == "logs" {
				viewLogs()
			} else {
				fmt.Println("Invalid log type.\nValid log types: 'audit' 'logs'")
			}

		} else {
			fmt.Println("Usage: logs view <logtype>")
		}
	case "start":
		startEngine()
	case "stop":
		stopEngine()
	case "pause":
		pauseEngine()
	case "resume":
		resumeEngine()
	default:
		fmt.Printf("Unknown command: %s. Type 'help' for available commands.\n", tokens[0])
	}
}

func printHelp() {
	helpText := `
Available commands:

  help                             					- Show this help message.
  exit                             					- Exit the CLI.
  version | --version              					- Show CLI version.
  
  score check                      					- Check team scores.
  uptime validate                  					- Validate service uptime.
  report generate                  					- Generate a YAML report.

  team create <name>           						- Create a new team.
  team edit <id> <newname>           				- Edit an existing team.
  team view                        					- View all teams.

  logs view <logtype>              					- View logs.

  start                            					- Start the engine.
  stop                             					- Stop the engine.
  pause                            					- Pause the engine.
  resume                           					- Resume the engine.
`
	fmt.Println(helpText)
}

func printVersion(Version string) {
	fmt.Printf("NEST CLI Version %s\n", Version)
}

// buildConnStr builds the PostgreSQL connection string using the provided configuration.
func buildConnStr(cfg database.Config) string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=scoring sslmode=disable",
		cfg.Host, cfg.Port, cfg.User, cfg.Password)
}

// checkTeamScores queries the database for each team's total score and prints the results.
func checkTeamScores(dbConfig database.Config) {
	connStr := buildConnStr(dbConfig)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		fmt.Printf("Error connecting to database: %v\n", err)
		return
	}
	defer db.Close()

	fmt.Println("Team Scores:")

	query := `
        SELECT t.team_id, t.team_name, COALESCE(SUM(ts.points), 0) AS total_points
        FROM teams t
        LEFT JOIN team_services ts ON t.team_id = ts.team_id
        GROUP BY t.team_id, t.team_name
        ORDER BY total_points DESC;
    `
	rows, err := db.Query(query)
	if err != nil {
		fmt.Printf("Error querying team scores: %v\n", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var teamID int
		var teamName string
		var totalPoints int
		if err := rows.Scan(&teamID, &teamName, &totalPoints); err != nil {
			fmt.Printf("Error scanning row: %v\n", err)
			continue
		}
		fmt.Printf("Team ID: %d, Name: %s, Score: %d\n", teamID, teamName, totalPoints)
	}
	if err = rows.Err(); err != nil {
		fmt.Printf("Row error: %v\n", err)
	}
}

// validateServiceUptime checks the current status of services associated with teams.
func validateServiceUptime(dbConfig database.Config) {
	connStr := buildConnStr(dbConfig)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		fmt.Printf("Error connecting to database: %v\n", err)
		return
	}
	defer db.Close()

	fmt.Println("Validating service uptime...")

	query := `
        SELECT t.team_name, s.service_name, ts.is_up
        FROM team_services ts
        JOIN teams t ON ts.team_id = t.team_id
        JOIN services s ON ts.service_id = s.service_id;
    `
	rows, err := db.Query(query)
	if err != nil {
		fmt.Printf("Error querying service uptime: %v\n", err)
		return
	}
	defer rows.Close()

	allUp := true
	for rows.Next() {
		var teamName, serviceName string
		var isUp bool
		if err := rows.Scan(&teamName, &serviceName, &isUp); err != nil {
			fmt.Printf("Error scanning row: %v\n", err)
			continue
		}
		if !isUp {
			fmt.Printf("Service '%s' for team '%s' is DOWN.\n", serviceName, teamName)
			allUp = false
		}
	}
	if err = rows.Err(); err != nil {
		fmt.Printf("Row error: %v\n", err)
	}

	if allUp {
		fmt.Println("All services are up and running.")
	}
}

// generateReport connects to the database using the provided configuration,
// queries the team scores, builds a report struct, and outputs it in YAML format.
func generateReport(dbConfig database.Config) {
	connStr := buildConnStr(dbConfig)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		fmt.Printf("Error connecting to database: %v\n", err)
		return
	}
	defer db.Close()

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
		fmt.Printf("Error querying teams for report: %v\n", err)
		return
	}
	defer rows.Close()

	var teamsReport []TeamReport
	for rows.Next() {
		var tr TeamReport
		if err := rows.Scan(&tr.TeamID, &tr.TeamName, &tr.TotalPoints); err != nil {
			fmt.Printf("Error scanning team report row: %v\n", err)
			continue
		}
		teamsReport = append(teamsReport, tr)
	}
	if err = rows.Err(); err != nil {
		fmt.Printf("Row error: %v\n", err)
		return
	}

	// Build the overall report structure.
	report := struct {
		Timestamp   string       `yaml:"timestamp"`
		EngineState string       `yaml:"engine_state"`
		Teams       []TeamReport `yaml:"teams"`
	}{
		Timestamp:   time.Now().Format(time.RFC3339),
		EngineState: getEngineState(),
		Teams:       teamsReport,
	}

	// Marshal the report struct to YAML.
	data, err := yaml.Marshal(report)
	if err != nil {
		fmt.Printf("Error generating report: %v\n", err)
		return
	}

	fmt.Println("Generated Report (YAML):")
	fmt.Println(string(data))
}

// createTeam inserts a new team into the database.
// Note: The provided id is ignored because team_id is generated automatically.
func createTeam(name string, dbConfig database.Config) {
	connStr := buildConnStr(dbConfig)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		fmt.Printf("Error connecting to database: %v\n", err)
		return
	}
	defer db.Close()

	// Use default values for password and color.
	defaultPassword := "default_password"
	defaultColor := "#FFFFFF"

	query := `INSERT INTO teams (team_name, team_password, team_color) VALUES ($1, $2, $3) RETURNING team_id`
	var newID int
	if err := db.QueryRow(query, name, defaultPassword, defaultColor).Scan(&newID); err != nil {
		fmt.Printf("Error creating team: %v\n", err)
		return
	}
	fmt.Printf("Team '%s' created successfully with ID %d.\n", name, newID)
}

// editTeam updates the team name for the specified team.
func editTeam(id int, newName string, dbConfig database.Config) {
	connStr := buildConnStr(dbConfig)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		fmt.Printf("Error connecting to database: %v\n", err)
		return
	}
	defer db.Close()

	query := `UPDATE teams SET team_name = $1 WHERE team_id = $2`
	res, err := db.Exec(query, newName, id)
	if err != nil {
		fmt.Printf("Error updating team: %v\n", err)
		return
	}
	affected, err := res.RowsAffected()
	if err != nil {
		fmt.Printf("Error checking rows affected: %v\n", err)
		return
	}
	if affected == 0 {
		fmt.Println("Team not found.")
		return
	}
	fmt.Printf("Team ID %d updated successfully to new name '%s'.\n", id, newName)
}

// viewTeams retrieves and prints all teams from the database.
func viewTeams(dbConfig database.Config) {
	connStr := buildConnStr(dbConfig)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		fmt.Printf("Error connecting to database: %v\n", err)
		return
	}
	defer db.Close()

	fmt.Println("Teams:")
	query := `SELECT team_id, team_name, team_password, team_color FROM teams ORDER BY team_id`
	rows, err := db.Query(query)
	if err != nil {
		fmt.Printf("Error querying teams: %v\n", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var name, password, color string
		if err := rows.Scan(&id, &name, &password, &color); err != nil {
			fmt.Printf("Error scanning team row: %v\n", err)
			continue
		}
		fmt.Printf("ID: %d, Name: %s, Color: %s\n", id, name, color)
	}
	if err = rows.Err(); err != nil {
		fmt.Printf("Row error: %v\n", err)
	}
}

func viewAuditLogs() {
	data, err := ioutil.ReadFile(auditLogFile)
	if err != nil {
		fmt.Printf("Error reading audit logs: %v\n", err)
		return
	}
	fmt.Println("Audit Logs:")
	fmt.Println(string(data))
}

func viewLogs() {
	data, err := ioutil.ReadFile(logging.GetFilePath())
	if err != nil {
		fmt.Printf("Error reading logs: %v\n", err)
		return
	}
	fmt.Println("Logs:")
	fmt.Println(string(data))
}

func startEngine() {
	if engineRunning {
		fmt.Println("Engine is already running.")
		return
	}
	engineRunning = true
	enginePaused = false
	fmt.Println("Engine started.")
}

func stopEngine() {
	if !engineRunning {
		fmt.Println("Engine is not running.")
		return
	}
	engineRunning = false
	enginePaused = false
	fmt.Println("Engine stopped.")
}

func pauseEngine() {
	if !engineRunning {
		fmt.Println("Engine is not running. Cannot pause.")
		return
	}
	if enginePaused {
		fmt.Println("Engine is already paused.")
		return
	}
	enginePaused = true
	fmt.Println("Engine paused.")
}

func resumeEngine() {
	if !engineRunning {
		fmt.Println("Engine is not running. Cannot resume.")
		return
	}
	if !enginePaused {
		fmt.Println("Engine is not paused.")
		return
	}
	enginePaused = false
	fmt.Println("Engine resumed.")
}

func getEngineState() string {
	if engineRunning {
		if enginePaused {
			return "paused"
		}
		return "running"
	}
	return "stopped"
}
