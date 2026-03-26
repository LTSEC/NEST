package ansiblerunner

import (
	"fmt"
	"os"
	"path/filepath"
)

// GameWorkDir returns the per-game ansible working directory.
// Each game gets its own directory so multiple games can run simultaneously
// without conflicting state or lock files.
func GameWorkDir(baseDir string, gameID int) string {
	return filepath.Join(baseDir, fmt.Sprintf("game-%d", gameID))
}

// EnsureGameDir creates the per-game ansible directory structure and copies
// the provider/module configuration from the shared infra template.
func EnsureGameDir(baseDir string, gameID int) (string, error) {
	dir := GameWorkDir(baseDir, gameID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("mkdir game dir: %w", err)
	}
	return dir, nil
}

// CleanupGameDir removes a per-game ansible directory after destruction.
func CleanupGameDir(baseDir string, gameID int) error {
	dir := GameWorkDir(baseDir, gameID)
	return os.RemoveAll(dir)
}

func RunAnsible() {

}
