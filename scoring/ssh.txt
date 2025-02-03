package scoring

import (
	"fmt"
	"math/rand"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

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

	// Pick a random line
	rand.Seed(time.Now().UnixNano()) // Seed RNG once; do it here or in init()
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

// SSHConnect attempts an SSH connection using a random user
// from `users.txt` (pointed to by `dir`).
func SSHConnect(hostname, port, dir string) (bool, error) {
	username, password, err := ChooseRandomUser(dir)
	if err != nil {
		return false, fmt.Errorf("failed to choose random user: %v", err)
	}

	conf := &ssh.ClientConfig{
		User:            username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // ignoring host keys for now
		Auth: []ssh.AuthMethod{
			ssh.Password(password),
		},
		Timeout: 250 * time.Millisecond,
	}

	hostAddr := hostname + ":" + port
	conn, err := ssh.Dial("tcp", hostAddr, conf)
	if err != nil {
		return false, fmt.Errorf("failed SSH dial: %v", err)
	}
	defer conn.Close()

	session, err := conn.NewSession()
	if err != nil {
		return false, fmt.Errorf("failed to start SSH session: %v", err)
	}
	defer session.Close()

	return true, nil
}

// ScoreSSH tries to SSH using the above method.
// If it succeeds, returns some success points, else 0 + error.
func ScoreSSH(address string, portNum int, dir string) (int, bool, error) {
	ok, err := SSHConnect(address, fmt.Sprintf("%d", portNum), dir)
	if err != nil {
		return 0, false, fmt.Errorf("SSH scoring failed: %v", err)
	}

	if ok {
		return successPoints, true, nil
	}
	return 0, false, nil
}
