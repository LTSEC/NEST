package scoring

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/LTSEC/scoring-engine/config"
	"github.com/LTSEC/scoring-engine/database"
	"github.com/LTSEC/scoring-engine/logging"
)

var (
	ScoringOn   bool
	logger      *logging.Logger
	TeamNames   []string
	RefreshTime int
)

const (
	ftpTimeout    = 250 * time.Millisecond
	sshTimeout    = 250 * time.Millisecond
	successPoints = 1 // Points awarded if a service is successful
)

type Team struct {
	ID    int    // Corresponds to team_id in the database
	Name  string // Corresponds to team_name in the database
	Color string // Corresponds to team_color in the database
}

type Service struct {
	ID      int    // Corresponds to service_id in the database
	Name    string // Corresponds to service_name in the database
	BoxName string // Corresponds to box_name in the database
}

// Starts the whole scoring process by connecting to the local database and
// adding the teams and services to the local database
func ScoringStartup(cfg database.Config, yamlConfig *config.Yaml) error {
	logger = new(logging.Logger)
	logger.StartLog()
	logger.LogMessage("Scoring started up.", "INFO")

	RefreshTime = 15
	ScoringOn = false

	db, err := connectToDatabase(cfg)
	if err != nil {
		logger.LogMessage("Failed to connect to PostgreSQL database.", "ERROR")
		return fmt.Errorf("failed to connect to PostgreSQL: %w", err)
	}
	defer db.Close()
	logger.LogMessage("Connected to PostgreSQL database.", "INFO")

	// Add admins to the database
	query := `INSERT INTO admin_users (name, password) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING;`
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = db.ExecContext(ctx, query, "admin", "admin")
	if err != nil {
		// No logger initalized here yet
	}

	// Add teams from YAML config to the database
	for _, team := range yamlConfig.Teams {
		// Add the team to the database
		if err := addTeamToDatabase(db, team); err != nil {
			logger.LogMessage(fmt.Sprintf("Failed to add team %s to the database: %v", team.Name, err), "ERROR")
			return fmt.Errorf("failed to add team %s to the database: %w", team.Name, err)
		}
		logger.LogMessage(fmt.Sprintf("Team %s added to the database.", team.Name), "INFO")

		// For each team, loop over boxes to add the box's services to the team
		for boxName, box := range yamlConfig.Boxes {
			if err := addServicesToTeam(db, team.ID, boxName, box); err != nil {
				logger.LogMessage(fmt.Sprintf("Failed to add services for team %s from box %s: %v", team.Name, boxName, err), "ERROR")
				return fmt.Errorf("failed to add services for team %s from box %s: %w", team.Name, boxName, err)
			}
			logger.LogMessage(fmt.Sprintf("Services from box %s added to team %s.", boxName, team.Name), "INFO")
		}
	}

	ticker := time.NewTicker(time.Duration(RefreshTime) * time.Second)
	defer ticker.Stop()

	// Every *RefreshTime* seconds, score every service
	for range ticker.C {
		if ScoringOn {
			err := RunScoring(db, yamlConfig)
			if err != nil {
				fmt.Printf("Error running scoring: %v\n", err)
			}
		}
	}

	return nil
}

// Inserts a team into the database
func addTeamToDatabase(db *sql.DB, team config.Team) error {
	query := `INSERT INTO teams (team_id, team_name, team_password, team_color) VALUES ($1, $2, $3, $4) ON CONFLICT (team_name) DO NOTHING;`
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := db.ExecContext(ctx, query, team.ID, team.Name, team.Password, team.Color)
	if err != nil {
		logger.LogMessage(fmt.Sprintf("Failed to insert team into database: %s", err.Error()), "ERROR")
	}
	return nil
}

// Inserts a services into a team in the database
func addServicesToTeam(db *sql.DB, teamID int, boxName string, box config.Box) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	for serviceName := range box.Services {
		// Concatenate the box name with the service name for a unique service name
		fullServiceName := fmt.Sprintf("%s_%s", boxName, serviceName)

		// Ensure the service with the parent box name exists in the services table
		_, err := db.ExecContext(ctx, `
			INSERT INTO services (service_name, box_name) 
			VALUES ($1, $2) 
			ON CONFLICT (service_name, box_name) DO NOTHING;
		`, fullServiceName, boxName)
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

// Establishes a connection to the PostgreSQL database.
func connectToDatabase(cfg database.Config) (*sql.DB, error) {
	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open connection to database: %w", err)
	}

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	return db, nil
}

// The main loop for scoring
func RunScoring(db *sql.DB, yamlConfig *config.Yaml) error {
	// Retrieve all teams from the database
	teams, err := getAllTeams(db)
	if err != nil {
		return fmt.Errorf("failed to retrieve teams: %w", err)
	}

	for _, team := range teams {
		// Retrieve all services associated with the team
		services, err := getTeamServices(db, team.ID)
		if err != nil {
			return fmt.Errorf("failed to retrieve services for team %d: %w", team.ID, err)
		}

		// Iterate over each service for the team
		for _, service := range services {
			// Locate the correct box configuration using box name
			boxConfig, boxExists := yamlConfig.Boxes[service.BoxName]
			if !boxExists {
				logger.LogMessage(fmt.Sprintf("Box configuration for box %s not found in YAML config\n", service.BoxName), "INFO")
				continue
			}

			// Extract the actual service name by removing the box name prefix
			// Expected format of `service.Name` is "boxName_serviceName"
			parts := strings.SplitN(service.Name, "_", 2)
			if len(parts) != 2 {
				logger.LogMessage(fmt.Sprintf("Service name %s does not have the expected format (box_service)\n", service.Name), "INFO")
				continue
			}
			originalServiceName := parts[1]

			// Get the specific service configuration within the box using the original service name
			serviceConfig, serviceExists := boxConfig.Services[originalServiceName]
			if !serviceExists {
				logger.LogMessage(fmt.Sprintf("Service configuration for %s in box %s not found in YAML config\n", originalServiceName, service.BoxName), "INFO")
				continue
			}

			// Pass relevant details including fourth_octet, but not the full IP address
			// TODO: Update this interiorip stuff, since going through a router would cause issues
			// FIX: i dont know
			points, isUp, err := applyScoringFunction(
				team.ID,
				originalServiceName,
				yamlConfig.InteriorIP,
				boxConfig.FourthOctet,
				serviceConfig.Port,
				serviceConfig.Username,
				serviceConfig.Password,
			)
			if err != nil {
				logger.LogMessage(fmt.Sprintf("Error scoring team %d for service %s: %v", team.ID, service.Name, err), "INFO")
			}

			// Update the score and status in the team_services table
			err = updateServiceScore(db, team.ID, service.ID, points, isUp)
			if err != nil {
				logger.LogMessage(fmt.Sprintf("Failed to update score for team %d, service %s: %v", team.ID, service.Name, err), "INFO")
			}
		}
	}

	return nil
}

// Gets all the teams from the SQL database
func getAllTeams(db *sql.DB) ([]Team, error) {
	query := "SELECT team_id, team_name, team_color FROM teams"
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var teams []Team
	for rows.Next() {
		var team Team
		if err := rows.Scan(&team.ID, &team.Name, &team.Color); err != nil {
			return nil, err
		}
		teams = append(teams, team)
	}
	return teams, nil
}

// Gets a team's services from the SQL database
func getTeamServices(db *sql.DB, teamID int) ([]Service, error) {
	query := `
		SELECT s.service_id, s.service_name, s.box_name
		FROM services s
		JOIN team_services ts ON s.service_id = ts.service_id
		WHERE ts.team_id = $1
	`
	rows, err := db.Query(query, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var services []Service
	for rows.Next() {
		var service Service
		if err := rows.Scan(&service.ID, &service.Name, &service.BoxName); err != nil {
			return nil, err
		}
		services = append(services, service)
	}
	return services, nil
}

// Applies scoring of each service
func applyScoringFunction(teamID int, serviceName, baseIP string, fourthOctet int, port int, username, password string) (int, bool, error) {
	address, err := constructIPAddress(baseIP, teamID, fourthOctet)
	if err != nil {
		return 0, false, fmt.Errorf("failed to construct IP address: %w", err)
	}

	// Apply the scoring function based on service type
	switch serviceName {
	case "ftp":
		return ScoreFTP(address, port, username, password)
	case "web":
		return ScoreWeb("", address, port)
	case "ssh":
		return ScoreSSH(address, port, username, password)
	// Add cases for other services like web, dns, etc.
	default:
		return 0, false, fmt.Errorf("unknown service %s", serviceName)
	}
}

// Updates the points and status (is_up) of a team-service relationship in the database
func updateServiceScore(db *sql.DB, teamID, serviceID, points int, isUp bool) error {
	// Set up context with a timeout
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Start a transaction to ensure atomic operations
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}

	// Update points and status in team_services
	queryUpdate := `
	 UPDATE team_services
	 SET 
		 points = points + $1, 
		 is_up = $2,
		 total_checks = total_checks + 1,
		 successful_checks = successful_checks + CASE WHEN $2 THEN 1 ELSE 0 END
	 WHERE team_id = $3 AND service_id = $4
 `
	_, err = tx.ExecContext(ctx, queryUpdate, points, isUp, teamID, serviceID)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to update team_services: %w", err)
	}

	queryInsert := `
		INSERT INTO service_checks (team_service_id, status)
		SELECT team_service_id, $1
		FROM team_services
		WHERE team_id = $2 AND service_id = $3
	`
	_, err = tx.ExecContext(ctx, queryInsert, isUp, teamID, serviceID)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to insert into service_checks: %w", err)
	}

	// Trim to keep only the last 10 checks
	queryTrim := `
		DELETE FROM service_checks
		WHERE team_service_id = (
			SELECT team_service_id
			FROM team_services
			WHERE team_id = $1 AND service_id = $2
		)
		AND check_id NOT IN (
			SELECT check_id
			FROM service_checks
			WHERE team_service_id = (
				SELECT team_service_id
				FROM team_services
				WHERE team_id = $1 AND service_id = $2
			)
			ORDER BY timestamp DESC
			LIMIT 10
		)
	`
	_, err = tx.ExecContext(ctx, queryTrim, teamID, serviceID)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to trim service_checks: %w", err)
	}

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// Utility function that builds the IP address from the base IP, team ID, and fourth octet
func constructIPAddress(baseIP string, teamID int, fourthOctet int) (string, error) {
	// Split the base IP into quartets
	ipParts := strings.Split(baseIP, ".")
	if len(ipParts) != 4 {
		return "", fmt.Errorf("invalid base IP format: %s", baseIP)
	}

	ipParts[2] = fmt.Sprintf("%d", teamID)
	ipParts[3] = fmt.Sprintf("%d", fourthOctet)

	return strings.Join(ipParts, "."), nil
}

// Utility function to toggle scoring on and off
func ToggleScoring() string {
	ScoringOn = !ScoringOn
	state := "off"
	if ScoringOn {
		state = "on"
	}
	logger.LogMessage(fmt.Sprintf("Scoring is now %s", state), "INFO")

	return state
}
