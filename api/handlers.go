package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/LTSEC/NEST/enum"
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
