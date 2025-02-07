package services

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/LTSEC/NEST/enum"
	"golang.org/x/exp/rand"
)

const (
	// Timeouts, miliseconds
	router_timeout = 750
	ftp_timeout    = 250
	ssh_timeout    = 250
	sql_timeout    = 250
	dns_timeout    = 500
	web_timeout    = 1500
)

var (
	// Get the random seed for any random operations
	randseed int
)

var ScoringDispatch = map[string]func(service enum.Service, address string) (int, bool, error){
	//"ftp": ScoreFTP,.
	// add more as needed
	"ftp":        ScoreFTP,        // General FTP (if the connection exists)
	"ftplogin":   ScoreFTPLogin,   // Login
	"ftpread":    ScoreFTPRead,    // Reading files
	"ftpwrite":   ScoreFTPWrite,   // Writing files
	"ssh":        ScoreSSHLogin,   // Logging in with SSH
	"web80":      ScoreWeb80,      // Insecure connections
	"webssl":     ScoreWebSSLTLS,  // Secure connections
	"webcontent": ScoreWebContent, // Check content against prepared content
}

func Initalize() {
	// Set the random seed for any random operations
	rand.Seed((uint64)(time.Now().Unix()))
}

// ChooseRandomUser reads the file at `dir`, which contains lines
// formatted as "username:password", picks one user at random, and
// returns the parsed username and password.
func ChooseRandomUser(dir string) (string, string, error) {
	data, err := os.ReadFile(dir)
	if err != nil {
		return "", "", fmt.Errorf("could not read users file: %v", err)
	}

	lines := strings.Split(string(data), "\n")
	var validLines []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			validLines = append(validLines, line)
		}
	}

	if len(validLines) == 0 {
		return "", "", fmt.Errorf("no valid 'username:password' lines in %s", dir)
	}

	randomIndex := rand.Intn(len(validLines))
	userLine := validLines[randomIndex]

	// Parse username and password
	parts := strings.SplitN(userLine, ":", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid user format: %s", userLine)
	}
	username := parts[0]
	password := parts[1]

	return username, password, nil
}
