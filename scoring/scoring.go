package scoring

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/LTSEC/NEST/database"
	"github.com/LTSEC/NEST/enum"
	"github.com/LTSEC/NEST/logging"
	"github.com/LTSEC/NEST/services"
)

var (
	// Vars

	ScoringEnabled   bool      // Whether scoring has been enabled yet
	ScoringKilled    bool      // Represents when an order to cease scoring comes through
	ScoringPaused    bool      // Represents when scoring has been paused
	ScoringIteration int       // The current iteration of scoring, i.e. the 50th round of scoring
	RefreshTime      int  = 15 // How long to wait (in seconds) between scoring rounds
	ScoringRound     int       // The current round of scoring
	// Pointers

	logger     *logging.Logger  // Pointer to the active logger
	db         *sql.DB          // Pointer to the active DB connection
	yamlConfig *enum.YamlConfig // Pointer to the loaded yaml configuration
)

/*
Initalize begins the first processeses to make scoring work, importing teams and services into the database,
and creating links between them, to facilitate scoring.
The function takes in the following values:

	cfg:			A database configuration, the one that is used in the CLI and database packages
	yamlConfig:		The main yaml configuration file that is loaded at startup of the program
	newlogger:		The logger that is responsible for logging all message in the program
*/
func Initalize(newdb *sql.DB, newyamlConfig *enum.YamlConfig, newlogger *logging.Logger) error {
	// First step in initalizing the scoring of services is connecting to the database
	logger = newlogger
	logger.LogMessage("Scoring initalization started.", "STATUS")

	db = newdb
	yamlConfig = newyamlConfig

	ScoringRound = 0 // Set the scoring round to 0

	logging.ConsoleLogMessage("Loading teams...")
	// The second step is to add all the teams from the yaml configuration to the database
	for _, team := range yamlConfig.Teams {
		// Add the team
		if err := database.AddTeamToDatabase(db, team, nil); err != nil {
			logger.LogMessage(fmt.Sprintf("Error occured while adding team %s to the database: %v", team.Name, err), "ERROR")
			return err
		}
		logging.ConsoleLogSuccess(fmt.Sprintf("Team %s loaded, loading services...", team.Name))

		// If the team was added successfully, we add each virtual machine's services to the team
		for vmName, vm := range yamlConfig.VirtualMachines {
			if err := addServicesToTeam(db, team.ID, vmName, vm); err != nil {
				logger.LogMessage(fmt.Sprintf("Error occured while adding service on box %s to team %s: %v", vmName, team.Name, err), "ERROR")
				return fmt.Errorf("failed to add services for team %s from box %s: %w", team.Name, vmName, err)
			}
		}
		logging.ConsoleLogSuccess(fmt.Sprintf("Team %s services loaded.", team.Name))
	}

	// Scoring loop
	for {
		if ScoringEnabled || ScoringPaused {
			score()
			time.Sleep(time.Second * time.Duration(RefreshTime))
		} else if ScoringKilled {
			break
		}
	}

	return nil
}

// addServicesToTeam does as its name implies, by taking in a teamID, vmName, and vm object it is able to map each service to a team for scoring.
func addServicesToTeam(db *sql.DB, teamID int, vmName string, vm enum.VirtualMachine) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	for serviceName := range vm.Services {
		// Concatenate the box name with the service name for a unique service name
		fullServiceName := fmt.Sprintf("%s_%s", vmName, serviceName)

		// Ensure the service with the parent box name exists in the services table
		_, err := db.ExecContext(ctx, `
			INSERT INTO services (service_name, box_name) 
			VALUES ($1, $2) 
			ON CONFLICT (service_name, box_name) DO NOTHING;
		`, fullServiceName, vmName)
		if err != nil {
			logger.LogMessage(fmt.Sprintf("Failed to insert service %s into services table: %s", fullServiceName, err.Error()), "ERROR")
			continue // Skip to the next service if there was an error
		}

		// Retrieve the service_id for the concatenated service name
		var serviceID int
		err = db.QueryRowContext(ctx, "SELECT service_id FROM services WHERE service_name = $1", fullServiceName).Scan(&serviceID)
		if err != nil {
			logger.LogMessage(fmt.Sprintf("Failed to retrieve service_id for service %s: %s", fullServiceName, err.Error()), "ERROR")
			continue
		}

		// Insert into team_services, associating the team with the service
		query := `INSERT INTO team_services (team_id, service_id, points, is_up) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING;`
		_, err = db.ExecContext(ctx, query, teamID, serviceID, 0, false) // Default points = 0, is_up = false
		if err != nil {
			logger.LogMessage(fmt.Sprintf("Failed to insert team-service relationship for team %d and service %s: %s", teamID, fullServiceName, err.Error()), "ERROR")
		}
	}

	return nil
}

// The function called to score all included services.
func score() error {
	// First retrieve all teams in the database to account for created/deleted teams
	ScoringRound += 1
	teams, err := database.GetAllTeams(db)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Error occured while getting teams from the database: %v", err), "ERROR")
		return fmt.Errorf("failed to retrieve teams from the database: %w", err)
	}

	// Get the services for each team and score them
	for _, team := range teams {
		// Retrieve all services associated with the team
		services, err := database.GetTeamServices(db, team.ID)
		if err != nil {
			return fmt.Errorf("failed to retrieve services for team %d: %w", team.ID, err)
		}

		// Loop over services
		for _, service := range services {
			if service.Disabled {
				continue
			}

			// Locate the correct virtual machine
			vmConfig, vmExists := yamlConfig.VirtualMachines[service.VMName]
			if !vmExists {
				logger.LogMessage(fmt.Sprintf("Error getting VM configuration for VM %s: configuration not found in YAML", service.VMName), "ERROR")
				continue // don't attempt to score it
			}

			// Get the actual service name and it's configuration
			// Convert VMname_ServiceName to ServiceName
			parts := strings.SplitN(service.Name, "_", 2)
			if len(parts) != 2 {
				logger.LogMessage(fmt.Sprintf("Error getting service %s's service name: too many or too few parts, check formatting for extra underscores.", service.Name), "ERROR")
				continue // don't attempt to score it
			}
			serviceName := parts[1]
			serviceConfig, serviceExists := vmConfig.Services[serviceName]
			if !serviceExists {
				logger.LogMessage(fmt.Sprintf("Error getting service %s's configuration: configuration not found in YAML", service.Name), "ERROR")
				continue // don't attempt to score it
			}

			// Once the services configuration, virtual machine configuration, and team are all acquired we can score the service
			award, status, err := serviceSelector(team, serviceName, serviceConfig, vmConfig)
			if err != nil {
				logger.LogMessage(fmt.Sprintf("Error occured when scoring service %s for team %d: %v", service.Name, team.ID, err), "ERROR")
				continue // don't attempt to score it
			}

			if err = database.UpdateServiceScore(db, team.ID, service.ID, award, status); err != nil {
				logger.LogMessage(fmt.Sprintf("Error occured while updating the score for service %s for team %d: %v", service.Name, team.ID, err), "ERROR")
				// at this point we already tried, whatever
			}

			logger.LogMessage(fmt.Sprintf("Service %s was successfully scored UP: %b AWARD: %d", serviceName, status, award), "DEBUG")

		}
	}

	logger.LogMessage(fmt.Sprintf("Finished scoring round %d", ScoringRound), "INFO")

	return nil
}

// Service selector selects the correct service and scores it, returning the amount of points
// that need to be added to a team. Any new services need to be included here.
func serviceSelector(scoredTeam enum.ScoringTeam, serviceName string, scoredService enum.Service, scoredVM enum.VirtualMachine) (int, bool, error) {
	address, err := constructIPAddress(scoredVM.IPSchema, scoredTeam.ID)
	if err != nil {
		return 0, false, fmt.Errorf("failed to construct IP address: %w", err)
	}

	scoringFunc, ok := services.ScoringDispatch[serviceName]
	if !ok {
		// unknown service
		return 0, false, fmt.Errorf("unknown service %s", serviceName)
	}
	// Now call the scoring function
	return scoringFunc(scoredService, address)

}

// Utility function that builds the IP address from the base IP, team ID, and fourth octet.
//
// Given a schema "192.168.T.5"
//
// Given a team ID "1"
//
// Would convert an ip schema "192.168.T.5" --> 192.168.1.5 if the team ID
func constructIPAddress(schema string, teamID int) (string, error) {
	// Split the base IP into quartets and check
	ipParts := strings.Split(schema, ".")
	if len(ipParts) != 4 {
		return "", fmt.Errorf("invalid IP schema format: %s", schema)
	}

	finalIp := strings.Replace(schema, "t", fmt.Sprintf("%d", teamID), 1)
	finalIp = strings.Replace(finalIp, "T", fmt.Sprintf("%d", teamID), 1)

	return finalIp, nil
}

// // // START ENGINE CONTROLS SECTION

// Enable the scoring engine by continuing the loop that checks services and scores them.
// Scores immediately upon startup.
func StartEngine() {
	if ScoringEnabled {
		logging.ConsoleLogError("Engine is already running.")
		return
	}
	ScoringEnabled = true
	ScoringPaused = false
	logging.ConsoleLogSuccess("Engine started.")
}

// Disable the scoring engine by stopping the loop that checks services and scores them.
// Exits the game, you cannot recontinue the game after stopping the scoring engine.
func StopEngine() {
	if !ScoringEnabled {
		logging.ConsoleLogError("Engine is not running.")
		return
	}
	ScoringEnabled = false
	ScoringPaused = false
	ScoringKilled = true
	logging.ConsoleLogSuccess("Engine stopped.")
}

// Pauses the scoring engine by temporarily stopping the loop that checks services and scores them.
// The game can be resumed by resuming the engine afterwards.
func PauseEngine() {
	if !ScoringEnabled {
		logging.ConsoleLogError("Engine is not running.")
		return
	}
	if ScoringPaused {
		logging.ConsoleLogError("Engine is already paused.")
		return
	}
	ScoringPaused = true
	logging.ConsoleLogSuccess("Engine paused.")
}

// Resumes the scoring engine by resuming in the loop that checks services and scores them.
// This does not start scoring after stopping.
func ResumeEngine() {
	if !ScoringEnabled {
		logging.ConsoleLogError("Engine is not running.")
		return
	}
	if !ScoringPaused {
		logging.ConsoleLogError("Engine is not paused.")
		return
	}
	ScoringPaused = false
	logging.ConsoleLogSuccess("Engine resumed.")
}

// Returns "paused", "running", or "stopped" depending on current engine state.
func GetEngineState() string {
	if ScoringEnabled {
		if ScoringPaused {
			return "paused"
		}
		return "running"
	}
	return "stopped"
}
