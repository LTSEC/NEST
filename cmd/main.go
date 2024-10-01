package main

import (
	"path/filepath"

	"github.com/LTSEC/scoring-engine/cli"
	"github.com/LTSEC/scoring-engine/web"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {

	// Echo instance
	e := echo.New()

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	// Get the project root directory
	projectRoot, _ := filepath.Abs("./")

	// Serve static files from the "web/images" directory
	e.Static("/images", filepath.Join(projectRoot, "web", "images"))

	// Routes
	e.GET("/", web.TableHandler)

	// WebSocket route
	e.GET("/ws", web.WebSocketHandler)

	// Start the CLI in a separate goroutine
	go cli.Cli()

	// Start the WebSocket broadcasting
	go web.BroadcastUpdates()

	// Start web server
	e.Logger.Fatal(e.Start(":8080"))
}
