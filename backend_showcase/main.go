package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"NESTBackendShowcase/database"
	"NESTBackendShowcase/games"
	"NESTBackendShowcase/logger"
	"NESTBackendShowcase/presets"
	"NESTBackendShowcase/terraformer"
	"NESTBackendShowcase/types"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

var mu sync.Mutex
var logManager = logger.NewLogManager()

// ---------------------------------------------------------------------------
// Authentication endpoints
// ---------------------------------------------------------------------------

func loginHandler(ctx echo.Context) error {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := ctx.Bind(&body); err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	user, err := database.GetUserByUsername(ctx.Request().Context(), body.Username)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": "database error"})
	}
	if user == nil || !database.CheckPassword(body.Password, user.PasswordHash) {
		return ctx.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
	}
	if body.Role != "" && user.Role != body.Role {
		return ctx.JSON(http.StatusUnauthorized, map[string]string{"error": "role mismatch"})
	}

	token, err := database.CreateSession(ctx.Request().Context(), user.ID)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create session"})
	}

	return ctx.JSON(http.StatusOK, map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id":    strconv.Itoa(user.ID),
			"name":  user.Username,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}

func verifyTokenHandler(ctx echo.Context) error {
	token := ctx.Request().Header.Get("Authorization")
	token = strings.TrimPrefix(token, "Bearer ")
	if token == "" {
		return ctx.JSON(http.StatusUnauthorized, map[string]string{"error": "missing token"})
	}

	user, err := database.ValidateSession(ctx.Request().Context(), token)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": "database error"})
	}
	if user == nil {
		return ctx.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid or expired token"})
	}

	return ctx.JSON(http.StatusOK, map[string]interface{}{
		"id":    strconv.Itoa(user.ID),
		"name":  user.Username,
		"email": user.Email,
		"role":  user.Role,
	})
}

func logoutHandler(ctx echo.Context) error {
	token := ctx.Request().Header.Get("Authorization")
	token = strings.TrimPrefix(token, "Bearer ")
	if token != "" {
		_ = database.DeleteSession(ctx.Request().Context(), token)
	}
	return ctx.NoContent(http.StatusOK)
}

// ---------------------------------------------------------------------------
// Terraform game hosting (preserves existing flow + per-game directories)
// ---------------------------------------------------------------------------

func createGame(ctx echo.Context) error {
	mu.Lock()
	defer mu.Unlock()

	var game types.CyberGame
	if err := ctx.Bind(&game); err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("invalid JSON: %v", err),
		})
	}

	wd, err := os.Getwd()
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("error getting working directory: %v", err),
		})
	}

	// Create the game state in memory
	gameName := game.Name
	if gameName == "" {
		gameName = "Test Game"
	}
	id := games.GlobalGameManager.Create(&types.GameStatus{
		Name:   gameName,
		Status: types.StateQueued,
	})

	// Create per-game terraform directory
	tfBaseDir := filepath.Join(wd, "..", "terraform_showcase")
	gameDir, err := terraformer.EnsureGameDir(tfBaseDir, id)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("failed to create game directory: %v", err),
		})
	}

	// Write game JSON to the per-game directory
	gameJSONPath := filepath.Join(gameDir, "game.json")
	gameFile, err := os.Create(gameJSONPath)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("failed to create game file: %v", err),
		})
	}
	enc := json.NewEncoder(gameFile)
	enc.SetIndent("", "  ")
	if err := enc.Encode(game); err != nil {
		gameFile.Close()
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("failed to write JSON: %v", err),
		})
	}
	gameFile.Close()

	// Also write to the legacy location for backwards compatibility
	legacyDir := filepath.Join(wd, "files", "game.json")
	if legacyFile, err := os.Create(legacyDir); err == nil {
		enc := json.NewEncoder(legacyFile)
		enc.SetIndent("", "  ")
		_ = enc.Encode(game)
		legacyFile.Close()
	}

	// Generate terraform into the per-game directory
	err = terraformer.GenerateTerraform(gameJSONPath)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("failed to generate terraform: %v", err),
		})
	}

	// Copy the generated main.tf from the shared output location to per-game dir
	sharedMainTF := filepath.Join(tfBaseDir, "infra", "main.tf")
	if data, err := os.ReadFile(sharedMainTF); err == nil {
		_ = os.WriteFile(filepath.Join(gameDir, "main.tf"), data, 0o644)
	}

	// Run terraform in the per-game directory
	go terraformer.RunTerraform(gameDir, logManager, id)

	gameState, success := games.GlobalGameManager.Get(id)
	if !success {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to retrieve the game state.",
		})
	}

	return ctx.JSON(http.StatusOK, gameState)
}

func stopGame(ctx echo.Context) error {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	game, ok := games.GlobalGameManager.Get(id)
	if !ok {
		return ctx.JSON(http.StatusNotFound, map[string]string{"error": "game id not found"})
	}

	if game.Status != types.StateRunning && game.Status != types.StateError && game.Status != types.StateStarting {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "the specified game is not running"})
	}

	wd, err := os.Getwd()
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("error getting working directory: %v", err),
		})
	}

	game.UpdatedAt = time.Now()
	game.Status = types.StateStopping

	// Try per-game directory first, fall back to legacy shared directory
	tfBaseDir := filepath.Join(wd, "..", "terraform_showcase")
	gameDir := terraformer.GameWorkDir(tfBaseDir, id)
	if _, err := os.Stat(gameDir); os.IsNotExist(err) {
		// Fall back to the legacy infra directory
		gameDir = filepath.Join(tfBaseDir, "infra")
	}

	go terraformer.DestroyTerraform(gameDir, logManager, game.ID)

	return ctx.JSON(http.StatusOK, game)
}

func returnGameStatus(ctx echo.Context) error {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	game, ok := games.GlobalGameManager.Get(id)
	if !ok {
		return ctx.JSON(http.StatusNotFound, map[string]string{"error": "game id not found"})
	}

	return ctx.JSON(http.StatusOK, game)
}

func streamLogs(ctx echo.Context) error {
	gameID, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid game id"})
	}

	ch, ok := logManager.GetChannel(gameID)
	if !ok {
		return ctx.JSON(http.StatusNotFound, map[string]string{"error": "no logs for this game"})
	}

	res := ctx.Response()
	res.Header().Set(echo.HeaderContentType, "text/event-stream")
	res.Header().Set("Cache-Control", "no-cache")
	res.Header().Set("Connection", "keep-alive")
	res.WriteHeader(http.StatusOK)

	flusher, ok := res.Writer.(http.Flusher)
	if !ok {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": "streaming unsupported"})
	}

	fmt.Fprintf(res, "data: [INFO] Log stream connected for game %d\n\n", gameID)
	flusher.Flush()

	for line := range ch {
		fmt.Fprintf(res, "data: %s\n\n", line)
		flusher.Flush()
	}

	fmt.Fprint(res, "event: close\ndata: Stream closed\n\n")
	flusher.Flush()

	return nil
}

func getPresets(ctx echo.Context) error {
	return ctx.JSON(http.StatusOK, presets.Presets)
}

// ---------------------------------------------------------------------------
// Database-backed CRUD endpoints
// ---------------------------------------------------------------------------

func listGamesHandler(ctx echo.Context) error {
	devID, err := strconv.Atoi(ctx.QueryParam("developerId"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "developerId required"})
	}
	gms, err := database.ListGamesForDeveloper(ctx.Request().Context(), devID)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if gms == nil {
		gms = []database.Game{}
	}
	return ctx.JSON(http.StatusOK, gms)
}

func createGameDBHandler(ctx echo.Context) error {
	g := &database.Game{}
	if err := ctx.Bind(g); err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := database.CreateGame(ctx.Request().Context(), g); err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return ctx.JSON(http.StatusCreated, g)
}

func updateGameDBHandler(ctx echo.Context) error {
	g := &database.Game{}
	if err := ctx.Bind(g); err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}
	g.ID = id
	if err := database.UpdateGame(ctx.Request().Context(), g); err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return ctx.JSON(http.StatusOK, g)
}

func deleteGameDBHandler(ctx echo.Context) error {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}
	devID, err := strconv.Atoi(ctx.QueryParam("developerId"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "developerId required"})
	}
	if err := database.DeleteGame(ctx.Request().Context(), id, devID); err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return ctx.NoContent(http.StatusOK)
}

func saveNetworkSnapshotHandler(ctx echo.Context) error {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}
	var snapshot json.RawMessage
	if err := ctx.Bind(&snapshot); err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
	}
	if err := database.SaveNetworkSnapshot(ctx.Request().Context(), id, snapshot); err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return ctx.NoContent(http.StatusOK)
}

// ---------------------------------------------------------------------------
// Session CRUD endpoints
// ---------------------------------------------------------------------------

func listSessionsHandler(ctx echo.Context) error {
	devID, err := strconv.Atoi(ctx.QueryParam("developerId"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "developerId required"})
	}
	sessions, err := database.ListSessionsForDeveloper(ctx.Request().Context(), devID)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if sessions == nil {
		sessions = []database.GameSession{}
	}
	return ctx.JSON(http.StatusOK, sessions)
}

func createSessionHandler(ctx echo.Context) error {
	s := &database.GameSession{}
	if err := ctx.Bind(s); err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := database.CreateGameSession(ctx.Request().Context(), s); err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return ctx.JSON(http.StatusCreated, s)
}

func updateSessionStatusHandler(ctx echo.Context) error {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}
	var body struct {
		Status               string  `json:"status"`
		InfrastructureID     *int    `json:"infrastructureId"`
		InfrastructureStatus *string `json:"infrastructureStatus"`
	}
	if err := ctx.Bind(&body); err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if body.Status != "" {
		if err := database.UpdateSessionStatus(ctx.Request().Context(), id, body.Status); err != nil {
			return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
	}
	if body.InfrastructureID != nil || body.InfrastructureStatus != nil {
		if err := database.UpdateInfrastructureStatus(ctx.Request().Context(), id, body.InfrastructureID, body.InfrastructureStatus); err != nil {
			return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
	}
	return ctx.NoContent(http.StatusOK)
}

func deleteSessionHandler(ctx echo.Context) error {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}
	if err := database.DeleteGameSession(ctx.Request().Context(), id); err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return ctx.NoContent(http.StatusOK)
}

// ---------------------------------------------------------------------------
// Team endpoints
// ---------------------------------------------------------------------------

func listTeamsHandler(ctx echo.Context) error {
	teams, err := database.ListTeams(ctx.Request().Context())
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if teams == nil {
		teams = []database.Team{}
	}
	return ctx.JSON(http.StatusOK, teams)
}

func createTeamHandler(ctx echo.Context) error {
	var body struct {
		Name      string `json:"name"`
		UserID    int    `json:"userId"`
		UserName  string `json:"userName"`
	}
	if err := ctx.Bind(&body); err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	team, err := database.CreateTeam(ctx.Request().Context(), body.Name, body.UserID, body.UserName)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return ctx.JSON(http.StatusCreated, team)
}

func getTeamForUserHandler(ctx echo.Context) error {
	userID, err := strconv.Atoi(ctx.QueryParam("userId"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "userId required"})
	}
	team, err := database.GetTeamForUser(ctx.Request().Context(), userID)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if team == nil {
		return ctx.JSON(http.StatusNotFound, map[string]string{"error": "no team found"})
	}
	return ctx.JSON(http.StatusOK, team)
}

// ---------------------------------------------------------------------------
// Archive endpoints
// ---------------------------------------------------------------------------

func listArchivesHandler(ctx echo.Context) error {
	devID, err := strconv.Atoi(ctx.QueryParam("developerId"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "developerId required"})
	}
	archives, err := database.ListArchivedGamesForDeveloper(ctx.Request().Context(), devID)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if archives == nil {
		archives = []database.ArchivedGame{}
	}
	return ctx.JSON(http.StatusOK, archives)
}

func getArchiveHandler(ctx echo.Context) error {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}
	archive, err := database.GetArchivedGameByID(ctx.Request().Context(), id)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	if archive == nil {
		return ctx.JSON(http.StatusNotFound, map[string]string{"error": "archive not found"})
	}
	return ctx.JSON(http.StatusOK, archive)
}

func deleteArchiveHandler(ctx echo.Context) error {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}
	if err := database.DeleteArchivedGame(ctx.Request().Context(), id); err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return ctx.NoContent(http.StatusOK)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	// Database connection (optional — falls back to in-memory if unavailable)
	dbAvailable := false
	if err := database.Connect(); err != nil {
		log.Printf("[WARN] Database connection failed: %v — running with in-memory state only", err)
	} else {
		dbAvailable = true
		defer database.Close()

		// Seed default users with proper bcrypt hashes
		if err := database.SeedDefaultUsers(context.Background()); err != nil {
			log.Printf("[WARN] Failed to seed default users: %v", err)
		}
		log.Println("[INFO] Database connected and seeded successfully")
	}

	// API Init
	apiHost := echo.New()

	// Allow CORS
	apiHost.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:5173"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{
			echo.HeaderOrigin,
			echo.HeaderContentType,
			echo.HeaderAccept,
			echo.HeaderAuthorization,
		},
	}))

	// --- Authentication ---
	apiHost.POST("/api/auth/login", loginHandler)
	apiHost.GET("/api/auth/verify", verifyTokenHandler)
	apiHost.POST("/api/auth/logout", logoutHandler)

	// --- Terraform hosting (existing endpoints, preserved for compatibility) ---
	apiHost.POST("/api/games", createGame)
	apiHost.POST("/api/games/:id/stop", stopGame)
	apiHost.GET("/api/games/:id/status", returnGameStatus)
	apiHost.GET("/api/games/:id/logs", streamLogs)
	apiHost.GET("/api/presets", getPresets)

	// --- Database-backed CRUD (new endpoints) ---
	if dbAvailable {
		// Games
		apiHost.GET("/api/db/games", listGamesHandler)
		apiHost.POST("/api/db/games", createGameDBHandler)
		apiHost.PUT("/api/db/games/:id", updateGameDBHandler)
		apiHost.DELETE("/api/db/games/:id", deleteGameDBHandler)
		apiHost.PUT("/api/db/games/:id/network", saveNetworkSnapshotHandler)

		// Sessions
		apiHost.GET("/api/db/sessions", listSessionsHandler)
		apiHost.POST("/api/db/sessions", createSessionHandler)
		apiHost.PUT("/api/db/sessions/:id", updateSessionStatusHandler)
		apiHost.DELETE("/api/db/sessions/:id", deleteSessionHandler)

		// Teams
		apiHost.GET("/api/db/teams", listTeamsHandler)
		apiHost.POST("/api/db/teams", createTeamHandler)
		apiHost.GET("/api/db/teams/for-user", getTeamForUserHandler)

		// Archives
		apiHost.GET("/api/db/archives", listArchivesHandler)
		apiHost.GET("/api/db/archives/:id", getArchiveHandler)
		apiHost.DELETE("/api/db/archives/:id", deleteArchiveHandler)
	}

	apiHost.Logger.Fatal(apiHost.Start(":4545"))
}
