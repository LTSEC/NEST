package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/LTSEC/NEST/enum"
	"github.com/go-chi/chi"
)

// Returns all teams in the database as JSON
func ListTeams(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query("SELECT team_id, team_name, team_color FROM teams")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var teams []enum.Team

		for rows.Next() {
			var t enum.Team
			if err := rows.Scan(&t.ID, &t.Name, &t.Color); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			teams = append(teams, t)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(teams)
	}
}

// Returns all teams and their scores for each service, including is_up, successful_checks, and total_checks
func ListAllTeamScores(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Query all teams, their services, and the points of each service along with additional fields
		rows, err := db.Query(`
            SELECT t.team_id, t.team_name, t.team_color, s.service_name, 
                   ts.points, ts.is_up, ts.successful_checks, ts.total_checks
            FROM teams AS t
            JOIN team_services AS ts ON t.team_id = ts.team_id
            JOIN services AS s ON s.service_id = ts.service_id
        `)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		// ServiceInfo holds additional details for a service.
		type ServiceInfo struct {
			Points           int  `json:"points"`
			IsUp             bool `json:"is_up"`
			SuccessfulChecks int  `json:"successful_checks"`
			TotalChecks      int  `json:"total_checks"`
		}

		// TeamInfo aggregates team details and their associated services.
		type TeamInfo struct {
			ID       int                    `json:"ID"`
			Name     string                 `json:"Name"`
			Color    string                 `json:"Color"`
			Services map[string]ServiceInfo `json:"Services"`
		}

		// Map to aggregate team data: teamID -> TeamInfo
		teamMap := make(map[int]*TeamInfo)

		// Read each row and update the team map
		for rows.Next() {
			var (
				teamID           int
				teamName         string
				teamColor        string
				serviceName      string
				serviceScore     int
				isUp             bool
				successfulChecks int
				totalChecks      int
			)
			if err := rows.Scan(&teamID, &teamName, &teamColor, &serviceName, &serviceScore, &isUp, &successfulChecks, &totalChecks); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// Initialize the team entry if it doesn't exist
			if _, exists := teamMap[teamID]; !exists {
				teamMap[teamID] = &TeamInfo{
					ID:       teamID,
					Name:     teamName,
					Color:    teamColor,
					Services: make(map[string]ServiceInfo),
				}
			}
			// Set the service details for this team
			teamMap[teamID].Services[serviceName] = ServiceInfo{
				Points:           serviceScore,
				IsUp:             isUp,
				SuccessfulChecks: successfulChecks,
				TotalChecks:      totalChecks,
			}
		}
		// Check for iteration error
		if err := rows.Err(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Convert the map to a slice for JSON output
		results := make([]TeamInfo, 0, len(teamMap))
		for _, teamData := range teamMap {
			results = append(results, *teamData)
		}

		// Return JSON
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

// Returns a specific team's scores
func ListTeamScore(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		teamID := chi.URLParam(r, "teamID")
		if teamID == "" {
			http.Error(w, "teamID not provided", http.StatusBadRequest)
			return
		}

		rows, err := db.Query(`
			SELECT s.service_name, ts.points
			FROM services AS s
			JOIN team_services AS ts ON s.service_id = ts.service_id
			WHERE ts.team_id = $1
		`, teamID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var results []struct {
			Service string
			Score   int
		}

		for rows.Next() {
			var r struct {
				Service string
				Score   int
			}
			if err := rows.Scan(&r.Service, &r.Score); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			results = append(results, r)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Return JSON
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}
