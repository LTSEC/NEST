package api

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi"
)

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// SetupRouter creates and configures the Chi router
func SetupRouter(db *sql.DB) *chi.Mux {
	r := chi.NewRouter()
	r.Use(enableCORS)

	// TODO: Add global middlewares here (logging, panic recovery, CORS, etc.)
	// TODO: create middlewares package
	// e.g., r.Use(middleware.Logger)

	// All routes
	r.Route("/api", func(r chi.Router) {
		// Team routes
		r.Route("/teams", func(r chi.Router) {
			r.Get("/", ListTeams(db))               // Basic list of every team and their data (except passwords)
			r.Get("/scores", ListAllTeamScores(db)) // List of every team and their data and scores for each service
			// List a specific team's scores
			r.Route("/{teamID}", func(r chi.Router) {
				r.Get("/scores", ListTeamScore(db))
			})
		})
	})

	return r
}
