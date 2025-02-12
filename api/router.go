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
		r.Get("/", ListTeams(db))
	})

	return r
}
