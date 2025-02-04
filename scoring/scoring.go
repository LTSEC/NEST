package scoring

/*
TODO:
	When implementing the new scoring system, consider this:
		- Some services need to be segmented into new forms. For instance, instead of just "web" being a scoring type we can have options
			- WebHTTP (Port 80)
			- WebContent (The actual content of the website)
			- WebSSL (Port 443)
		- Some services should have the option to be partially scored, for instance the database
			- SQL Login
				- Partial points would be awarded for being able to log into the database but not having the correct RW permissions

	Full list of new services:
		WEB NEW
			- WebHTTP			(Score based on if something is accessible on port 80)
				- No partial awarded
			- WebContent		(Score based on if the website's content matches the expected content)
				- Toggle for Advanced	(Score based on if a user can be created on the website)
			- WebSSL			(Score based on if something is accessible on port 443)
				- No partial awarded
		ROUTER NEW
			- RouterICMP		(Score based on if the router can be pinged via ICMP)
				- No partial awarded
		SSH NEW
			- SSHLogin			(Score based on if the SSH user can log into the server)
				- No partial awarded
		FTP NEW
			- FTPLogin			(Score based on if the FTP user can log into the server)
				- No partial awarded
			- FTPWrite			(Score based on if the FTP user can write to the files expected)
				- No partial awarded
			- FTPRead			(Score based on if the FTP user can read the files expected)
				- No partial awarded
		DATABASE NEW
			- SQLLogin			(Score based on if the SQL user can log into the database and execute read commands)
				- Partial awarded if the user can access but not read/write
		DNS NEW
			- DNSInternalFWD	(Score based on if the DNS forward zone is working for all required machines in the internal network)
				- Partial awarded for each domain that works as a portion of the total score
			- DNSInternalREV	(Score based on if the DNS reverse zone is working for all required machines in the internal network)
				- Partial awarded for each domain that works as a portion of the total score
			- DNSExternalFWD	(Score based on if the DNS forward zone is working for all required machines in the external network)
				- Partial awarded for each domain that works as a portion of the total score
			- DNSExternalREV	(Score based on if the DNS reverse zone is working for all required machines in the external network)
				- Partial awarded for each domain that works as a portion of the total score
*/

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/LTSEC/NEST/config"
	"github.com/LTSEC/NEST/database"
	"github.com/LTSEC/NEST/logging"
)

var (
	ScoringEnabled bool
	ScoringPaused  bool
	logger         *logging.Logger
	RefreshTime    int
)

/*
Initalize begins the first processeses to make scoring work, including teams their services and creating links between the services and their team in order to facilitate scoring.
The function takes in the following values:

	cfg:			A database configuration, the one that is used in the CLI and database packages
	yamlConfig:		The main yaml configuration file that is loaded at startup of the program
	newlogger:		The logger that is responsible for logging all message in the program
*/
func Initalize(db *sql.DB, yamlConfig *config.YamlConfig, newlogger *logging.Logger) error {
	// First step in initalizing the scoring of services is connecting to the database
	logger = newlogger
	logger.LogMessage("Scoring initalization started.", "STATUS")

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

	return nil
}

// addServicesToTeam does as its name implies, by taking in a teamID, vmName, and vm object it is able to map each service to a team for scoring.
func addServicesToTeam(db *sql.DB, teamID int, vmName string, vm config.VirtualMachine) error {
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
