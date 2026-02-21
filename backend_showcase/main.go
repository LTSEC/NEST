package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"NESTBackendShowcase/games"
	"NESTBackendShowcase/logger"
	"NESTBackendShowcase/presets"
	"NESTBackendShowcase/terraformer"
	"NESTBackendShowcase/types"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

var nextID = 1
var mu sync.Mutex

var logManager = logger.NewLogManager()

// Creates a new game instance and returns the game
func createGame(ctx echo.Context) error {
	mu.Lock()
	defer mu.Unlock()

	// Get the actual game JSON provided by the frontend
	var game types.CyberGame

	if err := ctx.Bind(&game); err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("invalid JSON: %v", err),
		})
	}
	// Create a file to be used with the python terraform parser script
	wd, err := os.Getwd()
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("error getting working directory: %v", err),
		})
	}

	filename := "game.json"
	file_dir := filepath.Join(wd, "files", filename)

	file, err := os.Create(file_dir)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("failed to create file: %v", err),
		})
	}

	enc := json.NewEncoder(file)
	enc.SetIndent("", "  ")
	if err := enc.Encode(game); err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("failed to write JSON: %v", err),
		})
	}

	file.Close()

	// Create the game state in memory
	gameName := game.Name
	if gameName == "" {
		gameName = "Test Game"
	}
	id := games.GlobalGameManager.Create(&types.GameStatus{
		Name:   gameName,
		Status: types.StateQueued,
	})

	// Generate terraform
	err = terraformer.GenerateTerraform(file_dir)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("failed to generate terraform from '%s': %v", file_dir, err),
		})
	}
	// TODO: Run terraform and ansible
	go terraformer.RunTerraform(filepath.Join(wd, "..", "terraform_showcase"), logManager, id)

	gameState, success := games.GlobalGameManager.Get(id)
	if !success {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to retrieve the game state.",
		})
	}

	return ctx.JSON(http.StatusOK, gameState)
}

// Stops a running game safely
func stopGame(ctx echo.Context) error {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	game, ok := games.GlobalGameManager.Get(id)
	if !ok {
		return ctx.JSON(http.StatusNotFound, map[string]string{"error": "game id not found"})
	}

	if game.Status != types.StateRunning {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "the specified game is not running"})
	}

	wd, err := os.Getwd()
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("error getting working directory: %v", err),
		})
	}

	game.UpdatedAt = time.Now()

	game.Status = types.StateStopping
	go terraformer.DestroyTerraform(filepath.Join(wd, "..", "terraform_showcase"), logManager, game.ID)

	// TODO: Begin stopping the game here
	return ctx.JSON(http.StatusOK, game)
}

// Returns a GameStatus
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

// Streams logs to the frontend
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

	// Notify frontend the stream has started
	fmt.Fprintf(res, "data: [INFO] Log stream connected for game %d\n\n", gameID)
	flusher.Flush()

	// Stream lines as they arrive
	for line := range ch {
		fmt.Fprintf(res, "data: %s\n\n", line)
		flusher.Flush()
	}

	// Notify the frontend that the stream has ended
	fmt.Fprint(res, "event: close\ndata: Stream closed\n\n")
	flusher.Flush()

	return nil
}

// Returns a list of network presets
func getPresets(ctx echo.Context) error {
	return ctx.JSON(http.StatusOK, presets.Presets)
}

func main() {
	// API Init
	apiHost := echo.New()

	// Allow CORS
	apiHost.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:5173"}, // Vite dev server origin
		// TODO: change dynamically?
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodOptions},
		AllowHeaders: []string{
			echo.HeaderOrigin,
			echo.HeaderContentType,
			echo.HeaderAccept,
		},
	}))

	// GETs
	apiHost.GET("/api/games/:id/status", returnGameStatus)
	apiHost.GET("/api/games/:id/logs", streamLogs)
	apiHost.GET("/api/presets", getPresets)

	// POSTs
	apiHost.POST("/api/games", createGame)
	apiHost.POST("/api/games/:id/stop", stopGame)

	apiHost.Logger.Fatal(apiHost.Start(":4545"))
}
