package cli

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/LTSEC/scoring-engine/config"
	"github.com/LTSEC/scoring-engine/database"
	"github.com/LTSEC/scoring-engine/scoring"
)

var yamlConfig *config.Yaml
var ScoringStarted = false
var dbConfig database.Config

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
		fmt.Print(currDirectory + "$ ")
		userInput = inputParser()
		// slicing off the new line character for ease in manipulation and such
		userInput = strings.TrimSuffix(userInput, "\r\n")
		// if exit is typed, we want to exit the program
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
		return "Something went wrong"
	} else {
		return userInput
	}

}

func tokenizer(userInput string) []string {

	return strings.Split(userInput, " ")

}

// switch statement for command selection
func commandSelector(tokenizedInput []string) {

	HelpOutput := `Available commands:
	help (Outputs some helpful information)
	config (Recieves a path and parses the yaml config given)
	defaultconfig (Just loads test_yaml.yaml)
	checkconfig (Outputs the currently parsed yaml config)
	startup (Starts the scoring engine)
	toggle (Toggles the activity of the scoring engine)
	exit (exits the CLI)
	`

	// the switch acts on the first word of the command
	// the idea is that you'd pass the remaining args to the requisit functions
	switch tokenizedInput[0] {
	case "help":
		fmt.Println(HelpOutput)
	case "config":
		if len(tokenizedInput) != 2 {
			fmt.Println(Red + "[FAILURE] " + Reset + "The config requires a path")
		} else {
			yamlConfig = config.Parse(tokenizedInput[1])
			fmt.Println(Green + "[SUCCESS] " + Reset + "Added config.")
		}
	case "defaultconfig":
		yamlConfig = config.Parse("tests/default.yaml")
		fmt.Println(Green + "[SUCCESS] " + Reset + "Added config.")
	case "checkconfig":
		fmt.Printf("%+v\n", yamlConfig)
	case "startup":
		if ScoringStarted == false && yamlConfig != nil {
			ScoringStarted = true
			fmt.Println(Green + "[SUCCESS] " + Reset + "Run toggle to start scoring.")
			go scoring.ScoringStartup(dbConfig, yamlConfig)
		} else if yamlConfig == nil {
			fmt.Println(Red + "[FAILURE] " + Reset + "Provide a config first.")
		} else {
			fmt.Println(Red + "[FAILURE] " + Reset + "The scoring engine has already been started.")
		}
	case "toggle":
		if ScoringStarted == false {
			fmt.Println(Red + "[FAILURE] " + Reset + "Initalize the scoring engine first")
		} else {
			engine_status := scoring.ToggleScoring()
			fmt.Printf(Green+"[SUCCESS] "+Reset+"Scoring engine toggled "+Yellow+"%s"+Reset+".\n", engine_status)
		}
	case "exit":
		fmt.Println(Red + "[SHUTDOWN]")
		os.Exit(0)

	default:
		bashInjection(tokenizedInput)
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
			fmt.Println("couldn't run the guy", err)
		}
	} else {
		if len(command) == 2 {
			os.Chdir(command[1])
		} else {
			fmt.Println("please include dir")
		}
	}
}
