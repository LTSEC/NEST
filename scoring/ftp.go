package scoring

import (
	"fmt"
	"io"
	"time"

	"github.com/jlaffaye/ftp"
)

// Attempts a connection via FTP and returns a boolean value representing success
func ftpConnect(address string, portNum int, username string, password string) (string, error) {
	connection, err := ftp.Dial(fmt.Sprint(address, ":", portNum), ftp.DialWithTimeout(250*time.Millisecond))
	if err != nil {
		return "", err
	}

	err = connection.Login(username, password)
	if err != nil {
		return "", err
	}

	result, err := connection.Retr("testfile")
	if err != nil {
		return "", err
	}
	defer result.Close()

	buf, err := io.ReadAll(result)

	if err != nil {
		return "", err
	}

	err = connection.Quit()

	if err != nil {
		return "", err
	}

	return string(buf), nil
}

// ScoreFTP uses FTPConnect to check service availability and assigns points.
func ScoreFTP(address string, portNum int, username string, password string) (int, bool, error) {
	_, err := ftpConnect(address, portNum, username, password)
	if err != nil {
		return 0, false, fmt.Errorf("FTP scoring failed: %v", err)
	}

	return successPoints, true, nil
}
