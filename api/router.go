package api

import (
	"database/sql"

	"github.com/go-chi/chi"
)

// SetupRouter creates and configures the Chi router
func SetupRouter(db *sql.DB) *chi.Mux {
	r := chi.NewRouter()

	// Add global middlewares here (logging, panic recovery, CORS, etc.)
	// e.g., r.Use(middleware.Logger)

	// Team routes
	r.Route("/teams", func(r chi.Router) {
		r.Get("/", ListTeams(db))               // Basic list of every team and their data (except passwords)
		r.Get("/scores", ListAllTeamScores(db)) // List of every team and their data and scores for each service
		// List a specific team's scores
		r.Route("/{teamID}", func(r chi.Router) {
			r.Get("/scores", ListTeamScore(db))
		})

	})

	return r
}
