package services

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"github.com/LTSEC/NEST/enum"
	"github.com/jlaffaye/ftp"
	"golang.org/x/exp/rand"
)

var (
	ftpFiles    = make(map[string][]byte)
	ftpLoadOnce sync.Once
)

// establishFTPConnection is a utility function that attempts to connect to the designated ip
// address at the designated port with the FTP protocol, and returns the connection or an error.
func establishFTPConnection(ip string, port int) (ftp.ServerConn, error) {
	connection, err := ftp.Dial(
		fmt.Sprintf("%s:%d", ip, port),
		ftp.DialWithTimeout(ftp_timeout*time.Millisecond),
	)

	return *connection, err
}

// loadFTPFiles is a utility function that loads a files or all the files in a directory into memory
// for use in scoring. The function uses sync to only run one time, when it initially called.
func LoadFTPFiles(path string) error {
	var err error

	// Ensure it can only be run once
	ftpLoadOnce.Do(func() {
		// Check if path is a file or a directory
		info, statErr := os.Stat(path)
		if statErr != nil {
			err = fmt.Errorf("failed to stat %s: %v", path, statErr)
			return
		}

		if info.IsDir() {
			// Process directory
			entries, e := os.ReadDir(path)
			if e != nil {
				err = fmt.Errorf("failed to read directory %s: %v", path, e)
				return
			}

			// Read all files in the directory
			for _, entry := range entries {
				if entry.IsDir() {
					continue // Skip subdirectories
				}
				filePath := path + "/" + entry.Name()
				if readErr := readAndStoreFile(filePath, entry.Name()); readErr != nil {
					err = readErr
					return
				}
			}
		} else {
			// Process a single file
			err = readAndStoreFile(path, info.Name())
		}
	})

	return err
}

// Helper function to read a file and store it in ftpFiles
func readAndStoreFile(filePath, fileName string) error {
	data, readErr := os.ReadFile(filePath)
	if readErr != nil {
		return fmt.Errorf("failed to read file %s: %v", filePath, readErr)
	}
	ftpFiles[fileName] = data
	return nil
}

// Helper function to pick a random file from ftpFiles
func getRandomFile() string {
	var fileNames []string
	for name := range ftpFiles {
		fileNames = append(fileNames, name)
	}
	randomIndex := rand.Intn(len(fileNames))
	randomFile := fileNames[randomIndex]

	return randomFile
}

// ScoreFTP is a general scorer for FTP that checks for a valid FTP connection and then returns
func ScoreFTP(service enum.Service, address string) (int, bool, error) {
	ftpConn, err := establishFTPConnection(address, service.Port)
	if err != nil {
		return 0, false, err
	}

	if quitErr := ftpConn.Quit(); quitErr != nil {
		return 0, false, fmt.Errorf("quit error: %v", quitErr)
	}

	return service.Award, true, nil
}

// ScoreFTPLogin is a scorer for FTP that checks for if the user can log in
func ScoreFTPLogin(service enum.Service, address string) (int, bool, error) {
	ftpConn, err := establishFTPConnection(address, service.Port)
	if err != nil {
		return 0, false, err
	}

	var user, pass string
	// Check if the login user should be a single user
	if service.User != "" {
		user, pass = service.User, service.Password
	} else { // Otherwise read from the related query file
		// Login
		user, pass, err = ChooseRandomUser(service.QFile)
		if err != nil {
			return 0, false, err
		}
	}

	// Login
	err = ftpConn.Login(user, pass)
	if err != nil {
		return 0, false, fmt.Errorf("failed to log in: %v", err)
	}

	// Logout
	if err = ftpConn.Quit(); err != nil {
		return 0, false, fmt.Errorf("failed to log out: %v", err)
	}

	return service.Award, true, nil
}

// ScoreFTPWrite is a scorer for FTP that checks for if the user can write to a/many file(s).
//
// Requires `service.QDir` to be a directory of files expected to be in the FTP server.
func ScoreFTPWrite(service enum.Service, address string) (int, bool, error) {
	LoadFTPFiles(service.QDir)
	// Ensure we actually have test files loaded
	if len(ftpFiles) == 0 {
		return 0, false, fmt.Errorf("no FTP test files available; did you include any in tests/ftpfiles?")
	}

	ftpConn, err := establishFTPConnection(address, service.Port)
	if err != nil {
		return 0, false, err
	}

	var user, pass string
	// Check if the login user should be a single user
	if service.User != "" {
		user, pass = service.User, service.Password
	} else { // Otherwise read from the related query file
		// Login
		user, pass, err = ChooseRandomUser(service.QFile)
		if err != nil {
			return 0, false, err
		}
	}

	err = ftpConn.Login(user, pass)
	if err != nil {
		return 0, false, fmt.Errorf("failed to login: %v", err)
	}

	// Get a random file, get the file's local contents, and convert to an io.Reader
	randomFile := getRandomFile()
	randomFileBytes := ftpFiles[randomFile]
	dataReader := bytes.NewBuffer(randomFileBytes)

	// Upload/Overwrite file on server
	err = ftpConn.Stor(randomFile, dataReader)
	if err != nil {
		return 0, false, err
	}

	// Logout
	if err = ftpConn.Quit(); err != nil {
		return 0, false, fmt.Errorf("failed to log out: %v", err)
	}

	return service.Award, true, nil
}

// ScoreFTPRead is a scorer for FTP that checks for if the user can read from a/many file(s).
//
// Requires `service.QDir` to be a directory of files expected to be in the FTP server.
func ScoreFTPRead(service enum.Service, address string) (int, bool, error) {
	LoadFTPFiles(service.QDir)
	// Ensure we actually have test files loaded
	if len(ftpFiles) == 0 {
		return 0, false, fmt.Errorf("no FTP test files available; did you include any in tests/ftpfiles?")
	}

	ftpConn, err := establishFTPConnection(address, service.Port)
	if err != nil {
		return 0, false, err
	}

	var user, pass string
	// Check if the login user should be a single user
	if service.User != "" {
		user, pass = service.User, service.Password
	} else { // Otherwise read from the related query file
		// Login
		user, pass, err = ChooseRandomUser(service.QFile)
		if err != nil {
			return 0, false, err
		}
	}

	err = ftpConn.Login(user, pass)
	if err != nil {
		return 0, false, fmt.Errorf("failed to login: %v", err)
	}

	randomFile := getRandomFile()

	// Retrieve the randomly chosen file
	result, err := ftpConn.Retr(randomFile)
	if err != nil {
		return 0, false, err
	}
	defer result.Close()

	// Read the FTP file contents
	buf, err := io.ReadAll(result)
	if err != nil {
		return 0, false, err
	}

	// Logout
	if quitErr := ftpConn.Quit(); quitErr != nil {
		return 0, false, err
	}

	// Compare with our locally stored version
	expected := ftpFiles[randomFile]
	if !bytes.Equal(buf, expected) {
		return 0, false, err
	}

	return service.Award, true, nil
}
