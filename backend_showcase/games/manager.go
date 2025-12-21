package games

import (
	"sync"
	"time"

	"NESTBackendShowcase/types"
)

// GameManager provides concurrency-safe lifecycle control for all active games.
type GameManager struct {
	mu     sync.RWMutex
	nextID int
	games  map[int]*types.GameStatus
}

// Global instance — used throughout the backend.
var GlobalGameManager = NewManager()

// NewManager creates an empty manager.
func NewManager() *GameManager {
	return &GameManager{
		games: make(map[int]*types.GameStatus),
	}
}

// Create registers a new game and returns its assigned ID.
func (m *GameManager) Create(game *types.GameStatus) int {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.nextID++
	game.ID = m.nextID
	game.StartedAt = time.Now()
	game.UpdatedAt = time.Now()

	m.games[game.ID] = game
	return game.ID
}

// Get retrieves a game by ID.
func (m *GameManager) Get(id int) (*types.GameStatus, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	g, ok := m.games[id]
	return g, ok
}

// SetStatus updates a game’s run state and timestamp.
func (m *GameManager) SetStatus(id int, status types.Status) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	g, ok := m.games[id]
	if !ok {
		return false
	}
	g.Status = status
	g.UpdatedAt = time.Now()
	return true
}

// Update replaces an existing game entry (for more complex edits).
func (m *GameManager) Update(id int, updated *types.GameStatus) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.games[id]; !ok {
		return false
	}
	m.games[id] = updated
	m.games[id].UpdatedAt = time.Now()
	return true
}

// Delete removes a game from the manager.
func (m *GameManager) Delete(id int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.games, id)
}

// List returns a snapshot of all active games.
func (m *GameManager) List() []*types.GameStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()

	list := make([]*types.GameStatus, 0, len(m.games))
	for _, g := range m.games {
		list = append(list, g)
	}
	return list
}
