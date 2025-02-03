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

	"github.com/LTSEC/NEST/config"
	"github.com/LTSEC/NEST/database"
	"github.com/LTSEC/NEST/logging"
	"github.com/LTSEC/NEST/scoring"
	"github.com/chzyer/readline"
	"golang.org/x/exp/rand"
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
var logger *logging.Logger
var rl *readline.Instance

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
func RunCLI(db *sql.DB, Version string, newlogger *logging.Logger) {
	// Configure readline with an ANSI-colored prompt and input filter.
	var err error
	rl, err = readline.NewEx(&readline.Config{
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
			// Handle Ctrl+C: if interrupted, quit the CLI.
			if err == readline.ErrInterrupt {
				logging.ConsoleLogMessage("Exiting CLI.")
				os.Exit(0)
			} else if err.Error() == "EOF" {
				// Continue on EOF to keep the CLI running.
				continue
			}
			logging.ConsoleLogError(fmt.Sprintf("Error reading line: %v", err))
			logger.LogMessage(fmt.Sprintf("Error reading line: %v", err), "ERROR")
			os.Exit(2)
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
		processCommand(line, db, Version)
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
func processCommand(input string, db *sql.DB, Version string) {
	tokens := strings.Fields(input)
	if len(tokens) == 0 {
		return
	}
	cmd := strings.ToLower(tokens[0])

	switch cmd {
	case "help":
		printHelp() // Assuming printHelp() internally uses logging or fmt, update if necessary
	case "exit":
		logging.ConsoleLogMessage("Exiting CLI.")
		os.Exit(0)
	case "version", "--version":
		printVersion(Version) // Assuming printVersion() internally uses logging or fmt, update if necessary
	case "score":
		// Expected: score check
		if len(tokens) > 1 && tokens[1] == "check" {
			if err := database.CheckTeamScores(db); err != nil {
				logging.ConsoleLogError("Error checking team scores: " + err.Error())
			}
		} else {
			logging.ConsoleLogMessage("Usage: score check")
		}
	case "uptime":
		// Expected: uptime validate
		if len(tokens) > 1 && tokens[1] == "validate" {
			if err := database.ValidateServiceUptime(db); err != nil {
				logging.ConsoleLogError("Error validating service uptime: " + err.Error())
			}
		} else {
			logging.ConsoleLogMessage("Usage: uptime validate")
		}
	case "report":
		// Expected: report generate
		if len(tokens) > 1 && tokens[1] == "generate" {
			if err := database.GenerateReport(db); err != nil {
				logging.ConsoleLogError("Error generating report: " + err.Error())
			}
		} else {
			logging.ConsoleLogMessage("Usage: report generate")
		}
	case "team":
		if len(tokens) < 2 {
			logging.ConsoleLogMessage("Usage: team [create|edit|view]")
			return
		}
		subcmd := strings.ToLower(tokens[1])
		switch subcmd {
		case "create":
			// Usage: team create <name>
			if len(tokens) != 3 {
				logging.ConsoleLogMessage("Usage: team create <name>")
				return
			}

			newTeam := config.Team{
				Name:  tokens[2],
				Color: generateRandomColor(),
			}

			if err := database.AddTeamToDatabase(db, newTeam, rl); err != nil {
				logging.ConsoleLogError("Error adding team to database: " + err.Error())
			}
		case "edit":
			// Usage: team edit <id> <newname>
			if len(tokens) != 4 {
				logging.ConsoleLogMessage("Usage: team edit <id> <newname>")
				return
			}
			id, err := strconv.Atoi(tokens[2])
			if err != nil {
				logging.ConsoleLogError("Invalid team ID. Must be an integer.")
				return
			}
			if err := database.EditTeam(id, tokens[3], db); err != nil {
				logging.ConsoleLogError("Error editing team: " + err.Error())
			}
		case "view":
			if err := database.ViewTeams(db); err != nil {
				logging.ConsoleLogError("Error viewing teams: " + err.Error())
			}
		default:
			logging.ConsoleLogMessage("Unknown team command. Use: team [create|edit|view]")
		}
	case "logs":
		// Expected: logs view <logtype>
		if len(tokens) > 2 && tokens[1] == "view" {
			switch tokens[2] {
			case "audit":
				viewAuditLogs() // Update if these use fmt internally
			case "logs":
				viewLogs() // Update if these use fmt internally
			default:
				logging.ConsoleLogError("Invalid log type.\nValid log types: 'audit' 'logs'")
			}
		} else {
			logging.ConsoleLogMessage("Usage: logs view <logtype>")
		}
	case "start":
		scoring.StartEngine()
	case "stop":
		scoring.StopEngine()
	case "pause":
		scoring.PauseEngine()
	case "resume":
		scoring.ResumeEngine()
	case "state":
		logging.ConsoleLogMessage(scoring.GetEngineState())
	default:
		logging.ConsoleLogError(fmt.Sprintf("Unknown command: %s. Type 'help' for available commands.", tokens[0]))
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
  state											- Get the engine's status.
`
	fmt.Println(helpText)
}

func printVersion(Version string) {
	fmt.Printf("NEST CLI Version %s\n", Version)
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

// Simple helper function to generate a random color
func generateRandomColor() string {
	rand.Seed(uint64(time.Now().Unix()))
	colorVal := rand.Intn(0xFFFFFF + 1)
	return fmt.Sprintf("#%06X", colorVal)
}
