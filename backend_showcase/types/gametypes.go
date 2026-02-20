package types

import (
	"time"
)

type Status string

const (
	// State before game is created
	StateQueued Status = "queued"
	// State during the game's terraform startup step
	StateStarting Status = "starting"
	// State during the game's ansible configuration step
	StateConfiguring Status = "configuring"
	// State after ansible and terraform has run and the game is playable
	StateRunning Status = "running"
	// State during the teardown of the network using terraform
	StateStopping Status = "stopping"
	// State while the game is completely stopped
	StateStopped Status = "stopped"
	// State when an error has occured that stops game creation
	StateError Status = "error"
	// Default state before any other state is known
	StateUnknown Status = "unknown"
)

type GameStatus struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Status    Status    `json:"status"`
	UpdatedAt time.Time `json:"updatedAt"`
	StartedAt time.Time `json:"startedAt"`
}

// Network represents a subnet or VLAN.
type Network struct {
	Name string `json:"name"`
	CIDR string `json:"cidr"`
}

// Application represents a multi-server logical application.
type Application struct {
	Name     string   `json:"name"`
	Servers  []string `json:"servers"`
	Services []string `json:"services"`
	Color    string   `json:"color"`
}

// BlackteamService represents external services (like scoring engines).
type BlackteamService struct {
	Name       string `json:"name"`
	TemplateID int    `json:"templateId"`
	HostID     int    `json:"hostId"`
	IP         string `json:"ip"`
}

// OSInfo stores an operating system descriptor.
type OSInfo struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// Device represents either a router or a server.
type Device struct {
	Name       string            `json:"name"`
	Type       string            `json:"type"` // "Router" or "Server"
	OS         OSInfo            `json:"os"`
	HostID     *int              `json:"hostId"` // nullable
	Interfaces map[string]string `json:"interfaces,omitempty"`
	Router     string            `json:"router,omitempty"`    // for servers
	Interface  string            `json:"interface,omitempty"` // for servers
	Segment    string            `json:"segment,omitempty"`
	DHCP       bool              `json:"dhcp,omitempty"`
	IP         string            `json:"ip,omitempty"`
	Services   map[string]int    `json:"services"`
}

// CyberGame represents the full exported network definition from the frontend.
type CyberGame struct {
	Networks          []Network          `json:"networks"`
	Devices           []Device           `json:"devices"`
	BlackteamServices []BlackteamService `json:"blackteamServices"`
	Applications      []Application      `json:"applications"`
}
