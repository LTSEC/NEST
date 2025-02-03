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
	"database/sql"

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

	// The second step is to add all the teams from the yaml configuration to the database
	for _, team := range yamlConfig.Teams {
		// Add the team
		if err := database.AddTeamToDatabase(db, team, nil); err != nil {
			return err
		}
	}

	return nil
}

func StartEngine() {
	if ScoringEnabled {
		logging.ConsoleLogError("Engine is already running.")
		return
	}
	ScoringEnabled = true
	ScoringPaused = false
	logging.ConsoleLogSuccess("Engine started.")
}

func StopEngine() {
	if !ScoringEnabled {
		logging.ConsoleLogError("Engine is not running.")
		return
	}
	ScoringEnabled = false
	ScoringPaused = false
	logging.ConsoleLogSuccess("Engine stopped.")
}

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

func GetEngineState() string {
	if ScoringEnabled {
		if ScoringPaused {
			return "paused"
		}
		return "running"
	}
	return "stopped"
}
