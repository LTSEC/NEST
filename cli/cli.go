package cli

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/LTSEC/scoring-engine/config"
	"github.com/LTSEC/scoring-engine/database"
	"github.com/LTSEC/scoring-engine/scoring"
)

var yamlConfig *config.Yaml
var ScoringStarted = false
var dbConfig database.Config
var uptime int
var lastUptimeCheck time.Time

const (
	Red    = "\033[31m"
	Green  = "\033[32m"
	Yellow = "\033[33m"
	Blue   = "\033[34m"
	Reset  = "\033[0m"
)

// The CLI takes in user input from stdin to execute predetermined commands.
// This is intended to be the primary method of control for the scoring engine.
//
// Any input is tokenized into a slice, of which the first word is meant to act as the command.
// The subsequent inputs are meant to be passed to a later function that is called by the command if applicable.
//
// If input does not match any commands for the engine, then the entire command is passed into bash for handling.
func Cli(cfg database.Config) {

	dbConfig = cfg
	var userInput string

	for {
		var currDirectory, err = os.Getwd()
		if err != nil {
			fmt.Println("directory error")
		}
		fmt.Print("SCORING-ENGINE " + currDirectory + "$ ")
		userInput = inputParser()

		// Skip empty input
		if strings.TrimSpace(userInput) == "" {
			continue
		}

		userInput = strings.TrimSuffix(userInput, "\r\n")
		if userInput == "exit" {
			break
		}
		userArgs := tokenizer(userInput)
		commandSelector(userArgs)
	}

}

func inputParser() string {
	inputReader := bufio.NewReader(os.Stdin)
	userInput, err := inputReader.ReadString('\n')
	if err != nil {
		return ""
	}
	return strings.TrimSpace(userInput)
}

func tokenizer(userInput string) []string {

	return strings.Split(userInput, " ")

}

// Utility function that gets the current scoring engine uptime
func getuptime() int {
	if lastUptimeCheck.IsZero() {
		lastUptimeCheck = time.Now()
	}
	elapsed := time.Since(lastUptimeCheck)
	seconds := elapsed / time.Second
	uptime += int(seconds)
	lastUptimeCheck = time.Now()
	return uptime
}

// switch statement for command selection
func commandSelector(tokenizedInput []string) {

	HelpOutput := `Available commands:
	
help
	- Outputs some helpful information
config / cf
	- Recieves a path and parses the yaml config given
defaultconfig / dc
	- Loads the default configuration
checkconfig / cc
	- Outputs the currently parsed yaml config
startup / start / up
	- Starts the scoring engine in an off state (scoring not activated)
toggle / score / tg
	- Toggles the activity of the scoring engine
status / stat
	- Shows current state of the scoring engine
quickstart / qs
	- Loads the default configuration and starts the scoring engine in an off state (scoring not activated)

exit (exits the CLI)
`

	// the switch acts on the first word of the command
	// the idea is that you'd pass the remaining args to the requisit functions
	switch tokenizedInput[0] {
	case "help":
		fmt.Println(HelpOutput)
	case "config", "cf":
		if len(tokenizedInput) != 2 {
			fmt.Println(Red + "[FAILURE] " + Reset + "The config requires a path")
		} else {
			yamlConfig = config.Parse(tokenizedInput[1])
			fmt.Println(Green + "[SUCCESS] " + Reset + "Added config.")
		}
	case "defaultconfig", "dc":
		yamlConfig = config.Parse("tests/default.yaml")
		fmt.Println(Green + "[SUCCESS] " + Reset + "Added config.")
	case "checkconfig", "cc":
		fmt.Printf("%+v\n", yamlConfig)
	case "startup", "start", "up":
		if ScoringStarted == false && yamlConfig != nil {
			uptime = 0
			lastUptimeCheck = time.Now()
			ScoringStarted = true
			fmt.Println(Green + "[SUCCESS] " + Reset + "Run toggle to start scoring.")
			go scoring.ScoringStartup(dbConfig, yamlConfig)
		} else if yamlConfig == nil {
			fmt.Println(Red + "[FAILURE] " + Reset + "Provide a config first.")
		} else {
			fmt.Println(Red + "[FAILURE] " + Reset + "The scoring engine has already been started.")
		}
	case "toggle", "score", "tg":
		if ScoringStarted == false {
			fmt.Println(Red + "[FAILURE] " + Reset + "Initalize the scoring engine first")
		} else {
			engine_status := scoring.ToggleScoring()
			fmt.Printf(Green+"[SUCCESS] "+Reset+"Scoring engine toggled "+Yellow+"%s"+Reset+".\n", engine_status)
		}
	case "status", "stat":
		fmt.Printf(Green+"[SUCCESS] "+Reset+"Scoring is currently "+Yellow+"%s"+Reset+".\n", scoring.ScoringStatus())
	case "quickstart", "qs":
		if ScoringStarted == false {
			ScoringStarted = true
			yamlConfig = config.Parse("tests/default.yaml")
			fmt.Println(Green + "[SUCCESS] " + Reset + "Added config.")
			fmt.Println(Green + "[SUCCESS] " + Reset + "Started. Run toggle to start scoring.")
			go scoring.ScoringStartup(dbConfig, yamlConfig)
		} else {
			fmt.Println(Red + "[FAILURE] " + Reset + "The scoring engine has already been started.")
		}
	case "uptime", "ut":
		fmt.Printf(Yellow+"[INFO] "+Reset+"Uptime: %ds\n", getuptime())
	case "exit":
		fmt.Println(Red + "[SHUTDOWN]")
		os.Exit(0)

	default:
		if len(tokenizedInput[0]) > 0 {
			bashInjection(tokenizedInput)
		} else {
			fmt.Println("Invalid command.")
		}
	}
}

// function for injecting commands into bash
func bashInjection(command []string) {

	// run command guy with exec
	// the .. thing lets you pass a slice as if it were a hard-coded , separated list
	if command[0] != "cd" {
		cmd := exec.Command(command[0], command[1:]...)
		// force the output of cmd to be regular stdout
		cmd.Stdout = os.Stdout

		// check for error and print
		if err := cmd.Run(); err != nil {
			fmt.Println("Couldn't run the guy", err)
		}
	} else {
		if len(command) == 2 {
			os.Chdir(command[1])
		} else if len(command) < 2 {
			fmt.Println("Please include dir")
		} else {
			fmt.Println("Too many arguments")
		}
	}
}
