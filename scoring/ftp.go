package scoring

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"os"
	"sync"
	"time"

	"github.com/jlaffaye/ftp"
)

var ftpFiles = make(map[string][]byte)
var ftpLoadOnce sync.Once

// Load the FTP files into memory once
func ftp_startup(dir string) error {
	var err error

	ftpLoadOnce.Do(func() {
		// Read the directory contents
		entries, e := os.ReadDir(dir)
		if e != nil {
			err = fmt.Errorf("failed to read directory %s: %v", dir, e)
			return
		}

		// For each file in the directory, read its contents into memory.
		for _, entry := range entries {
			if entry.IsDir() {
				// Skip subdirectories
				continue
			}
			filePath := dir + "/" + entry.Name()
			data, readErr := os.ReadFile(filePath)
			if readErr != nil {
				err = fmt.Errorf("failed to read file %s: %v", filePath, readErr)
				return
			}

			// Store in the global dictionary
			ftpFiles[entry.Name()] = data
		}
	})

	return err
}

// Attempts a connection via FTP and returns a boolean value representing success
func ftpConnect(address string, portNum int, username string, password string) (string, error) {
	// Ensure we actually have test files loaded
	if len(ftpFiles) == 0 {
		return "", errors.New("no FTP test files available; did you include any in tests/ftpfiles?")
	}

	// Randomly pick one filename from our global ftpFiles map
	rand.Seed(time.Now().UnixNano()) // seed RNG once per run; or do this in an init()
	var fileNames []string
	for name := range ftpFiles {
		fileNames = append(fileNames, name)
	}
	randomIndex := rand.Intn(len(fileNames))
	randomFile := fileNames[randomIndex]

	// Dial FTP
	connection, err := ftp.Dial(
		fmt.Sprintf("%s:%d", address, portNum),
		ftp.DialWithTimeout(250*time.Millisecond),
	)
	if err != nil {
		return "", fmt.Errorf("failed to dial FTP: %v", err)
	}

	// Login
	err = connection.Login(username, password)
	if err != nil {
		return "", fmt.Errorf("failed to login: %v", err)
	}

	// Retrieve the randomly chosen file
	result, err := connection.Retr(randomFile)
	if err != nil {
		return "", fmt.Errorf("retr error for file %q: %v", randomFile, err)
	}
	defer result.Close()

	// Read the FTP file contents
	buf, err := io.ReadAll(result)
	if err != nil {
		return "", fmt.Errorf("failed to read file %q: %v", randomFile, err)
	}

	// Logout
	if quitErr := connection.Quit(); quitErr != nil {
		return "", fmt.Errorf("quit error: %v", quitErr)
	}

	// Compare with our locally stored version
	expected := ftpFiles[randomFile]
	if !bytes.Equal(buf, expected) {
		return "", fmt.Errorf("content mismatch for file %q", randomFile)
	}

	// Return the file contents if all is well
	return string(buf), nil
}

// ScoreFTP uses FTPConnect to check service availability and assigns points.
func ScoreFTP(dir string, address string, portNum int) (int, bool, error) {
	ftp_startup(dir) // Load in files at startup
	username, password, err := ChooseRandomUser(dir)
	if err != nil {
		return 0, false, fmt.Errorf("FTP scoring failed: failed to choose random user: %v", err)
	}

	_, err = ftpConnect(address, portNum, username, password)
	if err != nil {
		return 0, false, fmt.Errorf("FTP scoring failed: %v", err)
	}

	return successPoints, true, nil
}
