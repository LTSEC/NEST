package logger

import (
	"fmt"
	"io"
	"sync"
	"time"
)

// LogManager manages live log channels for active games.
type LogManager struct {
	mu   sync.RWMutex
	logs map[int]chan string
}

// LogWriter duplicates Terraform stdout/stderr to both
// console (mirror) and the SSE log channel.
type LogWriter struct {
	mu     sync.Mutex
	ch     chan string
	mirror io.Writer
	prefix string
}

// NewLogManager initializes a LogManager.
func NewLogManager() *LogManager {
	return &LogManager{
		logs: make(map[int]chan string),
	}
}

// CreateChannel allocates a new log channel for a game ID.
func (m *LogManager) CreateChannel(gameID int) chan string {
	m.mu.Lock()
	defer m.mu.Unlock()
	ch := make(chan string, 100)
	m.logs[gameID] = ch
	return ch
}

// GetChannel retrieves a log channel if it exists.
func (m *LogManager) GetChannel(gameID int) (chan string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ch, ok := m.logs[gameID]
	return ch, ok
}

// CloseChannel closes and removes a log channel.
func (m *LogManager) CloseChannel(gameID int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if ch, ok := m.logs[gameID]; ok {
		close(ch)
		delete(m.logs, gameID)
	}
}

// NewLogWriter creates a LogWriter that mirrors output to both the console
// (mirror) and the frontend log stream via channel ch.
func NewLogWriter(ch chan string, mirror io.Writer, prefix string) *LogWriter {
	return &LogWriter{
		ch:     ch,
		mirror: mirror,
		prefix: prefix,
	}
}

// Write implements io.Writer, satisfying the interface used by
// TerraformExec.SetStdout / SetStderr.
func (lw *LogWriter) Write(p []byte) (n int, err error) {
	lw.mu.Lock()
	defer lw.mu.Unlock()

	// Always mirror to terminal
	if lw.mirror != nil {
		lw.mirror.Write(p)
	}

	// Forward Terraform output to SSE
	timestamp := time.Now().Format("15:04:05")
	line := fmt.Sprintf("[%s] %s%s", timestamp, lw.prefix, string(p))
	lw.ch <- line

	return len(p), nil
}
